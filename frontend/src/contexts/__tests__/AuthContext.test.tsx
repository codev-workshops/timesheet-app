import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../../hooks/useAuth';

vi.mock('../../api/client', () => ({
  default: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
  },
}));

import apiClient from '../../api/client';

const mockedClient = vi.mocked(apiClient);
const user = { email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z' };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('useAuth throws outside of an AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider');
  });

  test('starts unauthenticated when no email is stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(mockedClient.getCurrentUser).not.toHaveBeenCalled();
  });

  test('restores the session from a stored email', async () => {
    localStorage.setItem('userEmail', user.email);
    mockedClient.getCurrentUser.mockResolvedValue({ user });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('clears the stored email when the session check fails', async () => {
    localStorage.setItem('userEmail', user.email);
    mockedClient.getCurrentUser.mockRejectedValue(new Error('401'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('userEmail')).toBeNull();
  });

  test('login stores the user and email', async () => {
    mockedClient.login.mockResolvedValue({ user });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.login(user.email));

    expect(mockedClient.login).toHaveBeenCalledWith(user.email);
    expect(result.current.user).toEqual(user);
    expect(localStorage.getItem('userEmail')).toBe(user.email);
  });

  test('login rethrows API errors', async () => {
    mockedClient.login.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(act(() => result.current.login(user.email))).rejects.toThrow('boom');
    expect(result.current.user).toBeNull();
  });

  test('logout clears the user and stored email', async () => {
    localStorage.setItem('userEmail', user.email);
    mockedClient.getCurrentUser.mockResolvedValue({ user });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => result.current.logout());

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('userEmail')).toBeNull();
  });

  test('renders children', () => {
    render(<AuthProvider><span>child</span></AuthProvider>);
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
