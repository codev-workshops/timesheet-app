import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route, useLocation } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { renderWithProviders } from '../test/utils';

vi.mock('../api/client', () => ({
  default: { getClients: vi.fn(), getWorkEntries: vi.fn() },
}));

import apiClient from '../api/client';
const api = vi.mocked(apiClient);

const ShowPath = () => <p data-testid="path">{useLocation().pathname}</p>;

const renderDashboard = () =>
  renderWithProviders(
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<ShowPath />} />
    </Routes>,
    { route: '/dashboard' }
  );

describe('DashboardPage', () => {
  beforeEach(() => vi.clearAllMocks());

  test('sums hours with two decimals and lists the five most recent entries', async () => {
    api.getClients.mockResolvedValue({ clients: [{ id: 1 }, { id: 2 }] });
    api.getWorkEntries.mockResolvedValue({
      workEntries: Array.from({ length: 6 }, (_, i) => ({
        id: i + 1, client_name: `Client ${i + 1}`, hours: 0.1, date: '2024-01-01',
        description: i === 0 ? 'first' : undefined,
      })),
    });
    renderDashboard();

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('0.60')).toBeInTheDocument();
    expect(screen.getByText('Client 5')).toBeInTheDocument();
    expect(screen.queryByText('Client 6')).not.toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
  });

  test('shows empty state when there are no entries', async () => {
    api.getClients.mockResolvedValue({ clients: [] });
    api.getWorkEntries.mockResolvedValue({ workEntries: [] });
    renderDashboard();

    expect(await screen.findByText('No work entries yet')).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
  });

  test('quick actions and stat cards navigate', async () => {
    api.getClients.mockResolvedValue({ clients: [] });
    api.getWorkEntries.mockResolvedValue({ workEntries: [] });
    renderDashboard();
    await screen.findByText('No work entries yet');

    await userEvent.click(screen.getByRole('button', { name: 'View Reports' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/reports');
  });

  test('stat card click navigates to clients', async () => {
    api.getClients.mockResolvedValue({ clients: [] });
    api.getWorkEntries.mockResolvedValue({ workEntries: [] });
    renderDashboard();
    await screen.findByText('No work entries yet');

    await userEvent.click(screen.getByText('Total Clients'));
    expect(screen.getByTestId('path')).toHaveTextContent('/clients');
  });
});
