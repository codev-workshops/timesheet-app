import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import apiClient from '../api/client';
import { clients, workEntries } from '../test/fixtures';

vi.mock('../api/client', async () => (await import('../test/apiClientMock')).createApiClientMock());

const user = { email: 'jane@example.com', createdAt: '2024-01-01T00:00:00.000Z' };

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients });
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries });
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({ user });
    vi.mocked(apiClient.login).mockResolvedValue({ message: 'ok', user });
  });

  it('redirects unauthenticated users to the login page', async () => {
    render(<App />);

    expect(await screen.findByText('Enter your email to log in')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('shows a loading state while the session is restored', () => {
    localStorage.setItem('userEmail', user.email);
    vi.mocked(apiClient.getCurrentUser).mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects authenticated users from unknown routes to the dashboard', async () => {
    localStorage.setItem('userEmail', user.email);
    window.history.pushState({}, '', '/does-not-exist');

    render(<App />);

    const banner = await screen.findByRole('banner');
    expect(await within(banner).findByText('Dashboard')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('logs in and lands on the dashboard', async () => {
    render(<App />);

    fireEvent.change(await screen.findByLabelText(/Email Address/), { target: { value: user.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(await screen.findByRole('banner')).toHaveTextContent(user.email);
    expect(apiClient.login).toHaveBeenCalledWith(user.email);
    expect(window.location.pathname).toBe('/dashboard');
  });
});
