import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import ReportsPage from '../ReportsPage';
import apiClient from '../../api/client';
import { renderWithProviders } from '../../test/utils';
import { clientReport, clients } from '../../test/fixtures';

vi.mock('../../api/client', async () => (await import('../../test/apiClientMock')).createApiClientMock());

const renderPage = async () => {
  renderWithProviders(<ReportsPage />, { route: '/reports' });
  await screen.findByText('Select a client to view their time report.');
};

const selectClient = (name: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name }));
};

const stubDownloads = () => {
  const downloads: string[] = [];
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  return downloads;
};

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients });
    vi.mocked(apiClient.getClientReport).mockResolvedValue(clientReport);
  });

  it('shows a spinner while clients load', () => {
    vi.mocked(apiClient.getClients).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ReportsPage />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('prompts to create a client when none exist', async () => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients: [] });
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText(/You need to create at least one client/)).toBeInTheDocument();
  });

  it('disables exports until a client is selected', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderPage();

    expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeDisabled();
    expect(apiClient.getClientReport).not.toHaveBeenCalled();
  });

  it('loads and renders the report for the selected client', async () => {
    await renderPage();

    selectClient('Acme Corp');

    expect(await screen.findByText('7.50')).toBeInTheDocument();
    expect(apiClient.getClientReport).toHaveBeenCalledWith(1);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3.75')).toBeInTheDocument();
    expect(screen.getByText('Design review')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
    expect(screen.getByText('5 hours')).toBeInTheDocument();
  });

  it('shows a spinner while the report loads', async () => {
    vi.mocked(apiClient.getClientReport).mockReturnValue(new Promise(() => {}));
    await renderPage();

    selectClient('Acme Corp');

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty report', async () => {
    vi.mocked(apiClient.getClientReport).mockResolvedValue({
      client: clients[1],
      workEntries: [],
      totalHours: 0,
      entryCount: 0,
    });
    await renderPage();

    selectClient('Globex');

    expect(await screen.findByText('No work entries found for this client.')).toBeInTheDocument();
    expect(screen.getAllByText('0.00')).toHaveLength(2);
  });

  it.each([
    ['CSV', 'exportClientReportCsv', /^Acme_Corp_report_\d{4}-\d{2}-\d{2}\.csv$/],
    ['PDF', 'exportClientReportPdf', /^Acme_Corp_report_\d{4}-\d{2}-\d{2}\.pdf$/],
  ] as const)('exports a %s report', async (format, method, filename) => {
    const downloads = stubDownloads();
    vi.mocked(apiClient[method]).mockResolvedValue(new Blob(['data']));
    await renderPage();
    selectClient('Acme Corp');
    await screen.findByText('7.50');

    fireEvent.click(screen.getByRole('button', { name: `Export as ${format}` }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(apiClient[method]).toHaveBeenCalledWith(1);
    expect(downloads[0]).toMatch(filename);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it.each([
    ['CSV', 'exportClientReportCsv'],
    ['PDF', 'exportClientReportPdf'],
  ] as const)('shows and dismisses an error when the %s export fails', async (format, method) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient[method]).mockRejectedValue(new Error('boom'));
    await renderPage();
    selectClient('Acme Corp');
    await screen.findByText('7.50');

    fireEvent.click(screen.getByRole('button', { name: `Export as ${format}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Failed to export ${format} report`);
    fireEvent.click(within(alert).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
