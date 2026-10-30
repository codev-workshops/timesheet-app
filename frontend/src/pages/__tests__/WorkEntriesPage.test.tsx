import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import WorkEntriesPage from '../WorkEntriesPage';
import apiClient from '../../api/client';
import type { Client, WorkEntry } from '../../types/api';

vi.mock('../../api/client', () => ({
  default: {
    getWorkEntries: vi.fn(),
    getClients: vi.fn(),
    createWorkEntry: vi.fn(),
    updateWorkEntry: vi.fn(),
    deleteWorkEntry: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

const clients: Client[] = [
  {
    id: 1,
    name: 'Acme Corp',
    description: null,
    department: null,
    email: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Globex',
    description: null,
    department: null,
    email: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const workEntries: WorkEntry[] = [
  {
    id: 10,
    client_id: 1,
    client_name: 'Acme Corp',
    hours: 7.5,
    description: 'Built the reporting module',
    date: '2024-01-15',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 11,
    client_id: 2,
    client_name: 'Globex',
    hours: 3,
    description: null,
    date: '2024-02-20',
    created_at: '2024-02-20T00:00:00Z',
    updated_at: '2024-02-20T00:00:00Z',
  },
];

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/work-entries']}>
        <WorkEntriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, queryClient };
};

const axiosError = (message?: string) => ({
  response: { data: message ? { error: message } : {} },
});

const getRowFor = async (text: string): Promise<HTMLElement> => {
  const cell = await screen.findByText(text);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No table row found for "${text}"`);
  return row;
};

const getIconButton = (container: HTMLElement, testId: string): HTMLElement => {
  const button = within(container).getByTestId(testId).closest('button');
  if (!button) throw new Error(`No button found for icon "${testId}"`);
  return button;
};

// The page renders its error Alert outside the modal Dialog, so while the dialog
// is open the Alert sits in the aria-hidden background and needs `hidden: true`.
const findAlertBehindDialog = () => screen.findByRole('alert', { hidden: true });

const openCreateDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /add work entry/i }));
  return screen.findByRole('dialog');
};

describe('WorkEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getWorkEntries.mockResolvedValue({ workEntries });
    mockedApi.getClients.mockResolvedValue({ clients });
    mockedApi.createWorkEntry.mockResolvedValue({ message: 'created' });
    mockedApi.updateWorkEntry.mockResolvedValue({ message: 'updated' });
    mockedApi.deleteWorkEntry.mockResolvedValue({ message: 'deleted' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('data display', () => {
    it('shows a loading spinner while queries are pending', () => {
      mockedApi.getWorkEntries.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByText('Work Entries')).not.toBeInTheDocument();
    });

    it('renders the populated entries table', async () => {
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Work Entries' })).toBeInTheDocument();
      expect(mockedApi.getWorkEntries).toHaveBeenCalledTimes(1);
      expect(mockedApi.getWorkEntries).toHaveBeenCalledWith();
      expect(mockedApi.getClients).toHaveBeenCalledTimes(1);

      const table = screen.getByRole('table');
      ['Client', 'Date', 'Hours', 'Description', 'Actions'].forEach((header) => {
        expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
      });

      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(3);

      const first = rows[1];
      expect(within(first).getByText('Acme Corp')).toBeInTheDocument();
      expect(within(first).getByText(new Date('2024-01-15').toLocaleDateString())).toBeInTheDocument();
      expect(within(first).getByText('7.5 hours')).toBeInTheDocument();
      expect(within(first).getByText('Built the reporting module')).toBeInTheDocument();

      const second = rows[2];
      expect(within(second).getByText('Globex')).toBeInTheDocument();
      expect(within(second).getByText(new Date('2024-02-20').toLocaleDateString())).toBeInTheDocument();
      expect(within(second).getByText('3 hours')).toBeInTheDocument();
      expect(within(second).getByText('No description')).toBeInTheDocument();
    });

    it('shows the empty-table message when there are no entries', async () => {
      mockedApi.getWorkEntries.mockResolvedValue({ workEntries: [] });
      renderPage();

      expect(
        await screen.findByText('No work entries found. Add your first work entry to get started.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('treats missing response payloads as empty lists', async () => {
      mockedApi.getWorkEntries.mockResolvedValue({});
      mockedApi.getClients.mockResolvedValue({});
      renderPage();

      expect(
        await screen.findByText('You need to create at least one client before adding work entries.'),
      ).toBeInTheDocument();
    });

    it('prompts to create a client when none exist', async () => {
      mockedApi.getClients.mockResolvedValue({ clients: [] });
      renderPage();

      expect(
        await screen.findByText('You need to create at least one client before adding work entries.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Create Client' })).toHaveAttribute('href', '/clients');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('create dialog', () => {
    it('opens an empty dialog listing clients and closes on cancel', async () => {
      const { user } = renderPage();
      const dialog = await openCreateDialog(user);

      expect(within(dialog).getByText('Add New Work Entry')).toBeInTheDocument();
      expect(within(dialog).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(null);
      expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('');
      expect(within(dialog).getByRole('button', { name: 'Create' })).toBeInTheDocument();

      await user.click(within(dialog).getByRole('combobox'));
      const listbox = await screen.findByRole('listbox');
      expect(within(listbox).getByRole('option', { name: 'Acme Corp' })).toBeInTheDocument();
      expect(within(listbox).getByRole('option', { name: 'Globex' })).toBeInTheDocument();
      await user.keyboard('{Escape}');

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('submits a new entry with the filled-in fields', async () => {
      const { user } = renderPage();
      const dialog = await openCreateDialog(user);

      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Globex' }));
      expect(within(dialog).getByRole('combobox')).toHaveTextContent('Globex');

      await user.type(within(dialog).getByRole('spinbutton', { name: 'Hours' }), '6.25');

      await user.click(within(dialog).getByRole('spinbutton', { name: 'Month' }));
      await user.keyboard('03152024');
      expect(within(dialog).getByRole('spinbutton', { name: 'Month' })).toHaveTextContent('03');
      expect(within(dialog).getByRole('spinbutton', { name: 'Day' })).toHaveTextContent('15');
      expect(within(dialog).getByRole('spinbutton', { name: 'Year' })).toHaveTextContent('2024');

      await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'Sprint planning');

      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(mockedApi.createWorkEntry).toHaveBeenCalledTimes(1));
      expect(mockedApi.createWorkEntry).toHaveBeenCalledWith({
        clientId: 2,
        hours: 6.25,
        description: 'Sprint planning',
        date: new Date(2024, 2, 15).toISOString().split('T')[0],
      });

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(mockedApi.getWorkEntries).toHaveBeenCalledTimes(2));
      expect(mockedApi.updateWorkEntry).not.toHaveBeenCalled();
    });

    it('defaults the date to today and omits an empty description', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2024-06-10T12:00:00Z'));
      const { user } = renderPage();
      const dialog = await openCreateDialog(user);

      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Acme Corp' }));
      await user.type(within(dialog).getByRole('spinbutton', { name: 'Hours' }), '2');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(mockedApi.createWorkEntry).toHaveBeenCalledWith({
          clientId: 1,
          hours: 2,
          description: undefined,
          date: '2024-06-10',
        }),
      );
    });

    it('shows a loading indicator and disables inputs while saving', async () => {
      mockedApi.createWorkEntry.mockReturnValue(new Promise(() => {}));
      const { user } = renderPage();
      const dialog = await openCreateDialog(user);

      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Acme Corp' }));
      await user.type(within(dialog).getByRole('spinbutton', { name: 'Hours' }), '4');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(within(dialog).getByRole('progressbar')).toBeInTheDocument());
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(within(dialog).getByRole('spinbutton', { name: 'Hours' })).toBeDisabled();
      expect(within(dialog).getByRole('textbox', { name: 'Description' })).toBeDisabled();
    });

    it('requires a client to be selected', async () => {
      const { user } = renderPage();
      const dialog = await openCreateDialog(user);

      await user.type(within(dialog).getByRole('spinbutton', { name: 'Hours' }), '5');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Please select a client');
      expect(mockedApi.createWorkEntry).not.toHaveBeenCalled();
    });

    it.each(['30', '0', '-1'])('rejects out-of-range hours (%s)', async (hours) => {
      const { user } = renderPage();
      const dialog = await openCreateDialog(user);

      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Acme Corp' }));
      fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Hours' }), {
        target: { value: hours },
      });
      const form = within(dialog).getByRole('button', { name: 'Create' }).closest('form');
      if (!form) throw new Error('Form not found');
      fireEvent.submit(form);

      expect(await findAlertBehindDialog()).toHaveTextContent('Hours must be between 0 and 24');
      expect(mockedApi.createWorkEntry).not.toHaveBeenCalled();
    });
  });

  describe('edit flow', () => {
    it('pre-fills the dialog and submits an update', async () => {
      const { user } = renderPage();
      const row = await getRowFor('Built the reporting module');

      await user.click(getIconButton(row, 'EditIcon'));
      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByText('Edit Work Entry')).toBeInTheDocument();
      expect(within(dialog).getByRole('combobox')).toHaveTextContent('Acme Corp');
      expect(within(dialog).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(7.5);
      expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue(
        'Built the reporting module',
      );
      const expectedDate = new Date('2024-01-15');
      expect(within(dialog).getByRole('spinbutton', { name: 'Year' })).toHaveTextContent(
        String(expectedDate.getFullYear()),
      );
      expect(within(dialog).getByRole('spinbutton', { name: 'Day' })).toHaveTextContent(
        String(expectedDate.getDate()).padStart(2, '0'),
      );

      const hoursInput = within(dialog).getByRole('spinbutton', { name: 'Hours' });
      await user.clear(hoursInput);
      await user.type(hoursInput, '8');
      const descriptionInput = within(dialog).getByRole('textbox', { name: 'Description' });
      await user.clear(descriptionInput);
      await user.type(descriptionInput, 'Refactored reports');

      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      await waitFor(() => expect(mockedApi.updateWorkEntry).toHaveBeenCalledTimes(1));
      expect(mockedApi.updateWorkEntry).toHaveBeenCalledWith(10, {
        clientId: 1,
        hours: 8,
        description: 'Refactored reports',
        date: '2024-01-15',
      });
      expect(mockedApi.createWorkEntry).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(mockedApi.getWorkEntries).toHaveBeenCalledTimes(2));
    });

    it('pre-fills an empty description for entries without one', async () => {
      const { user } = renderPage();
      const row = await getRowFor('Globex');

      await user.click(getIconButton(row, 'EditIcon'));
      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByRole('combobox')).toHaveTextContent('Globex');
      expect(within(dialog).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(3);
      expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('');
    });

    it('resets to a blank form when reopening in create mode after editing', async () => {
      const { user } = renderPage();
      const row = await getRowFor('Built the reporting module');

      await user.click(getIconButton(row, 'EditIcon'));
      const editDialog = await screen.findByRole('dialog');
      await user.click(within(editDialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      const dialog = await openCreateDialog(user);
      expect(within(dialog).getByText('Add New Work Entry')).toBeInTheDocument();
      expect(within(dialog).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(null);
      expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('');
    });
  });

  describe('delete flow', () => {
    it('deletes the entry when the user confirms', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { user } = renderPage();
      const row = await getRowFor('Built the reporting module');

      await user.click(getIconButton(row, 'DeleteIcon'));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete this 7.5 hour entry for Acme Corp?',
      );
      await waitFor(() => expect(mockedApi.deleteWorkEntry).toHaveBeenCalledTimes(1));
      expect(mockedApi.deleteWorkEntry.mock.calls[0][0]).toBe(10);
      await waitFor(() => expect(mockedApi.getWorkEntries).toHaveBeenCalledTimes(2));
    });

    it('does nothing when the user cancels the confirmation', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { user } = renderPage();
      const row = await getRowFor('Globex');

      await user.click(getIconButton(row, 'DeleteIcon'));

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this 3 hour entry for Globex?');
      expect(mockedApi.deleteWorkEntry).not.toHaveBeenCalled();
      expect(mockedApi.getWorkEntries).toHaveBeenCalledTimes(1);
    });
  });

  describe('mutation errors', () => {
    const fillAndSubmitCreate = async (user: ReturnType<typeof userEvent.setup>) => {
      const dialog = await openCreateDialog(user);
      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Acme Corp' }));
      await user.type(within(dialog).getByRole('spinbutton', { name: 'Hours' }), '1');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      return dialog;
    };

    it('shows the server error when creating fails and keeps the dialog open', async () => {
      mockedApi.createWorkEntry.mockRejectedValue(axiosError('Client not found'));
      const { user } = renderPage();

      const dialog = await fillAndSubmitCreate(user);

      expect(await findAlertBehindDialog()).toHaveTextContent('Client not found');
      expect(dialog).toBeInTheDocument();
    });

    it('falls back to a generic message when creating fails without details', async () => {
      mockedApi.createWorkEntry.mockRejectedValue(new Error('Network Error'));
      const { user } = renderPage();

      await fillAndSubmitCreate(user);

      expect(await findAlertBehindDialog()).toHaveTextContent('Failed to create work entry');
    });

    it('shows the server error when updating fails', async () => {
      mockedApi.updateWorkEntry.mockRejectedValue(axiosError('Work entry not found'));
      const { user } = renderPage();
      const row = await getRowFor('Built the reporting module');

      await user.click(getIconButton(row, 'EditIcon'));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Work entry not found');
    });

    it('falls back to a generic message when updating fails without details', async () => {
      mockedApi.updateWorkEntry.mockRejectedValue(axiosError());
      const { user } = renderPage();
      const row = await getRowFor('Built the reporting module');

      await user.click(getIconButton(row, 'EditIcon'));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      expect(await findAlertBehindDialog()).toHaveTextContent('Failed to update work entry');
    });

    it('shows the server error when deleting fails and lets the user dismiss it', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockedApi.deleteWorkEntry.mockRejectedValue(axiosError('Cannot delete entry'));
      const { user } = renderPage();
      const row = await getRowFor('Built the reporting module');

      await user.click(getIconButton(row, 'DeleteIcon'));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Cannot delete entry');

      await user.click(within(alert).getByRole('button', { name: /close/i }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('falls back to a generic message when deleting fails without details', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockedApi.deleteWorkEntry.mockRejectedValue(new Error('boom'));
      const { user } = renderPage();
      const row = await getRowFor('Globex');

      await user.click(getIconButton(row, 'DeleteIcon'));

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete work entry');
    });
  });
});
