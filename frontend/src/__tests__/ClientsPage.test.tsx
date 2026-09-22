import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientsPage from '../pages/ClientsPage';
import { renderWithProviders } from '../test/utils';
import type { Client } from '../types/api';

vi.mock('../api/client', () => ({
  default: {
    getClients: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
    deleteAllClients: vi.fn(),
  },
}));

import apiClient from '../api/client';
const api = vi.mocked(apiClient);

const acme: Client = {
  id: 1, name: 'Acme', description: 'Widgets', department: 'Finance', email: 'ap@acme.com',
  created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
};
const bare: Client = { ...acme, id: 2, name: 'Bare', description: null, department: null, email: null };

const openDialog = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog');
};

describe('ClientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getClients.mockResolvedValue({ clients: [acme, bare] });
  });

  test('renders clients with department/email and placeholders for missing fields', async () => {
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('ap@acme.com')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(2);
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  test('shows the empty state and hides Clear All when there are no clients', async () => {
    api.getClients.mockResolvedValue({ clients: [] });
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText(/No clients found/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear All/ })).not.toBeInTheDocument();
  });

  test('create dialog validates name and submits department/email', async () => {
    api.createClient.mockResolvedValue({ client: { ...acme, id: 3 } });
    renderWithProviders(<ClientsPage />);
    await screen.findByText('Acme');

    const dialog = await openDialog('Add Client');
    expect(within(dialog).getByText('Add New Client')).toBeInTheDocument();

    // MUI `required` blocks native submit on an empty name; type a space so the
    // component's own trim() check is the one that rejects it.
    await userEvent.type(within(dialog).getByLabelText(/Client Name/), ' ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Client name is required')).toBeInTheDocument();
    expect(api.createClient).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText(/Client Name/));
    await userEvent.type(within(dialog).getByLabelText(/Client Name/), 'Globex');
    await userEvent.type(within(dialog).getByLabelText(/Department/), 'Ops');
    await userEvent.type(within(dialog).getByLabelText(/^Email/), 'ops@globex.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(api.createClient).toHaveBeenCalledWith({
        name: 'Globex', description: undefined, department: 'Ops', email: 'ops@globex.com',
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.getClients).toHaveBeenCalledTimes(2);
  });

  test('surfaces the backend validation error on create failure', async () => {
    api.createClient.mockRejectedValue({ response: { data: { error: '"email" must be a valid email' } } });
    renderWithProviders(<ClientsPage />);
    await screen.findByText('Acme');

    const dialog = await openDialog('Add Client');
    await userEvent.type(within(dialog).getByLabelText(/Client Name/), 'X');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('"email" must be a valid email')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('edit dialog is prefilled and sends an update for that client id', async () => {
    api.updateClient.mockResolvedValue({ client: acme });
    renderWithProviders(<ClientsPage />);
    await screen.findByText('Acme');

    const acmeRow = screen.getByText('Acme').closest('tr')!;
    const [editBtn] = within(acmeRow).getAllByRole('button');
    await userEvent.click(editBtn);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit Client')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Client Name/)).toHaveValue('Acme');
    expect(within(dialog).getByLabelText(/Department/)).toHaveValue('Finance');

    await userEvent.clear(within(dialog).getByLabelText(/Department/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(api.updateClient).toHaveBeenCalledWith(1, {
        name: 'Acme', description: 'Widgets', department: undefined, email: 'ap@acme.com',
      })
    );
  });

  test('delete asks for confirmation and only calls the API when confirmed', async () => {
    api.deleteClient.mockResolvedValue({ message: 'ok' });
    const confirm = vi.spyOn(window, 'confirm');
    renderWithProviders(<ClientsPage />);
    await screen.findByText('Acme');

    const acmeRow = screen.getByText('Acme').closest('tr')!;
    const [, deleteBtn] = within(acmeRow).getAllByRole('button');

    confirm.mockReturnValueOnce(false);
    await userEvent.click(deleteBtn);
    expect(api.deleteClient).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await userEvent.click(deleteBtn);
    await waitFor(() => expect(api.deleteClient).toHaveBeenCalledWith(1));
    expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete "Acme"?');
  });

  test('Clear All confirms then bulk deletes; errors are shown', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteAllClients.mockRejectedValue(new Error('boom'));
    renderWithProviders(<ClientsPage />);
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: /Clear All/ }));

    await waitFor(() => expect(api.deleteAllClients).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Failed to delete all clients')).toBeInTheDocument();
  });
});
