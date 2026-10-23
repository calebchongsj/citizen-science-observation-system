import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase auth so CurrentUserProvider gets a user and fetches role
const mockAuthUser = {
  uid: 'test-uid',
  email: 'test@test.com',
  getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
};
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: mockAuthUser,
    onAuthStateChanged: (cb: (u: unknown) => void) => {
      cb(mockAuthUser);
      return () => {};
    },
  },
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

// Mock localStorage
const localStorageMock: Storage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});
