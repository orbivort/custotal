// Unit tests for the auth/instance-bootstrap API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// verb, path, and body a function sends, plus that the decoded response field
// is unwrapped and returned. `ApiError` is kept real so error-classification
// behavior matches production.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstanceInfo, User } from '../../types/domain';
import { fetchInstanceInfo, fetchMe, login, logout } from './authApi';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ApiError: actual.ApiError, api: { get: h.get, post: h.post } };
});

const USER: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };

const INSTANCE: InstanceInfo = {
  orgName: 'Custotal',
  version: '0.1.0',
  environment: 'development',
  hostname: 'localhost',
  allowPasswordReset: true,
  setupRequired: false,
};

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue({});
    h.post.mockResolvedValue({});
  });

  describe('login', () => {
    it('posts credentials to the login endpoint and unwraps the user', async () => {
      h.post.mockResolvedValueOnce({ user: USER });

      const result = await login({ email: 'ada@example.com', password: 'secret' });

      expect(h.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'ada@example.com',
        password: 'secret',
      });
      expect(result).toBe(USER);
    });

    it('serializes an empty password as an empty string body field', async () => {
      h.post.mockResolvedValueOnce({ user: USER });

      await login({ email: 'ada@example.com', password: '' });

      expect(h.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'ada@example.com',
        password: '',
      });
    });

    it('propagates authentication failures to the caller', async () => {
      h.post.mockRejectedValueOnce(new Error('Invalid email or password.'));

      await expect(login({ email: 'ada@example.com', password: 'wrong' })).rejects.toThrow(
        'Invalid email or password.',
      );
    });
  });

  describe('logout', () => {
    it('posts to the logout endpoint with no body', async () => {
      h.post.mockResolvedValueOnce({ ok: true });

      await expect(logout()).resolves.toBeUndefined();

      expect(h.post).toHaveBeenCalledWith('/api/auth/logout');
    });

    it('propagates server failures so session cleanup can decide', async () => {
      h.post.mockRejectedValueOnce(new Error('Session already expired'));

      await expect(logout()).rejects.toThrow('Session already expired');
    });
  });

  describe('fetchMe', () => {
    it('gets the me endpoint and unwraps the user', async () => {
      h.get.mockResolvedValueOnce({ user: USER });

      const result = await fetchMe();

      expect(h.get).toHaveBeenCalledWith('/api/auth/me');
      expect(result).toBe(USER);
    });

    it('propagates anonymous-session failures', async () => {
      h.get.mockRejectedValueOnce(new Error('Not signed in'));

      await expect(fetchMe()).rejects.toThrow('Not signed in');
    });
  });

  describe('fetchInstanceInfo', () => {
    it('gets /api/health and returns the payload as-is (no envelope)', async () => {
      h.get.mockResolvedValueOnce(INSTANCE);

      const result = await fetchInstanceInfo();

      expect(h.get).toHaveBeenCalledWith('/api/health');
      expect(result).toBe(INSTANCE);
    });

    it('propagates failures so the login screen can show the unreachable state', async () => {
      h.get.mockRejectedValueOnce(new Error("Can't reach the server."));

      await expect(fetchInstanceInfo()).rejects.toThrow("Can't reach the server.");
    });
  });
});
