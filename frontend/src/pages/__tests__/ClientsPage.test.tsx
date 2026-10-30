import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ClientsPage from '../ClientsPage';
import apiClient from '../../api/client';
import { type Client } from '../../types/api';

vi.mock('../../api/client', () => ({
  default: {
    getClients: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
    deleteAllClients: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

const fullClient: Client = {
  id: 1,
  name: 'Acme Corp',
  description: 'Main customer',
  department: 'Engineering',
  email: 'contact@acme.test',
  created_at: '2024-01-15T12:00:00.000Z',
  updated_at: '2024-01-15T12:00:00.000Z',
};

const sparseClient: Client = {
  id: 2,
  name: 'Globex',
  description: null,
  department: null,
  email: null,
  created_at: '2024-03-20T12:00:00.000Z',
  updated_at: '2024-03-20T12:00:00.000Z',
};

const apiError = (message: string) => ({ response: { data: { error: message } } });

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, queryClient, invalidateSpy };
};

const getRow = async (name: string) => {
  const cell = await screen.findByText(name);
  const row = cell.closest('tr');
  if (!row) throw new Error(`Row for ${name} not found`);
  return row;
};

const getRowButton = async (name: string, iconTestId: 'EditIcon' | 'DeleteIcon') => {
  const row = await getRow(name);
  const button = within(row).getByTestId(iconTestId).closest('button');
  if (!button) throw new Error(`${iconTestId} button not found`);
  return button;
};

// The page-level Alert renders outside the open MUI Dialog, which marks the rest of the page aria-hidden.
const findAlertBehindDialog = () => screen.findByRole('alert', { hidden: true });

describe('ClientsPage', () => {
  let confirmSpy: MockInstance<typeof window.confirm>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getClients.mockResolvedValue({ clients: [fullClient, sparseClient] });
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  describe('rendering', () => {
    it('shows a loading spinner while clients are being fetched', () => {
      mockedApi.getClients.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Clients' })).not.toBeInTheDocument();
    });

    it('renders the populated clients table with values and fallbacks', async () => {
      renderPage();

      const fullRow = await getRow('Acme Corp');
      expect(within(fullRow).getByText('Engineering')).toBeInTheDocument();
      expect(within(fullRow).getByText('contact@acme.test')).toBeInTheDocument();
      expect(within(fullRow).getByText('Main customer')).toBeInTheDocument();
      expect(
        within(fullRow).getByText(new Date(fullClient.created_at).toLocaleDateString()),
      ).toBeInTheDocument();
      expect(within(fullRow).queryByText('-')).not.toBeInTheDocument();

      const sparseRow = await getRow('Globex');
      expect(within(sparseRow).getAllByText('-')).toHaveLength(2);
      expect(within(sparseRow).getByText('No description')).toBeInTheDocument();
      expect(
        within(sparseRow).getByText(new Date(sparseClient.created_at).toLocaleDateString()),
      ).toBeInTheDocument();

      expect(screen.getByRole('heading', { name: 'Clients' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
      expect(mockedApi.getClients).toHaveBeenCalledTimes(1);
    });

    it('renders the empty state and hides Clear All when there are no clients', async () => {
      mockedApi.getClients.mockResolvedValue({ clients: [] });
      renderPage();

      expect(
        await screen.findByText('No clients found. Create your first client to get started.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });

    it('treats a response without a clients array as empty', async () => {
      mockedApi.getClients.mockResolvedValue({});
      renderPage();

      expect(await screen.findByText(/No clients found/)).toBeInTheDocument();
    });
  });

  describe('create dialog', () => {
    it('opens, submits form data, closes and invalidates the clients query', async () => {
      mockedApi.createClient.mockResolvedValue({ client: { ...fullClient, id: 3 } });
      const { user, invalidateSpy } = renderPage();

      await user.click(await screen.findByRole('button', { name: /add client/i }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Add New Client')).toBeInTheDocument();

      await user.type(within(dialog).getByLabelText(/client name/i), 'Initech');
      await user.type(within(dialog).getByLabelText(/department/i), 'Sales');
      await user.type(within(dialog).getByLabelText(/email/i), 'hi@initech.test');
      await user.type(within(dialog).getByLabelText(/description/i), 'TPS reports');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(mockedApi.createClient).toHaveBeenCalledWith({
          name: 'Initech',
          department: 'Sales',
          email: 'hi@initech.test',
          description: 'TPS reports',
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] });
      await waitFor(() => expect(mockedApi.getClients).toHaveBeenCalledTimes(2));
    });

    it('sends undefined for blank optional fields', async () => {
      mockedApi.createClient.mockResolvedValue({ client: fullClient });
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /add client/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/client name/i), 'Solo');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(mockedApi.createClient).toHaveBeenCalledWith({
          name: 'Solo',
          description: undefined,
          department: undefined,
          email: undefined,
        }),
      );
    });

    it('shows a validation error when the name is only whitespace', async () => {
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /add client/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/client name/i), '   ');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Client name is required');
      expect(mockedApi.createClient).not.toHaveBeenCalled();
    });

    it('disables the form and shows a spinner while the create request is pending', async () => {
      mockedApi.createClient.mockReturnValue(new Promise(() => {}));
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /add client/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/client name/i), 'Pending Co');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(within(dialog).getByLabelText(/client name/i)).toBeDisabled());
      expect(within(dialog).getByRole('progressbar')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('closes and resets the dialog when Cancel is clicked', async () => {
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /add client/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/client name/i), 'Discard me');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /add client/i }));
      const reopened = await screen.findByRole('dialog');
      expect(within(reopened).getByLabelText(/client name/i)).toHaveValue('');
      expect(mockedApi.createClient).not.toHaveBeenCalled();
    });

    it('surfaces the API error message when creation fails', async () => {
      mockedApi.createClient.mockRejectedValue(apiError('Client already exists'));
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /add client/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/client name/i), 'Acme Corp');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Client already exists');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to a generic message when creation fails without details', async () => {
      mockedApi.createClient.mockRejectedValue(new Error('Network down'));
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /add client/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/client name/i), 'Acme Corp');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Failed to create client');
    });
  });

  describe('edit flow', () => {
    it('pre-fills the dialog and submits updates', async () => {
      mockedApi.updateClient.mockResolvedValue({ client: fullClient });
      const { user, invalidateSpy } = renderPage();

      await user.click(await getRowButton('Acme Corp', 'EditIcon'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Edit Client')).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/client name/i)).toHaveValue('Acme Corp');
      expect(within(dialog).getByLabelText(/department/i)).toHaveValue('Engineering');
      expect(within(dialog).getByLabelText(/email/i)).toHaveValue('contact@acme.test');
      expect(within(dialog).getByLabelText(/description/i)).toHaveValue('Main customer');

      const nameInput = within(dialog).getByLabelText(/client name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Acme Industries');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      await waitFor(() =>
        expect(mockedApi.updateClient).toHaveBeenCalledWith(1, {
          name: 'Acme Industries',
          department: 'Engineering',
          email: 'contact@acme.test',
          description: 'Main customer',
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] });
      expect(mockedApi.createClient).not.toHaveBeenCalled();
    });

    it('pre-fills empty strings for null optional fields', async () => {
      const { user } = renderPage();

      await user.click(await getRowButton('Globex', 'EditIcon'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText(/client name/i)).toHaveValue('Globex');
      expect(within(dialog).getByLabelText(/department/i)).toHaveValue('');
      expect(within(dialog).getByLabelText(/email/i)).toHaveValue('');
      expect(within(dialog).getByLabelText(/description/i)).toHaveValue('');
    });

    it('sends undefined for blank optional fields on update', async () => {
      mockedApi.updateClient.mockResolvedValue({ client: sparseClient });
      const { user } = renderPage();

      await user.click(await getRowButton('Globex', 'EditIcon'));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      await waitFor(() =>
        expect(mockedApi.updateClient).toHaveBeenCalledWith(2, {
          name: 'Globex',
          description: undefined,
          department: undefined,
          email: undefined,
        }),
      );
    });

    it('surfaces the API error message when the update fails', async () => {
      mockedApi.updateClient.mockRejectedValue(apiError('Invalid email'));
      const { user } = renderPage();

      await user.click(await getRowButton('Acme Corp', 'EditIcon'));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Invalid email');
    });

    it('falls back to a generic message when the update fails without details', async () => {
      mockedApi.updateClient.mockRejectedValue(new Error('boom'));
      const { user } = renderPage();

      await user.click(await getRowButton('Acme Corp', 'EditIcon'));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Failed to update client');
    });
  });

  describe('delete', () => {
    it('deletes a client when confirmed and invalidates the clients query', async () => {
      mockedApi.deleteClient.mockResolvedValue({ message: 'deleted' });
      const { user, invalidateSpy } = renderPage();

      await user.click(await getRowButton('Globex', 'DeleteIcon'));

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete "Globex"?');
      await waitFor(() => expect(mockedApi.deleteClient).toHaveBeenCalledWith(2));
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] }),
      );
    });

    it('does not delete when the confirmation is cancelled', async () => {
      confirmSpy.mockReturnValue(false);
      const { user } = renderPage();

      await user.click(await getRowButton('Globex', 'DeleteIcon'));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(mockedApi.deleteClient).not.toHaveBeenCalled();
    });

    it('surfaces the API error message when delete fails and allows dismissing it', async () => {
      mockedApi.deleteClient.mockRejectedValue(apiError('Client has work entries'));
      const { user } = renderPage();

      await user.click(await getRowButton('Acme Corp', 'DeleteIcon'));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Client has work entries');

      await user.click(within(alert).getByRole('button', { name: /close/i }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('falls back to a generic message when delete fails without details', async () => {
      mockedApi.deleteClient.mockRejectedValue(new Error('boom'));
      const { user } = renderPage();

      await user.click(await getRowButton('Acme Corp', 'DeleteIcon'));

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete client');
    });
  });

  describe('delete all', () => {
    it('deletes all clients when confirmed and invalidates the clients query', async () => {
      mockedApi.deleteAllClients.mockResolvedValue({ message: 'deleted' });
      const { user, invalidateSpy } = renderPage();

      await user.click(await screen.findByRole('button', { name: /clear all/i }));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete ALL clients? This action cannot be undone.',
      );
      await waitFor(() => expect(mockedApi.deleteAllClients).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] }),
      );
    });

    it('does not delete all when the confirmation is cancelled', async () => {
      confirmSpy.mockReturnValue(false);
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /clear all/i }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(mockedApi.deleteAllClients).not.toHaveBeenCalled();
    });

    it('shows a pending label while clearing', async () => {
      mockedApi.deleteAllClients.mockReturnValue(new Promise(() => {}));
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /clear all/i }));

      const pendingButton = await screen.findByRole('button', { name: /clearing/i });
      expect(pendingButton).toBeDisabled();
    });

    it('surfaces the API error message when delete all fails', async () => {
      mockedApi.deleteAllClients.mockRejectedValue(apiError('Database locked'));
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /clear all/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Database locked');
    });

    it('falls back to a generic message when delete all fails without details', async () => {
      mockedApi.deleteAllClients.mockRejectedValue(new Error('boom'));
      const { user } = renderPage();

      await user.click(await screen.findByRole('button', { name: /clear all/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete all clients');
    });
  });
});
