import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import DashboardPage from '../DashboardPage';
import apiClient from '../../api/client';
import { renderWithProviders } from '../../test/utils';
import { clients, workEntries } from '../../test/fixtures';

vi.mock('../../api/client', async () => (await import('../../test/apiClientMock')).createApiClientMock());

const manyEntries = Array.from({ length: 6 }, (_, i) => ({
  ...workEntries[0],
  id: 100 + i,
  client_name: `Client ${i}`,
  hours: 1.25,
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients });
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries });
  });

  it('shows totals for clients, entries and hours', async () => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });

    expect(await screen.findByText('7.50')).toBeInTheDocument();
    expect(screen.getAllByText('2')).toHaveLength(2);
    expect(screen.getByText('Design review')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
  });

  it('shows at most five recent entries', async () => {
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries: manyEntries });
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });

    expect(await screen.findByText('Client 4')).toBeInTheDocument();
    expect(screen.queryByText('Client 5')).not.toBeInTheDocument();
    expect(screen.getByText('7.50')).toBeInTheDocument();
  });

  it('shows an empty state with no data', async () => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients: [] });
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries: [] });
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });

    expect(await screen.findByText('No work entries yet')).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
  });

  it.each([
    ['Total Clients', '/clients'],
    ['Total Work Entries', '/work-entries'],
    ['Total Hours', '/reports'],
  ])('navigates when the %s card is clicked', async (title, path) => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });

    fireEvent.click(await screen.findByText(title));

    expect(screen.getByTestId('location')).toHaveTextContent(path);
  });

  it.each([
    ['Add Entry', '/work-entries'],
    ['Add Client', '/clients'],
    ['Add Work Entry', '/work-entries'],
    ['View Reports', '/reports'],
  ])('navigates from the %s button', (name, path) => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });

    fireEvent.click(screen.getByRole('button', { name }));

    expect(screen.getByTestId('location')).toHaveTextContent(path);
  });
});
