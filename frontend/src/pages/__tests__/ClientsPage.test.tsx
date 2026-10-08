import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import ClientsPage from '../ClientsPage';
import apiClient from '../../api/client';
import { renderWithProviders } from '../../test/utils';
import { clients } from '../../test/fixtures';

vi.mock('../../api/client', async () => (await import('../../test/apiClientMock')).createApiClientMock());

const renderPage = async () => {
  renderWithProviders(<ClientsPage />, { route: '/clients' });
  await screen.findByText('Acme Corp');
};

const openDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add Client' }));
  return screen.getByRole('dialog');
};

const getForm = (dialog: HTMLElement): HTMLFormElement => {
  const form = dialog.querySelector('form');
  if (!form) throw new Error('form not found');
  return form;
};

const iconButton = (testId: string, index = 0): HTMLElement => {
  const button = screen.getAllByTestId(testId)[index].closest('button');
  if (!button) throw new Error(`${testId} button not found`);
  return button;
};

describe('ClientsPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients });
  });

  it('shows a spinner while loading', () => {
    vi.mocked(apiClient.getClients).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ClientsPage />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the client table with placeholders for missing fields', async () => {
    await renderPage();

    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('acme@example.com')).toBeInTheDocument();
    expect(screen.getByText('Main client')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(2);
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('shows the empty state without a Clear All button', async () => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients: [] });
    renderWithProviders(<ClientsPage />);

    expect(await screen.findByText(/No clients found/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear All' })).not.toBeInTheDocument();
  });

  it('requires a client name', async () => {
    await renderPage();
    const dialog = openDialog();

    fireEvent.change(within(dialog).getByLabelText(/Client Name/), { target: { value: '   ' } });
    fireEvent.submit(getForm(dialog));

    expect(await screen.findByText('Client name is required')).toBeInTheDocument();
    expect(apiClient.createClient).not.toHaveBeenCalled();
  });

  it('creates a client and refreshes the list', async () => {
    vi.mocked(apiClient.createClient).mockResolvedValue({ client: clients[0] });
    await renderPage();
    const dialog = openDialog();
    expect(within(dialog).getByText('Add New Client')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/Client Name/), { target: { value: 'New Co' } });
    fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: 'Eng' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(apiClient.createClient).toHaveBeenCalledWith({
        name: 'New Co',
        description: undefined,
        department: 'Eng',
        email: undefined,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(apiClient.getClients).toHaveBeenCalledTimes(2));
  });

  it('shows the server error when creation fails', async () => {
    vi.mocked(apiClient.createClient).mockRejectedValue({ response: { data: { error: 'Duplicate name' } } });
    await renderPage();
    const dialog = openDialog();

    fireEvent.change(within(dialog).getByLabelText(/Client Name/), { target: { value: 'Acme Corp' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Duplicate name')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('falls back to a generic creation error', async () => {
    vi.mocked(apiClient.createClient).mockRejectedValue(new Error('Network Error'));
    await renderPage();
    const dialog = openDialog();

    fireEvent.change(within(dialog).getByLabelText(/Client Name/), { target: { value: 'New Co' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Failed to create client')).toBeInTheDocument();
  });

  it('closes the dialog on cancel', async () => {
    await renderPage();
    const dialog = openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edits an existing client', async () => {
    vi.mocked(apiClient.updateClient).mockResolvedValue({ client: clients[0] });
    await renderPage();

    fireEvent.click(iconButton('EditIcon'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit Client')).toBeInTheDocument();
    const nameInput = within(dialog).getByLabelText(/Client Name/);
    expect(nameInput).toHaveValue('Acme Corp');

    fireEvent.change(nameInput, { target: { value: 'Acme Updated' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(apiClient.updateClient).toHaveBeenCalledWith(1, {
        name: 'Acme Updated',
        description: 'Main client',
        department: 'Sales',
        email: 'acme@example.com',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the edit dialog with empty optional fields', async () => {
    await renderPage();

    fireEvent.click(iconButton('EditIcon', 1));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText(/Client Name/)).toHaveValue('Globex');
    expect(within(dialog).getByLabelText('Department')).toHaveValue('');
    expect(within(dialog).getByLabelText('Email')).toHaveValue('');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('');
  });

  it('shows an error when updating fails', async () => {
    vi.mocked(apiClient.updateClient).mockRejectedValue(new Error('boom'));
    await renderPage();

    fireEvent.click(iconButton('EditIcon'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update' }));

    expect(await screen.findByText('Failed to update client')).toBeInTheDocument();
  });

  it('deletes a client after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.deleteClient).mockResolvedValue({ message: 'deleted' });
    await renderPage();

    fireEvent.click(iconButton('DeleteIcon'));

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete "Acme Corp"?');
    await waitFor(() => expect(apiClient.deleteClient).toHaveBeenCalledWith(1));
    await waitFor(() => expect(apiClient.getClients).toHaveBeenCalledTimes(2));
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPage();

    fireEvent.click(iconButton('DeleteIcon'));

    expect(apiClient.deleteClient).not.toHaveBeenCalled();
  });

  it('shows and dismisses a delete error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.deleteClient).mockRejectedValue(new Error('boom'));
    await renderPage();

    fireEvent.click(iconButton('DeleteIcon'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to delete client');

    fireEvent.click(within(alert).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears all clients after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.deleteAllClients).mockResolvedValue({ message: 'deleted', deletedCount: 2 });
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));

    await waitFor(() => expect(apiClient.deleteAllClients).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiClient.getClients).toHaveBeenCalledTimes(2));
  });

  it('does not clear clients when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));

    expect(apiClient.deleteAllClients).not.toHaveBeenCalled();
  });

  it.each([
    [{ response: { data: { error: 'Cannot clear' } } }, 'Cannot clear'],
    [new Error('boom'), 'Failed to delete all clients'],
  ])('shows an error when clearing fails (%#)', async (rejection, message) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.deleteAllClients).mockRejectedValue(rejection);
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});
