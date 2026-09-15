import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '../Layout';
import { AuthContext, type AuthContextType } from '../../contexts/AuthContextValue';

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
};

const renderLayout = (initialPath: string, auth: Partial<AuthContextType> = {}) => {
  const value: AuthContextType = {
    user: { email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    isAuthenticated: true,
    ...auth,
  };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="*"
            element={
              <Layout>
                <LocationProbe />
              </Layout>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return value;
};

describe('Layout', () => {
  test('shows the current page title, user email and avatar initial', () => {
    renderLayout('/clients');

    // 2 drawer menu entries + the app bar title
    expect(screen.getAllByText('Clients')).toHaveLength(3);
    expect(screen.getAllByText('Time Tracker')).toHaveLength(2);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  test('falls back to the app title on unknown routes', () => {
    renderLayout('/unknown');

    // 2 drawer titles + the app bar fallback title
    expect(screen.getAllByText('Time Tracker')).toHaveLength(3);
  });

  test('navigates when a menu item is clicked', () => {
    renderLayout('/dashboard');

    fireEvent.click(screen.getAllByRole('button', { name: /Reports/ })[0]);

    expect(screen.getByTestId('location')).toHaveTextContent('/reports');
  });

  test('calls logout when the logout button is clicked', () => {
    const value = renderLayout('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: /Logout/ }));

    expect(value.logout).toHaveBeenCalledTimes(1);
  });

  test('toggles the mobile drawer', () => {
    renderLayout('/dashboard');

    fireEvent.click(screen.getByLabelText('open drawer'));

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(1);
  });

  test('renders without a user', () => {
    renderLayout('/dashboard', { user: null, isAuthenticated: false });

    expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
  });
});
