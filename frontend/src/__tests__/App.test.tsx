import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

vi.mock('../api/client', () => ({
  default: {
    getCurrentUser: vi.fn(),
    getClients: vi.fn(async () => ({ clients: [] })),
    getWorkEntries: vi.fn(async () => ({ workEntries: [] })),
  },
}));

import apiClient from '../api/client';
const api = vi.mocked(apiClient);

describe('App routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  test('unauthenticated visitors are redirected to the login page', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Log In' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  test('a stored session lands on the dashboard inside the Layout', async () => {
    localStorage.setItem('userEmail', 'me@example.com');
    api.getCurrentUser.mockResolvedValue({ user: { email: 'me@example.com', createdAt: 'x' } });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });
});
