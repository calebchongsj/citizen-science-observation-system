import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../services/user.service';
import type { UserRepository } from '../repositories/user.repository';
import type { User } from '../schemas/user.schema';

const notificationMocks = vi.hoisted(() => ({
  sendWelcomeEmail: vi.fn(),
  sendAdminNewUserReviewEmail: vi.fn(),
}));

vi.mock('../services/user-notification.service', () => ({
  sendWelcomeEmail: notificationMocks.sendWelcomeEmail,
  sendAdminNewUserReviewEmail: notificationMocks.sendAdminNewUserReviewEmail,
}));

const participationServiceMocks = vi.hoisted(() => ({
  reassignGroupLeadersBeforeUserDeactivation: vi.fn(),
}));

vi.mock('../modules/participation/participation.service', () => ({
  reassignGroupLeadersBeforeUserDeactivation:
    participationServiceMocks.reassignGroupLeadersBeforeUserDeactivation,
}));

/**
 * UserService Unit Tests
 * 
 * Demonstrates Dependency Injection (DI) for testing:
 * - UserService receives UserRepository via constructor
 * - We inject a mock repository to test service logic in isolation
 * - No Firebase calls needed - tests are fast and reliable
 */
describe('UserService', () => {
  let mockUserRepository: {
    findAll: ReturnType<typeof vi.fn>;
    setRoleByEmail: ReturnType<typeof vi.fn>;
    ensureOnboardingRecord: ReturnType<typeof vi.fn>;
    markWelcomeEmailsSent: ReturnType<typeof vi.fn>;
    findByUid: ReturnType<typeof vi.fn>;
    setDisabledByUid: ReturnType<typeof vi.fn>;
  };
  let userService: UserService;

  beforeEach(() => {
    // Create mock repository
    mockUserRepository = {
      findAll: vi.fn(),
      setRoleByEmail: vi.fn(),
      ensureOnboardingRecord: vi.fn(),
      markWelcomeEmailsSent: vi.fn(),
      findByUid: vi.fn(),
      setDisabledByUid: vi.fn(),
    };

    notificationMocks.sendWelcomeEmail.mockReset();
    notificationMocks.sendAdminNewUserReviewEmail.mockReset();
    participationServiceMocks.reassignGroupLeadersBeforeUserDeactivation.mockReset();

    // Inject mock into service - this is DI in action!
    userService = new UserService(mockUserRepository as unknown as UserRepository);
  });

  describe('getAllUsers', () => {
    it('should return users from repository', async () => {
      const mockUsers: User[] = [
        { uid: '1', email: 'alice@test.com', disabled: false, role: 'admin' },
        { uid: '2', email: 'bob@test.com', disabled: false, role: 'user' },
      ];
      mockUserRepository.findAll.mockResolvedValue(mockUsers);

      const result = await userService.getAllUsers();

      expect(result).toEqual(mockUsers);
      expect(mockUserRepository.findAll).toHaveBeenCalledOnce();
    });

    it('should return empty array when no users', async () => {
      mockUserRepository.findAll.mockResolvedValue([]);

      const result = await userService.getAllUsers();

      expect(result).toEqual([]);
    });
  });

  describe('changeRole', () => {
    it('should update role and return success response', async () => {
      mockUserRepository.setRoleByEmail.mockResolvedValue(undefined);

      const result = await userService.changeRole('alice@test.com', 'admin');

      expect(result).toEqual({
        success: true,
        email: 'alice@test.com',
        role: 'admin',
      });
      expect(mockUserRepository.setRoleByEmail).toHaveBeenCalledWith('alice@test.com', 'admin');
    });

    it('should propagate errors from repository', async () => {
      mockUserRepository.setRoleByEmail.mockRejectedValue(new Error('User not found'));

      await expect(userService.changeRole('nobody@test.com', 'admin'))
        .rejects.toThrow('User not found');
    });
  });

  describe('ensureUserOnboarded', () => {
    it('sends welcome and admin emails for a new user', async () => {
      const user: User = {
        uid: 'u1',
        email: 'new@test.com',
        displayName: 'New User',
        disabled: false,
        role: 'user',
      };
      mockUserRepository.ensureOnboardingRecord.mockResolvedValue({
        isNewUser: true,
        record: { uid: 'u1', createdAt: '2026-04-01T00:00:00.000Z' },
        user,
      });

      await userService.ensureUserOnboarded('u1');

      expect(notificationMocks.sendWelcomeEmail).toHaveBeenCalledWith(user);
      expect(notificationMocks.sendAdminNewUserReviewEmail).toHaveBeenCalledWith(user);
      expect(mockUserRepository.markWelcomeEmailsSent).toHaveBeenCalledWith('u1');
    });

    it('does nothing for returning users', async () => {
      mockUserRepository.ensureOnboardingRecord.mockResolvedValue({
        isNewUser: false,
        record: { uid: 'u1', createdAt: '2026-04-01T00:00:00.000Z' },
        user: { uid: 'u1', email: 'existing@test.com', disabled: false, role: 'user' },
      });

      await userService.ensureUserOnboarded('u1');

      expect(notificationMocks.sendWelcomeEmail).not.toHaveBeenCalled();
      expect(notificationMocks.sendAdminNewUserReviewEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.markWelcomeEmailsSent).not.toHaveBeenCalled();
    });
  });

  describe('setUserDisabled', () => {
    it('reassigns designated submitter duties before disabling a volunteer', async () => {
      mockUserRepository.findByUid.mockResolvedValue({
        uid: 'u2',
        email: 'volunteer@test.com',
        disabled: false,
        role: 'user',
      });
      mockUserRepository.setDisabledByUid.mockResolvedValue(undefined);

      const result = await userService.setUserDisabled('admin-1', 'u2', true);

      expect(participationServiceMocks.reassignGroupLeadersBeforeUserDeactivation)
        .toHaveBeenCalledWith('u2');
      expect(mockUserRepository.setDisabledByUid).toHaveBeenCalledWith('u2', true);
      expect(result).toEqual({ success: true, uid: 'u2', disabled: true });
    });
  });
});
