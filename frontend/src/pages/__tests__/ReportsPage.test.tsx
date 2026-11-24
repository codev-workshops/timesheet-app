import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { expect, test, vi } from 'vitest';
import apiClient from '../../api/client';
import ReportsPage from '../ReportsPage';

vi.mock('../../api/client', () => ({
  default: {
    getClients: vi.fn(),
    getClientReport: vi.fn(),
  },
}));

test('shows the missing-client error and disables both report exports', async () => {
  vi.mocked(apiClient.getClients).mockResolvedValue({
    clients: [{ id: 1, name: 'Deleted client' }],
  });
  const headers = new AxiosHeaders();
  vi.mocked(apiClient.getClientReport).mockRejectedValue(
    new AxiosError('Request failed with status code 404', AxiosError.ERR_BAD_REQUEST, undefined, undefined, {
      data: { error: 'Client not found' },
      status: 404,
      statusText: 'Not Found',
      headers,
      config: { headers },
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();

  render(
    <QueryClientProvider client={queryClient}>
      <ReportsPage />
    </QueryClientProvider>,
  );

  await user.click(await screen.findByRole('combobox'));
  await user.click(screen.getByRole('option', { name: 'Deleted client' }));
  expect(apiClient.getClientReport).toHaveBeenCalledWith(1);
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());

  expect.soft(screen.queryByRole('alert')?.textContent).toBe('Client not found');
  expect.soft(screen.getByRole('button', { name: 'Export as CSV' })).toBeDisabled();
  expect.soft(screen.getByRole('button', { name: 'Export as PDF' })).toBeDisabled();
});
