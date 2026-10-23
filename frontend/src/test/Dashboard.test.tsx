/**
 * DISCLAIMER: This is a reference test file for students.
 *     These tests may break as you modify the Dashboard component.
 *     Update or remove tests as needed when making changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from './test-utils';
import Dashboard from '../pages/Dashboard';
import type { User } from 'firebase/auth';

// Mock the API service (getCurrentUser required by CurrentUserProvider)
vi.mock('../api', () => ({
  RafflesGoService: {
    getCurrentUser: vi.fn().mockResolvedValue({
      uid: 'test-uid-123',
      email: 'john@example.com',
      role: 'user',
    }),
  },
}));

// Mock child components to isolate unit testing
vi.mock('../components/Navigation', () => ({
  Navigation: () => <nav data-testid="navigation">Nav</nav>,
}));

const mockUser: Partial<User> = {
  displayName: 'John Doe',
  email: 'john@example.com',
  uid: 'test-uid-123',
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Basic rendering and querying DOM elements
  it('renders welcome message with user name', () => {
    render(<Dashboard user={mockUser as User} />);

    expect(screen.getByText(/welcome back,/i)).toBeInTheDocument();
    expect(screen.getByText('John Doe!')).toBeInTheDocument();
    expect(screen.getByTestId('navigation')).toBeInTheDocument();
  });

  // Test 2: No redundant hello pill
  it('does not render a separate hello message pill', async () => {
    render(<Dashboard user={mockUser as User} />);

    await waitFor(() => {
      expect(screen.queryByText(/hello,\s*john doe/i)).not.toBeInTheDocument();
    });
  });

  // Test 3: Testing with different props (edge case)
  it('falls back to "Volunteer" when user has no display name', () => {
    render(<Dashboard user={{ ...mockUser, displayName: null } as User} />);

    expect(screen.getByText('Volunteer!')).toBeInTheDocument();
  });
});
