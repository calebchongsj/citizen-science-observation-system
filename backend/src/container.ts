import { UserRepository } from './repositories/user.repository';
import { UserService } from './services/user.service';

export interface Container {
  userRepository: UserRepository;
  userService: UserService;
}

export function createContainer(): Container {
  // Repositories
  const userRepository = new UserRepository();

  // Services
  const userService = new UserService(userRepository);

  return {
    userRepository,
    userService,
  };
}

// Singleton container instance
let container: Container | null = null;

export function getContainer(): Container {
  if (!container) {
    container = createContainer();
  }
  return container;
}

// For testing - allows injecting a mock container
export function setContainer(mockContainer: Container): void {
  container = mockContainer;
}

// For testing - allows resetting the container
export function resetContainer(): void {
  container = null;
}
