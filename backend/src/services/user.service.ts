import { UserRepository } from '../repositories/user.repository';
import {
  User,
  ChangeRoleResponse,
  ListUsersWithStatsResponse,
  UserStats,
} from '../schemas/user.schema';
import { Role } from '../config';
import { ConflictError } from '../lib/errors';
import { reassignGroupLeadersBeforeUserDeactivation } from '../modules/participation/participation.service';
import { sendAdminNewUserReviewEmail, sendWelcomeEmail } from './user-notification.service';

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async ensureUserOnboarded(uid: string): Promise<void> {
    const { isNewUser, user } = await this.userRepository.ensureOnboardingRecord(uid);
    if (!isNewUser) {
      return;
    }

    try {
      await sendWelcomeEmail(user);
      await sendAdminNewUserReviewEmail(user);
      await this.userRepository.markWelcomeEmailsSent(uid);
    } catch (error) {
      console.error('Failed to send new-user onboarding emails', error);
    }
  }

  async changeRole(email: string, role: Role): Promise<ChangeRoleResponse> {
    await this.userRepository.setRoleByEmail(email, role);
    return { success: true, email, role };
  }

  async getUsersWithStats(): Promise<ListUsersWithStatsResponse> {
    const [users, statsByUid, walkStatusTotals] = await Promise.all([
      this.userRepository.findAll(),
      this.userRepository.getAllUserStats(),
      this.userRepository.getWalkStatusTotals(),
    ]);

    const defaultStats: UserStats = {
      walks_registered: 0,
      upcoming_walks: 0,
      completed_walks: 0,
      sightings_submitted: 0,
    };

    const usersWithStats = users.map((user) => ({
      ...user,
      ...(statsByUid[user.uid] ?? defaultStats),
    }));

    const summary = usersWithStats.reduce(
      (acc, user) => {
        acc.total_users += 1;
        acc.total_volunteers += user.role === 'user' ? 1 : 0;
        acc.total_admins += user.role === 'admin' ? 1 : 0;
        acc.total_disabled += user.disabled ? 1 : 0;
        return acc;
      },
      {
        total_users: 0,
        total_volunteers: 0,
        total_admins: 0,
        total_disabled: 0,
        total_existing_walks: walkStatusTotals.total_existing_walks,
        total_upcoming_walks: walkStatusTotals.total_upcoming_walks,
        total_completed_walks: walkStatusTotals.total_completed_walks,
        total_abandoned_walks: walkStatusTotals.total_abandoned_walks,
      },
    );

    return {
      users: usersWithStats,
      summary,
    };
  }

  async setUserDisabled(
    actorUid: string,
    targetUid: string,
    disabled: boolean,
  ): Promise<{ success: true; uid: string; disabled: boolean }> {
    if (actorUid === targetUid && disabled) {
      throw new ConflictError('You cannot deactivate your own account');
    }
    if (disabled) {
      const targetUser = await this.userRepository.findByUid(targetUid);
      if (targetUser.role === 'admin') {
        throw new ConflictError('You cannot deactivate an admin account');
      }
      await reassignGroupLeadersBeforeUserDeactivation(targetUid);
    }
    await this.userRepository.setDisabledByUid(targetUid, disabled);
    return { success: true, uid: targetUid, disabled };
  }
}
