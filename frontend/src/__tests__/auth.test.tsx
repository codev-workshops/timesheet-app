import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, renderHook } from '@testing-library/react';
import { Button } from '@mui/material';
import { AuthProvider } from '../contexts/AuthContext';
import { useAuth } from '../hooks/useAuth';

vi.mock('../api/client', () => ({
  default: { getCurrentUser: vi.fn(), login: vi.fn() },
}));

import apiClient from '../api/client';
const mockedApi = vi.mocked(apiClient);

const Probe = () => {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
      <Button onClick={() => login('new@example.com').catch(() => {})}>login</Button>
      <Button onClick={logout}>logout</Button>
    </div>
  );
};

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('useAuth throws outside a provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider');
  });

  test('with no stored email it finishes loading unauthenticated without calling the API', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(mockedApi.getCurrentUser).not.toHaveBeenCalled();
  });

  test('restores the session from localStorage via /api/auth/me', async () => {
    localStorage.setItem('userEmail', 'stored@example.com');
    mockedApi.getCurrentUser.mockResolvedValue({ user: { email: 'stored@example.com', createdAt: 'x' } });

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    expect(screen.getByTestId('email')).toHaveTextContent('stored@example.com');
  });

  test('drops a stale stored email when /me fails', async () => {
    localStorage.setItem('userEmail', 'stale@example.com');
    mockedApi.getCurrentUser.mockRejectedValue(new Error('401'));

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(localStorage.getItem('userEmail')).toBeNull();
  });

  test('login stores the email and sets the user; logout clears both', async () => {
    mockedApi.login.mockResolvedValue({ user: { email: 'new@example.com', createdAt: 'x' } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await act(async () => { screen.getByText('login').click(); });
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    expect(mockedApi.login).toHaveBeenCalledWith('new@example.com');
    expect(localStorage.getItem('userEmail')).toBe('new@example.com');

    await act(async () => { screen.getByText('logout').click(); });
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(localStorage.getItem('userEmail')).toBeNull();
  });

  test('failed login rethrows and stores nothing', async () => {
    mockedApi.login.mockRejectedValue(new Error('nope'));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await act(async () => { screen.getByText('login').click(); });

    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(localStorage.getItem('userEmail')).toBeNull();
    expect(console.error).toHaveBeenCalledWith('Login failed:', expect.any(Error));
  });
});
