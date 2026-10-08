import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../../hooks/useAuth';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => ({
  default: {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

const user = { email: 'jane@example.com', createdAt: '2024-01-01T00:00:00.000Z' };

const renderAuth = () => renderHook(() => useAuth(), { wrapper: AuthProvider });

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(apiClient.login).mockReset();
    vi.mocked(apiClient.getCurrentUser).mockReset();
  });

  it('finishes loading unauthenticated when no email is stored', async () => {
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(apiClient.getCurrentUser).not.toHaveBeenCalled();
  });

  it('restores the session from a stored email', async () => {
    localStorage.setItem('userEmail', user.email);
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({ user });

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('drops the stored email when the session check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('userEmail', user.email);
    vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new Error('401'));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('userEmail')).toBeNull();
  });

  it('login stores the user and email', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({ message: 'ok', user });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.login(user.email));

    expect(apiClient.login).toHaveBeenCalledWith(user.email);
    expect(result.current.user).toEqual(user);
    expect(localStorage.getItem('userEmail')).toBe(user.email);
  });

  it('login rethrows failures and stays logged out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('bad email');
    vi.mocked(apiClient.login).mockRejectedValue(error);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(act(() => result.current.login('bad'))).rejects.toBe(error);

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('userEmail')).toBeNull();
  });

  it('logout clears the user and stored email', async () => {
    localStorage.setItem('userEmail', user.email);
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({ user });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => result.current.logout());

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('userEmail')).toBeNull();
  });
});
