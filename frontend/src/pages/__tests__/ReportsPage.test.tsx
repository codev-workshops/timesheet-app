import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReportsPage from '../ReportsPage';
import apiClient from '../../api/client';
import type { Client, ClientReport, WorkEntry } from '../../types/api';

vi.mock('../../api/client', () => ({
  default: {
    getClients: vi.fn(),
    getClientReport: vi.fn(),
    exportClientReportCsv: vi.fn(),
    exportClientReportPdf: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

const makeClient = (id: number, name: string): Client => ({
  id,
  name,
  description: null,
  department: null,
  email: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

const makeEntry = (overrides: Partial<WorkEntry>): WorkEntry => ({
  id: 1,
  client_id: 1,
  hours: 1,
  description: null,
  date: '2024-03-01T12:00:00Z',
  created_at: '2024-03-02T12:00:00Z',
  updated_at: '2024-03-02T12:00:00Z',
  ...overrides,
});

const acme = makeClient(1, 'Acme Corp');
const globex = makeClient(2, 'Globex & Co');

const acmeReport: ClientReport = {
  client: acme,
  workEntries: [
    makeEntry({ id: 10, client_id: 1, hours: 3, description: 'Design review' }),
    makeEntry({ id: 11, client_id: 1, hours: 4.5, description: null }),
  ],
  totalHours: 7.5,
  entryCount: 2,
};

const globexReport: ClientReport = {
  client: globex,
  workEntries: [makeEntry({ id: 20, client_id: 2, hours: 2, description: 'Kickoff call' })],
  totalHours: 2,
  entryCount: 1,
};

const emptyReport: ClientReport = {
  client: acme,
  workEntries: [],
  totalHours: 0,
  entryCount: 0,
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const selectClient = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('combobox'));
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name }));
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('ReportsPage', () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  let createObjectURL: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getClients.mockResolvedValue({ clients: [acme, globex] });
    mockedApi.getClientReport.mockImplementation(async (id: number) =>
      id === 1 ? acmeReport : globexReport,
    );
    createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:mock-url');
    revokeObjectURL = vi.fn<(url: string) => void>();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('shows a spinner while clients are loading', () => {
    mockedApi.getClients.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reports' })).not.toBeInTheDocument();
  });

  it('prompts to create a client when there are no clients', async () => {
    mockedApi.getClients.mockResolvedValue({ clients: [] });
    renderPage();

    expect(
      await screen.findByText('You need to create at least one client before generating reports.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Client' })).toHaveAttribute('href', '/clients');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('treats a missing clients payload as no clients', async () => {
    mockedApi.getClients.mockResolvedValue({});
    renderPage();

    expect(await screen.findByRole('link', { name: 'Create Client' })).toBeInTheDocument();
  });

  it('populates the client selector and hides the report before selection', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('Select a client to view their time report.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(mockedApi.getClientReport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeDisabled();

    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Choose a client...',
      'Acme Corp',
      'Globex & Co',
    ]);
  });

  it('fetches and renders the report for the selected client, with a loading state', async () => {
    const user = userEvent.setup();
    const pending = deferred<ClientReport>();
    mockedApi.getClientReport.mockReturnValueOnce(pending.promise);
    renderPage();
    await screen.findByRole('combobox');

    await selectClient(user, 'Acme Corp');

    expect(mockedApi.getClientReport).toHaveBeenCalledWith(1);
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeDisabled();
    expect(screen.queryByText('Select a client to view their time report.')).not.toBeInTheDocument();

    pending.resolve(acmeReport);

    const table = await screen.findByRole('table');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Total Hours').nextElementSibling).toHaveTextContent('7.50');
    expect(screen.getByText('Total Entries').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Average Hours per Entry').nextElementSibling).toHaveTextContent('3.75');

    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('3 hours')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Design review')).toBeInTheDocument();
    expect(
      within(rows[1]).getByText(new Date(acmeReport.workEntries[0].date).toLocaleDateString()),
    ).toBeInTheDocument();
    expect(within(rows[2]).getByText('4.5 hours')).toBeInTheDocument();
    expect(within(rows[2]).getByText('No description')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeEnabled();
  });

  it('shows the empty-report state when the client has no entries', async () => {
    const user = userEvent.setup();
    mockedApi.getClientReport.mockResolvedValue(emptyReport);
    renderPage();
    await screen.findByRole('combobox');

    await selectClient(user, 'Acme Corp');

    expect(await screen.findByText('No work entries found for this client.')).toBeInTheDocument();
    expect(screen.getByText('Total Hours').nextElementSibling).toHaveTextContent('0.00');
    expect(screen.getByText('Total Entries').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByText('Average Hours per Entry').nextElementSibling).toHaveTextContent('0.00');
  });

  it('refetches with the new id when switching clients', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('combobox');

    await selectClient(user, 'Acme Corp');
    expect(await screen.findByText('Design review')).toBeInTheDocument();

    await selectClient(user, 'Globex & Co');

    expect(await screen.findByText('Kickoff call')).toBeInTheDocument();
    expect(screen.queryByText('Design review')).not.toBeInTheDocument();
    expect(mockedApi.getClientReport).toHaveBeenNthCalledWith(1, 1);
    expect(mockedApi.getClientReport).toHaveBeenNthCalledWith(2, 2);
    expect(screen.getByText('Total Hours').nextElementSibling).toHaveTextContent('2.00');
  });

  it('returns to the placeholder when "Choose a client..." is re-selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('combobox');

    await selectClient(user, 'Acme Corp');
    await screen.findByRole('table');

    await selectClient(user, 'Choose a client...');

    expect(screen.getByText('Select a client to view their time report.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it.each([
    {
      format: 'CSV',
      exportFn: 'exportClientReportCsv' as const,
      mime: 'text/csv',
      extension: 'csv',
    },
    {
      format: 'PDF',
      exportFn: 'exportClientReportPdf' as const,
      mime: 'application/pdf',
      extension: 'pdf',
    },
  ])('downloads the $format export for the selected client', async ({ format, exportFn, mime, extension }) => {
    const user = userEvent.setup();
    const blob = new Blob(['report'], { type: mime });
    mockedApi[exportFn].mockResolvedValue(blob);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage();
    await screen.findByRole('combobox');

    await selectClient(user, 'Globex & Co');
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: `Export as ${format}` }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'));
    expect(mockedApi[exportFn]).toHaveBeenCalledWith(2);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toMatch(new RegExp(`^Globex___Co_report_\\d{4}-\\d{2}-\\d{2}\\.${extension}$`));
    expect(document.body.contains(anchor)).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    { format: 'CSV', exportFn: 'exportClientReportCsv' as const },
    { format: 'PDF', exportFn: 'exportClientReportPdf' as const },
  ])('shows a dismissible error when the $format export fails', async ({ format, exportFn }) => {
    const user = userEvent.setup();
    const failure = new Error('network down');
    mockedApi[exportFn].mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage();
    await screen.findByRole('combobox');

    await selectClient(user, 'Acme Corp');
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: `Export as ${format}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Failed to export ${format} report`);
    expect(consoleError).toHaveBeenCalledWith('Export error:', failure);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
