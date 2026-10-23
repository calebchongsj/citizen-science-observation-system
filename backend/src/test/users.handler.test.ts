import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listUsersHandler, changeRoleHandler } from '../handlers/users.handler';
import { setContainer, resetContainer, Container } from '../container';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserRepository } from '../repositories/user.repository';

/**
 * Handler Unit Tests
 * 
 * Demonstrates testing handlers by injecting a mock container:
 * - Use setContainer() to inject mock services
 * - Handlers get mocks via getContainer() 
 * - Test handler logic without touching Firebase
 */
describe('Users Handlers', () => {
  let mockUserService: {
    getAllUsers: ReturnType<typeof vi.fn>;
    changeRole: ReturnType<typeof vi.fn>;
    ensureUserOnboarded: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create mock service
    mockUserService = {
      getAllUsers: vi.fn(),
      changeRole: vi.fn(),
      ensureUserOnboarded: vi.fn(),
    };

    // Inject mock container - handlers will use this!
    setContainer({
      userService: mockUserService,
      userRepository: {} as unknown as UserRepository, // Not used by handlers directly
    } as Container);
  });

  afterEach(() => {
    // Reset container after each test
    resetContainer();
  });

  describe('listUsersHandler', () => {
    it('should return users from service', async () => {
      const mockUsers = [
        { uid: '1', email: 'alice@test.com', disabled: false, role: 'admin' },
        { uid: '2', email: 'bob@test.com', disabled: false, role: 'user' },
      ];
      mockUserService.getAllUsers.mockResolvedValue(mockUsers);

      const result = await listUsersHandler(
        {} as FastifyRequest,
        {} as FastifyReply
      );

      expect(result).toEqual({ users: mockUsers });
      expect(mockUserService.getAllUsers).toHaveBeenCalledOnce();
    });

    it('should return empty users array', async () => {
      mockUserService.getAllUsers.mockResolvedValue([]);

      const result = await listUsersHandler(
        {} as FastifyRequest,
        {} as FastifyReply
      );

      expect(result).toEqual({ users: [] });
    });
  });

  describe('changeRoleHandler', () => {
    it('should call service with email and role from body', async () => {
      mockUserService.changeRole.mockResolvedValue({
        success: true,
        email: 'alice@test.com',
        role: 'admin',
      });

      const mockRequest = {
        body: { email: 'alice@test.com', role: 'admin' },
      } as FastifyRequest;

      const result = await changeRoleHandler(mockRequest, {} as FastifyReply);

      expect(result).toEqual({
        success: true,
        email: 'alice@test.com',
        role: 'admin',
      });
      expect(mockUserService.changeRole).toHaveBeenCalledWith('alice@test.com', 'admin');
    });

    it('should propagate service errors', async () => {
      mockUserService.changeRole.mockRejectedValue(new Error('User not found'));

      const mockRequest = {
        body: { email: 'nobody@test.com', role: 'admin' },
      } as FastifyRequest;

      await expect(changeRoleHandler(mockRequest, {} as FastifyReply))
        .rejects.toThrow('User not found');
    });
  });

  describe('meHandler', () => {
    it('ensures onboarding before returning current user', async () => {
      const { meHandler } = await import('../handlers/users.handler');
      const mockRequest = {
        user: {
          uid: 'u1',
          email: 'volunteer@test.com',
          role: 'user',
        },
      } as FastifyRequest;

      const result = await meHandler(mockRequest, {} as FastifyReply);

      expect(mockUserService.ensureUserOnboarded).toHaveBeenCalledWith('u1');
      expect(result).toEqual({
        uid: 'u1',
        email: 'volunteer@test.com',
        role: 'user',
      });
    });
  });
});
