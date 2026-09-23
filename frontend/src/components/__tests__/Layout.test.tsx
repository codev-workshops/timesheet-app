import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../Layout';
import { AuthContext, type AuthContextType } from '../../contexts/AuthContextValue';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const buildAuth = (overrides: Partial<AuthContextType> = {}): AuthContextType => ({
  user: { email: 'alice@example.com', createdAt: '2024-01-01T00:00:00Z' },
  login: vi.fn(),
  logout: vi.fn(),
  isLoading: false,
  isAuthenticated: true,
  ...overrides,
});

const renderLayout = (path = '/dashboard', auth: AuthContextType = buildAuth()) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Layout>
          <div>page content</div>
        </Layout>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe('Layout', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders children, brand, and navigation items', () => {
    renderLayout();
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getAllByText('Time Tracker').length).toBeGreaterThan(0);
    for (const label of ['Clients', 'Work Entries', 'Reports']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('shows the current page title from the route', () => {
    renderLayout('/reports');
    expect(within(screen.getByRole('banner')).getByText('Reports')).toBeInTheDocument();
  });

  it('falls back to "Time Tracker" for an unknown route', () => {
    renderLayout('/unknown');
    expect(within(screen.getByRole('banner')).getByText('Time Tracker')).toBeInTheDocument();
  });

  it('shows the user email and avatar initial', () => {
    renderLayout();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders without crashing when there is no user', () => {
    renderLayout('/dashboard', buildAuth({ user: null, isAuthenticated: false }));
    expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
  });

  it('navigates when a menu item is clicked', () => {
    renderLayout();
    fireEvent.click(screen.getAllByText('Clients')[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/clients');
  });

  it('calls logout when the Logout button is clicked', () => {
    const auth = buildAuth();
    renderLayout('/dashboard', auth);
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('toggles the mobile drawer via the menu button', () => {
    renderLayout();
    const toggle = screen.getByLabelText('open drawer');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toBeInTheDocument();
  });
});
