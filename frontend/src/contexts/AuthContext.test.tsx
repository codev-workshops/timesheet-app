import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthContext';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);
const user = { email: 'user@example.com', createdAt: '2024-01-01T00:00:00Z' };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider', () => {
  beforeEach(() => {
    mockedApi.login.mockReset();
    mockedApi.getCurrentUser.mockReset();
  });

  it('finishes loading without calling /me when no email is stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockedApi.getCurrentUser).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('restores the user from /me when an email is stored', async () => {
    localStorage.setItem('userEmail', user.email);
    mockedApi.getCurrentUser.mockResolvedValue({ user });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockedApi.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('clears stored email when /me fails', async () => {
    localStorage.setItem('userEmail', user.email);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedApi.getCurrentUser.mockRejectedValue(new Error('unauthorized'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(localStorage.getItem('userEmail')).toBeNull();
    expect(result.current.user).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('Auth check failed:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('logs in, stores the email and sets the user', async () => {
    mockedApi.login.mockResolvedValue({ user });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login(user.email);
    });

    expect(mockedApi.login).toHaveBeenCalledWith(user.email);
    expect(localStorage.getItem('userEmail')).toBe(user.email);
    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('rethrows login errors without storing the email', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('bad email');
    mockedApi.login.mockRejectedValue(error);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.login('bad')).rejects.toBe(error);
    });

    expect(localStorage.getItem('userEmail')).toBeNull();
    expect(result.current.user).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('Login failed:', error);
    consoleError.mockRestore();
  });

  it('logs out, clearing the user and stored email', async () => {
    localStorage.setItem('userEmail', user.email);
    mockedApi.getCurrentUser.mockResolvedValue({ user });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('userEmail')).toBeNull();
  });
});
