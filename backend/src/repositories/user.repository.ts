import { auth } from '../lib/firebase-admin';
import { db } from '../lib/firebase-admin';
import { User, UserOnboardingRecord, UserStats } from '../schemas/user.schema';
import { config, Role, RoleSchema } from '../config';
import { Value } from '@sinclair/typebox/value';
import { FIRESTORE_COLLECTIONS } from '../lib/firestore-collections';
import { WalkStatus } from '../modules/walks/walk.types';

export class UserRepository {
  private mapAuthUser(user: Awaited<ReturnType<typeof auth.getUser>>): User {
    // Safely validate role from custom claims
    const customRole = user.customClaims?.role;
    const roleFromClaims: Role = Value.Check(RoleSchema, customRole) ? customRole : 'user';
    const isAccountDisabledClaim = user.customClaims?.account_disabled === true;
    const email = user.email?.toLowerCase();
    const isAdminEmail = email
      ? config.adminEmails.map((adminEmail) => adminEmail.toLowerCase()).includes(email)
      : false;
    const role: Role = roleFromClaims === 'admin' || isAdminEmail ? 'admin' : 'user';

    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      // Use soft-disable via custom claims while still honoring legacy hard-disabled users.
      disabled: user.disabled || isAccountDisabledClaim,
      createdAt: user.metadata.creationTime,
      role,
    };
  }

  async findAll(): Promise<User[]> {
    const listResult = await auth.listUsers();
    return listResult.users.map((user) => this.mapAuthUser(user));
  }

  async setRoleByEmail(email: string, role: Role): Promise<void> {
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, { role });
  }

  async setDisabledByUid(uid: string, disabled: boolean): Promise<void> {
    const user = await auth.getUser(uid);
    const nextClaims = {
      ...(user.customClaims ?? {}),
      account_disabled: disabled,
    };
    await auth.setCustomUserClaims(uid, nextClaims);
    // Ensure sign-in remains possible; deactivation is enforced by backend middleware.
    await auth.updateUser(uid, { disabled: false });
  }

  async findByUid(uid: string): Promise<User> {
    const user = await auth.getUser(uid);
    return this.mapAuthUser(user);
  }

  async ensureOnboardingRecord(uid: string): Promise<{
    isNewUser: boolean;
    record: UserOnboardingRecord;
    user: User;
  }> {
    const authUser = await auth.getUser(uid);
    const mappedUser = this.mapAuthUser(authUser);
    const userRef = db.collection(FIRESTORE_COLLECTIONS.USERS).doc(uid);
    const snapshot = await userRef.get();

    if (snapshot.exists) {
      return {
        isNewUser: false,
        record: snapshot.data() as UserOnboardingRecord,
        user: mappedUser,
      };
    }

    const record: UserOnboardingRecord = {
      uid,
      email: mappedUser.email,
      displayName: mappedUser.displayName,
      createdAt: new Date().toISOString(),
    };

    await userRef.set(record);

    return {
      isNewUser: true,
      record,
      user: mappedUser,
    };
  }

  async markWelcomeEmailsSent(uid: string): Promise<void> {
    await db.collection(FIRESTORE_COLLECTIONS.USERS).doc(uid).set(
      {
        welcomeEmailSentAt: new Date().toISOString(),
        adminReviewEmailSentAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  async getAllUserStats(): Promise<Record<string, UserStats>> {
    const [walksSnapshot, participationsSnapshot, sightingsSnapshot] = await Promise.all([
      db.collection(FIRESTORE_COLLECTIONS.WALKS).get(),
      db.collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS).get(),
      db.collection(FIRESTORE_COLLECTIONS.SIGHTINGS).get(),
    ]);

    const walkStatusById = new Map<string, WalkStatus | undefined>();
    walksSnapshot.docs.forEach((doc) => {
      const status = doc.data()?.status as WalkStatus | undefined;
      walkStatusById.set(doc.id, status);
    });

    const statsByUid: Record<string, UserStats> = {};
    const ensureStats = (uid: string): UserStats => {
      if (!statsByUid[uid]) {
        statsByUid[uid] = {
          walks_registered: 0,
          upcoming_walks: 0,
          completed_walks: 0,
          sightings_submitted: 0,
        };
      }
      return statsByUid[uid];
    };

    participationsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const uid = data?.user_id as string | undefined;
      const walkId = data?.walk_id as string | undefined;
      if (!uid || !walkId) return;
      const stats = ensureStats(uid);
      stats.walks_registered += 1;

      const status = walkStatusById.get(walkId);
      if (status === WalkStatus.UPCOMING || status === WalkStatus.IN_PROGRESS) {
        stats.upcoming_walks += 1;
      } else if (status === WalkStatus.COMPLETED) {
        stats.completed_walks += 1;
      }
    });

    sightingsSnapshot.docs.forEach((doc) => {
      const uid = doc.data()?.recorded_by_user_id as string | undefined;
      if (!uid) return;
      const stats = ensureStats(uid);
      stats.sightings_submitted += 1;
    });

    return statsByUid;
  }

  async getWalkStatusTotals(): Promise<{
    total_existing_walks: number;
    total_upcoming_walks: number;
    total_completed_walks: number;
    total_abandoned_walks: number;
  }> {
    const walksSnapshot = await db.collection(FIRESTORE_COLLECTIONS.WALKS).get();
    const totals = {
      total_existing_walks: walksSnapshot.size,
      total_upcoming_walks: 0,
      total_completed_walks: 0,
      total_abandoned_walks: 0,
    };

    walksSnapshot.docs.forEach((doc) => {
      const status = doc.data()?.status as WalkStatus | undefined;
      if (status === WalkStatus.UPCOMING || status === WalkStatus.IN_PROGRESS) {
        totals.total_upcoming_walks += 1;
      } else if (status === WalkStatus.COMPLETED) {
        totals.total_completed_walks += 1;
      } else if (status === WalkStatus.ABANDONED) {
        totals.total_abandoned_walks += 1;
      }
    });

    return totals;
  }
}
