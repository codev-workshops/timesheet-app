import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../DashboardPage';
import apiClient from '../../api/client';
import type { Client, WorkEntryWithClient } from '../../types/api';

vi.mock('../../api/client', () => {
  const mockClient = {
    getClients: vi.fn(),
    getWorkEntries: vi.fn(),
  };
  return { default: mockClient, apiClient: mockClient };
});

const mockedGetClients = vi.mocked(apiClient.getClients);
const mockedGetWorkEntries = vi.mocked(apiClient.getWorkEntries);

const makeClient = (id: number, name: string): Client => ({
  id,
  name,
  description: null,
  department: null,
  email: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

const makeEntry = (
  id: number,
  clientName: string,
  hours: number,
  date: string,
  description: string | null = null
): WorkEntryWithClient => ({
  id,
  client_id: id,
  client_name: clientName,
  hours,
  date,
  description,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<div>Other Page</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const getStatValue = (title: string) => {
  const titleElement = screen.getByText(title);
  const container = titleElement.parentElement;
  if (!container) throw new Error(`No container for stat card "${title}"`);
  return within(container).getAllByText(/.+/)[1];
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows zeroed stats and the empty state while data is loading', () => {
    mockedGetClients.mockImplementation(() => new Promise(() => {}));
    mockedGetWorkEntries.mockImplementation(() => new Promise(() => {}));
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(getStatValue('Total Clients')).toHaveTextContent('0');
    expect(getStatValue('Total Work Entries')).toHaveTextContent('0');
    expect(getStatValue('Total Hours')).toHaveTextContent('0.00');
    expect(screen.getByText('No work entries yet')).toBeInTheDocument();
    expect(mockedGetClients).toHaveBeenCalledTimes(1);
    expect(mockedGetWorkEntries).toHaveBeenCalledTimes(1);
  });

  it('renders stat totals computed from the fetched data', async () => {
    mockedGetClients.mockResolvedValue({
      clients: [makeClient(1, 'Acme'), makeClient(2, 'Globex'), makeClient(3, 'Initech')],
    });
    mockedGetWorkEntries.mockResolvedValue({
      workEntries: [
        makeEntry(1, 'Acme', 2.5, '2024-03-10T12:00:00Z'),
        makeEntry(2, 'Globex', 4.25, '2024-03-11T12:00:00Z'),
      ],
    });
    renderDashboard();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(getStatValue('Total Clients')).toHaveTextContent('3');
    expect(getStatValue('Total Work Entries')).toHaveTextContent('2');
    expect(getStatValue('Total Hours')).toHaveTextContent('6.75');
  });

  it('lists only the five most recent entries with their details', async () => {
    const entries = [
      makeEntry(1, 'Client One', 1, '2024-03-01T12:00:00Z', 'Design review'),
      makeEntry(2, 'Client Two', 2, '2024-03-02T12:00:00Z'),
      makeEntry(3, 'Client Three', 3, '2024-03-03T12:00:00Z'),
      makeEntry(4, 'Client Four', 4, '2024-03-04T12:00:00Z'),
      makeEntry(5, 'Client Five', 5, '2024-03-05T12:00:00Z'),
      makeEntry(6, 'Client Six', 6, '2024-03-06T12:00:00Z', 'Should be hidden'),
    ];
    mockedGetClients.mockResolvedValue({ clients: [] });
    mockedGetWorkEntries.mockResolvedValue({ workEntries: entries });
    renderDashboard();

    expect(await screen.findByText('Client One')).toBeInTheDocument();
    ['Client Two', 'Client Three', 'Client Four', 'Client Five'].forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
    expect(screen.queryByText('Client Six')).not.toBeInTheDocument();
    expect(screen.queryByText('Should be hidden')).not.toBeInTheDocument();

    expect(screen.getByText('Design review')).toBeInTheDocument();
    const expectedDate = new Date('2024-03-01T12:00:00Z').toLocaleDateString();
    expect(screen.getByText(`1 hours - ${expectedDate}`)).toBeInTheDocument();

    expect(getStatValue('Total Work Entries')).toHaveTextContent('6');
    expect(getStatValue('Total Hours')).toHaveTextContent('21.00');
    expect(screen.queryByText('No work entries yet')).not.toBeInTheDocument();
  });

  it('shows empty states when the API returns no data', async () => {
    mockedGetClients.mockResolvedValue({ clients: [] });
    mockedGetWorkEntries.mockResolvedValue({ workEntries: [] });
    renderDashboard();

    expect(await screen.findByText('No work entries yet')).toBeInTheDocument();
    expect(getStatValue('Total Clients')).toHaveTextContent('0');
    expect(getStatValue('Total Work Entries')).toHaveTextContent('0');
    expect(getStatValue('Total Hours')).toHaveTextContent('0.00');
  });

  it.each([
    ['Total Clients', '/clients'],
    ['Total Work Entries', '/work-entries'],
    ['Total Hours', '/reports'],
  ])('navigates when the "%s" card is clicked', async (title, path) => {
    const user = userEvent.setup();
    mockedGetClients.mockResolvedValue({ clients: [] });
    mockedGetWorkEntries.mockResolvedValue({ workEntries: [] });
    renderDashboard();

    await user.click(screen.getByText(title));

    expect(screen.getByTestId('location')).toHaveTextContent(path);
    expect(screen.getByText('Other Page')).toBeInTheDocument();
  });

  it.each([
    ['Add Entry', '/work-entries'],
    ['Add Client', '/clients'],
    ['Add Work Entry', '/work-entries'],
    ['View Reports', '/reports'],
  ])('navigates when the "%s" button is clicked', async (name, path) => {
    const user = userEvent.setup();
    mockedGetClients.mockResolvedValue({ clients: [] });
    mockedGetWorkEntries.mockResolvedValue({ workEntries: [] });
    renderDashboard();

    await user.click(screen.getByRole('button', { name }));

    expect(screen.getByTestId('location')).toHaveTextContent(path);
  });
});
