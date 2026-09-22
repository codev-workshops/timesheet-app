import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkEntriesPage from '../pages/WorkEntriesPage';
import { renderWithProviders } from '../test/utils';
import type { WorkEntry } from '../types/api';

vi.mock('../api/client', () => ({
  default: {
    getClients: vi.fn(),
    getWorkEntries: vi.fn(),
    createWorkEntry: vi.fn(),
    updateWorkEntry: vi.fn(),
    deleteWorkEntry: vi.fn(),
  },
}));

import apiClient from '../api/client';
const api = vi.mocked(apiClient);

const clients = [{ id: 1, name: 'Acme' }, { id: 2, name: 'Globex' }];
const entry: WorkEntry = {
  id: 10, client_id: 1, client_name: 'Acme', hours: 2.5, description: 'Design',
  date: '2024-03-10', created_at: '2024-03-10T00:00:00Z', updated_at: '2024-03-10T00:00:00Z',
};
const bareEntry: WorkEntry = { ...entry, id: 11, description: null, hours: 1 };

const dialog = () => screen.getByRole('dialog');
const pickClient = async (name: string) => {
  await userEvent.click(within(dialog()).getByRole('combobox'));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('WorkEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getClients.mockResolvedValue({ clients });
    api.getWorkEntries.mockResolvedValue({ workEntries: [entry, bareEntry] });
  });

  test('prompts to create a client first when none exist', async () => {
    api.getClients.mockResolvedValue({ clients: [] });
    renderWithProviders(<WorkEntriesPage />);

    expect(await screen.findByText(/create at least one client before adding work entries/)).toBeInTheDocument();
  });

  test('lists entries with hours chip and description placeholder', async () => {
    renderWithProviders(<WorkEntriesPage />);

    expect(await screen.findByText('2.5 hours')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  test('shows the empty state when there are clients but no entries', async () => {
    api.getWorkEntries.mockResolvedValue({ workEntries: [] });
    renderWithProviders(<WorkEntriesPage />);

    expect(await screen.findByText(/No work entries found/)).toBeInTheDocument();
  });

  test('create form enforces client selection and the 0-24 hours range client-side', async () => {
    api.createWorkEntry.mockResolvedValue({ workEntry: entry });
    renderWithProviders(<WorkEntriesPage />);
    await screen.findByText('2.5 hours');

    await userEvent.click(screen.getByRole('button', { name: 'Add Work Entry' }));
    expect(within(dialog()).getByText('Add New Work Entry')).toBeInTheDocument();

    await userEvent.type(within(dialog()).getByLabelText(/Hours/), '3');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Please select a client')).toBeInTheDocument();

    await pickClient('Globex');
    await userEvent.clear(within(dialog()).getByLabelText(/Hours/));
    await userEvent.type(within(dialog()).getByLabelText(/Hours/), '25');
    // The input's native max=24 blocks submit-by-click, so drive the submit
    // event directly to reach the component's own range guard.
    fireEvent.submit(within(dialog()).getByLabelText(/Hours/).closest('form')!);
    expect(await screen.findByText('Hours must be between 0 and 24')).toBeInTheDocument();
    expect(api.createWorkEntry).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog()).getByLabelText(/Hours/));
    await userEvent.type(within(dialog()).getByLabelText(/Hours/), '24');
    await userEvent.type(within(dialog()).getByLabelText(/Description/), 'Full day');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(api.createWorkEntry).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 2, hours: 24, description: 'Full day', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('server-side validation errors from create are displayed', async () => {
    api.createWorkEntry.mockRejectedValue({ response: { data: { error: '"hours" must be less than or equal to 24' } } });
    renderWithProviders(<WorkEntriesPage />);
    await screen.findByText('2.5 hours');

    await userEvent.click(screen.getByRole('button', { name: 'Add Work Entry' }));
    await pickClient('Acme');
    await userEvent.type(within(dialog()).getByLabelText(/Hours/), '5');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('"hours" must be less than or equal to 24')).toBeInTheDocument();
  });

  test('edit prefills the form and submits an update for that entry id', async () => {
    api.updateWorkEntry.mockResolvedValue({ workEntry: entry });
    renderWithProviders(<WorkEntriesPage />);
    await screen.findByText('2.5 hours');

    const row = screen.getByText('Design').closest('tr')!;
    const [editBtn] = within(row).getAllByRole('button');
    await userEvent.click(editBtn);

    expect(within(dialog()).getByText('Edit Work Entry')).toBeInTheDocument();
    expect(within(dialog()).getByLabelText(/Hours/)).toHaveValue(2.5);
    expect(within(dialog()).getByLabelText(/Description/)).toHaveValue('Design');

    await userEvent.clear(within(dialog()).getByLabelText(/Hours/));
    await userEvent.type(within(dialog()).getByLabelText(/Hours/), '4');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(api.updateWorkEntry).toHaveBeenCalledWith(10, expect.objectContaining({ clientId: 1, hours: 4, description: 'Design', date: '2024-03-10' }))
    );
  });

  test('delete respects the confirm dialog', async () => {
    api.deleteWorkEntry.mockResolvedValue({ message: 'ok' });
    const confirm = vi.spyOn(window, 'confirm');
    renderWithProviders(<WorkEntriesPage />);
    await screen.findByText('2.5 hours');

    const row = screen.getByText('Design').closest('tr')!;
    const [, deleteBtn] = within(row).getAllByRole('button');

    confirm.mockReturnValueOnce(false);
    await userEvent.click(deleteBtn);
    expect(api.deleteWorkEntry).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await userEvent.click(deleteBtn);
    await waitFor(() => expect(api.deleteWorkEntry).toHaveBeenCalledWith(10));
    expect(confirm).toHaveBeenLastCalledWith('Are you sure you want to delete this 2.5 hour entry for Acme?');
  });

  test('delete failure shows the fallback error', async () => {
    api.deleteWorkEntry.mockRejectedValue(new Error('x'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<WorkEntriesPage />);
    await screen.findByText('2.5 hours');

    const row = screen.getByText('Design').closest('tr')!;
    await userEvent.click(within(row).getAllByRole('button')[1]);

    expect(await screen.findByText('Failed to delete work entry')).toBeInTheDocument();
  });
});
