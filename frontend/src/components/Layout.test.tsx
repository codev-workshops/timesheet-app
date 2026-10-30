import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './Layout';
import { AuthContext, type AuthContextType } from '../contexts/AuthContextValue';

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderLayout = (initialPath: string, overrides: Partial<AuthContextType> = {}) => {
  const auth: AuthContextType = {
    user: { email: 'jane@example.com', createdAt: '2024-01-01T00:00:00Z' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    isAuthenticated: true,
    ...overrides,
  };
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="*"
              element={
                <Layout>
                  <div>Page content</div>
                  <LocationDisplay />
                </Layout>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return auth;
};

const getAppBarTitle = () => {
  const title = screen.getByRole('banner').querySelector('.MuiTypography-h6');
  if (!title) throw new Error('App bar title not found');
  return title;
};

describe('Layout', () => {
  it('renders children, user info and navigation links', () => {
    renderLayout('/dashboard');
    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('J')).toBeInTheDocument();
    for (const label of ['Dashboard', 'Clients', 'Work Entries', 'Reports']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('shows the current page title and marks the active link selected', () => {
    renderLayout('/clients');
    expect(getAppBarTitle()).toHaveTextContent('Clients');
    const clientButtons = screen.getAllByRole('button', { name: 'Clients' });
    clientButtons.forEach((button) => expect(button).toHaveClass('Mui-selected'));
    screen
      .getAllByRole('button', { name: 'Reports' })
      .forEach((button) => expect(button).not.toHaveClass('Mui-selected'));
  });

  it('falls back to the app name for unknown paths', () => {
    renderLayout('/unknown');
    expect(getAppBarTitle()).toHaveTextContent('Time Tracker');
  });

  it('navigates when a menu item is clicked', async () => {
    const user = userEvent.setup();
    renderLayout('/dashboard');
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');

    await user.click(screen.getAllByRole('button', { name: 'Work Entries' })[0]);
    expect(screen.getByTestId('location')).toHaveTextContent('/work-entries');
    expect(getAppBarTitle()).toHaveTextContent('Work Entries');

    await user.click(screen.getAllByRole('button', { name: 'Reports' })[0]);
    expect(screen.getByTestId('location')).toHaveTextContent('/reports');
  });

  it('calls logout when Logout is clicked', async () => {
    const user = userEvent.setup();
    const auth = renderLayout('/dashboard');
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('toggles the mobile drawer', async () => {
    const user = userEvent.setup();
    renderLayout('/dashboard');
    const toggle = screen.getByRole('button', { name: 'open drawer' });
    await user.click(toggle);
    const temporaryDrawer = document.querySelector('.MuiDrawer-modal');
    expect(temporaryDrawer).not.toBeNull();
    expect(temporaryDrawer).toBeVisible();
  });

  it('renders without a user', () => {
    renderLayout('/dashboard', { user: null, isAuthenticated: false });
    expect(screen.queryByText('jane@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });
});
