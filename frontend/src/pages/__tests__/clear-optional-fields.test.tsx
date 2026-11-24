import { type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import apiClient from '../../api/client';
import { type Client, type WorkEntry } from '../../types/api';
import ClientsPage from '../ClientsPage';
import WorkEntriesPage from '../WorkEntriesPage';

vi.mock('../../api/client', () => ({
  default: {
    getClients: vi.fn(),
    getWorkEntries: vi.fn(),
    updateClient: vi.fn(),
    updateWorkEntry: vi.fn(),
  },
}));

const client: Client = {
  id: 1,
  name: 'Northwind Studio',
  department: 'Product Design',
  email: 'studio@example.com',
  description: 'Design support for the summer launch.',
  created_at: '2025-06-10',
  updated_at: '2025-06-10',
};

const entry: WorkEntry = {
  id: 2,
  client_id: client.id,
  client_name: client.name,
  hours: 2,
  date: '2025-06-10',
  description: 'Reviewed the summer launch design.',
  created_at: '2025-06-10',
  updated_at: '2025-06-10',
};

afterEach(() => vi.resetAllMocks());

function renderPage(page: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(apiClient.getClients).mockResolvedValue({ clients: [client] });
  render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

async function openEditDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByTestId('EditIcon'));
  return within(await screen.findByRole('dialog', { name }));
}

test('sends empty department, email, and description when cleared on client update', async () => {
  const user = userEvent.setup();
  const updateClient = vi.mocked(apiClient.updateClient).mockResolvedValue({});
  renderPage(<ClientsPage />);

  const dialog = await openEditDialog(user, 'Edit Client');
  const fields = { Department: client.department, Email: client.email, Description: client.description };
  for (const [label, value] of Object.entries(fields)) {
    const field = dialog.getByRole('textbox', { name: label });
    expect(field).toHaveValue(value);
    await user.clear(field);
  }
  await user.click(dialog.getByRole('button', { name: 'Update' }));

  await waitFor(() => expect(updateClient).toHaveBeenCalledWith(client.id, {
    name: client.name,
    department: '',
    email: '',
    description: '',
  }));
});

test('sends an empty description when cleared on work entry update', async () => {
  const user = userEvent.setup();
  vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries: [entry] });
  const updateWorkEntry = vi.mocked(apiClient.updateWorkEntry).mockResolvedValue({});
  renderPage(<WorkEntriesPage />);

  const dialog = await openEditDialog(user, 'Edit Work Entry');
  const description = dialog.getByRole('textbox', { name: 'Description' });
  expect(description).toHaveValue(entry.description);
  await user.clear(description);
  await user.click(dialog.getByRole('button', { name: 'Update' }));

  await waitFor(() => expect(updateWorkEntry).toHaveBeenCalledWith(entry.id, {
    clientId: client.id,
    hours: entry.hours,
    date: entry.date,
    description: '',
  }));
});
