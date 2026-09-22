import { describe, expect, test, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { renderWithProviders, makeAuth } from '../test/utils';

const ShowPath = () => <p data-testid="path">{useLocation().pathname}</p>;

const renderLayout = (route: string, logout = vi.fn()) =>
  renderWithProviders(
    <Layout>
      <Routes>
        <Route path="*" element={<ShowPath />} />
      </Routes>
    </Layout>,
    { route, auth: makeAuth({ logout, user: { email: 'jane@example.com', createdAt: 'x' } }) }
  );

describe('Layout', () => {
  test('shows the current page title, user email and avatar initial', () => {
    renderLayout('/clients');

    expect(screen.getByRole('banner')).toHaveTextContent('Clients');
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  test('falls back to the app name for unknown routes', () => {
    renderLayout('/somewhere-else');
    expect(within(screen.getByRole('banner')).getByText('Time Tracker')).toBeInTheDocument();
  });

  test('nav items navigate and mark the active route', async () => {
    renderLayout('/dashboard');
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard');

    const reports = screen.getAllByRole('button', { name: 'Reports' });
    await userEvent.click(reports[reports.length - 1]);

    expect(screen.getByTestId('path')).toHaveTextContent('/reports');
    expect(screen.getByRole('banner')).toHaveTextContent('Reports');
  });

  test('logout button calls auth.logout', async () => {
    const logout = vi.fn();
    renderLayout('/dashboard', logout);

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  test('mobile menu button toggles the temporary drawer', async () => {
    renderLayout('/dashboard');
    const drawersBefore = screen.getAllByText('Time Tracker').length;

    await userEvent.click(screen.getByRole('button', { name: 'open drawer' }));
    expect(screen.getAllByText('Time Tracker').length).toBeGreaterThanOrEqual(drawersBefore);
  });
});
