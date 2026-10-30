import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import apiClient from './api/client';

vi.mock('./api/client', () => ({
  default: {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

vi.mock('./pages/LoginPage', () => ({ default: () => <div>Login Page</div> }));
vi.mock('./pages/DashboardPage', () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock('./pages/ClientsPage', () => ({ default: () => <div>Clients Page</div> }));
vi.mock('./pages/WorkEntriesPage', () => ({ default: () => <div>Work Entries Page</div> }));
vi.mock('./pages/ReportsPage', () => ({ default: () => <div>Reports Page</div> }));

const mockedApi = vi.mocked(apiClient);
const user = { email: 'user@example.com', createdAt: '2024-01-01T00:00:00Z' };

const renderAt = (path: string) => {
  window.history.pushState({}, '', path);
  render(<App />);
};

describe('App', () => {
  beforeEach(() => {
    mockedApi.getCurrentUser.mockReset();
  });

  describe('when unauthenticated', () => {
    it('redirects protected routes to /login', async () => {
      renderAt('/dashboard');
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/login');
      expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
    });

    it('renders the login page at /login', async () => {
      renderAt('/login');
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });
  });

  describe('when authenticated', () => {
    beforeEach(() => {
      localStorage.setItem('userEmail', user.email);
      mockedApi.getCurrentUser.mockResolvedValue({ user });
    });

    it('shows a loading state while checking auth', async () => {
      renderAt('/dashboard');
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    });

    it.each([
      ['/dashboard', 'Dashboard Page'],
      ['/clients', 'Clients Page'],
      ['/work-entries', 'Work Entries Page'],
      ['/reports', 'Reports Page'],
    ])('renders %s inside the layout', async (path, text) => {
      renderAt(path);
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByText(user.email)).toBeInTheDocument();
      expect(window.location.pathname).toBe(path);
    });

    it('redirects / to /dashboard', async () => {
      renderAt('/');
      expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/dashboard');
    });

    it('redirects unknown routes to /dashboard', async () => {
      renderAt('/does-not-exist');
      expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/dashboard');
    });
  });
});
