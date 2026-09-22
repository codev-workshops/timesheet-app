import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from '../pages/ReportsPage';
import { renderWithProviders } from '../test/utils';
import type { ClientReport } from '../types/api';

vi.mock('../api/client', () => ({
  default: {
    getClients: vi.fn(),
    getClientReport: vi.fn(),
    exportClientReportCsv: vi.fn(),
    exportClientReportPdf: vi.fn(),
  },
}));

import apiClient from '../api/client';
const api = vi.mocked(apiClient);

const client = {
  id: 1, name: 'Acme Corp', description: null, department: null, email: null,
  created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
};

const report: ClientReport = {
  client,
  totalHours: 0.30000000000000004,
  entryCount: 3,
  workEntries: [
    { id: 1, client_id: 1, hours: 0.1, description: 'a', date: '2024-01-01', created_at: '2024-01-01T00:00:00Z', updated_at: '' },
    { id: 2, client_id: 1, hours: 0.1, description: null, date: '2024-01-02', created_at: '2024-01-02T00:00:00Z', updated_at: '' },
    { id: 3, client_id: 1, hours: 0.1, description: 'c', date: '2024-01-03', created_at: '2024-01-03T00:00:00Z', updated_at: '' },
  ],
};

const selectClient = async (name: string) => {
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getClients.mockResolvedValue({ clients: [client] });
    api.getClientReport.mockResolvedValue(report);
  });

  test('shows the create-client prompt when there are no clients', async () => {
    api.getClients.mockResolvedValue({ clients: [] });
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText(/create at least one client before generating reports/)).toBeInTheDocument();
    expect(api.getClientReport).not.toHaveBeenCalled();
  });

  test('does not fetch a report until a client is selected; export buttons disabled', async () => {
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText('Select a client to view their time report.')).toBeInTheDocument();
    expect(api.getClientReport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeDisabled();
  });

  test('renders totals (rounded to 2dp), average and entry rows after selecting a client', async () => {
    renderWithProviders(<ReportsPage />);
    await screen.findByRole('combobox');

    await selectClient('Acme Corp');

    await waitFor(() => expect(api.getClientReport).toHaveBeenCalledWith(1));
    expect(await screen.findByText('0.30')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('0.10')).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  test('shows empty-entries message and 0.00 average for a client with no entries', async () => {
    api.getClientReport.mockResolvedValue({ ...report, totalHours: 0, entryCount: 0, workEntries: [] });
    renderWithProviders(<ReportsPage />);
    await screen.findByRole('combobox');

    await selectClient('Acme Corp');

    expect(await screen.findByText('No work entries found for this client.')).toBeInTheDocument();
    expect(screen.getAllByText('0.00')).toHaveLength(2);
  });

  test('CSV export downloads a sanitised filename via an anchor click', async () => {
    api.exportClientReportCsv.mockResolvedValue(new Blob(['a,b']));
    const createObjectURL = vi.fn(() => 'blob:csv');
    const revokeObjectURL = vi.fn();
    Object.assign(window.URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(<ReportsPage />);
    await screen.findByRole('combobox');
    await selectClient('Acme Corp');
    await screen.findByText('0.30');

    await userEvent.click(screen.getByRole('button', { name: 'Export as CSV' }));

    await waitFor(() => expect(api.exportClientReportCsv).toHaveBeenCalledWith(1));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^Acme_Corp_report_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(anchor.href).toBe('blob:csv');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    click.mockRestore();
  });

  test('PDF export failure shows an error alert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.exportClientReportPdf.mockRejectedValue(new Error('500'));
    renderWithProviders(<ReportsPage />);
    await screen.findByRole('combobox');
    await selectClient('Acme Corp');
    await screen.findByText('0.30');

    await userEvent.click(screen.getByRole('button', { name: 'Export as PDF' }));

    expect(await screen.findByText('Failed to export PDF report')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Failed to export PDF report')).not.toBeInTheDocument();
  });
});
