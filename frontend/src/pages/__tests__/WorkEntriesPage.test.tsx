import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import WorkEntriesPage from '../WorkEntriesPage';
import apiClient from '../../api/client';
import { renderWithProviders } from '../../test/utils';
import { clients, workEntries } from '../../test/fixtures';

vi.mock('../../api/client', async () => (await import('../../test/apiClientMock')).createApiClientMock());

const renderPage = async () => {
  renderWithProviders(<WorkEntriesPage />, { route: '/work-entries' });
  await screen.findByText('Design review');
};

const openDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add Work Entry' }));
  return screen.getByRole('dialog');
};

const getForm = (dialog: HTMLElement): HTMLFormElement => {
  const form = dialog.querySelector('form');
  if (!form) throw new Error('form not found');
  return form;
};

const selectClient = (dialog: HTMLElement, name: string) => {
  fireEvent.mouseDown(within(dialog).getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name }));
};

const setHours = (dialog: HTMLElement, value: string) =>
  fireEvent.change(within(dialog).getByLabelText(/^Hours/), { target: { value } });

const iconButton = (testId: string, index = 0): HTMLElement => {
  const button = screen.getAllByTestId(testId)[index].closest('button');
  if (!button) throw new Error(`${testId} button not found`);
  return button;
};

describe('WorkEntriesPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients });
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries });
  });

  it('shows a spinner while loading', () => {
    vi.mocked(apiClient.getWorkEntries).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<WorkEntriesPage />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('prompts to create a client when none exist', async () => {
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients: [] });
    renderWithProviders(<WorkEntriesPage />);

    expect(await screen.findByText(/You need to create at least one client/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Client' })).toHaveAttribute('href', '/clients');
  });

  it('renders work entries', async () => {
    await renderPage();

    expect(screen.getByText('2.5 hours')).toBeInTheDocument();
    expect(screen.getByText('5 hours')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('shows the empty state when there are no entries', async () => {
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries: [] });
    renderWithProviders(<WorkEntriesPage />);

    expect(await screen.findByText(/No work entries found/)).toBeInTheDocument();
  });

  it('requires a client', async () => {
    await renderPage();
    const dialog = openDialog();

    fireEvent.submit(getForm(dialog));

    expect(await screen.findByText('Please select a client')).toBeInTheDocument();
  });

  it.each(['30', '0', ''])('rejects invalid hours "%s"', async (hours) => {
    await renderPage();
    const dialog = openDialog();

    selectClient(dialog, 'Acme Corp');
    setHours(dialog, hours);
    fireEvent.submit(getForm(dialog));

    expect(await screen.findByText('Hours must be between 0 and 24')).toBeInTheDocument();
    expect(apiClient.createWorkEntry).not.toHaveBeenCalled();
  });

  it('creates a work entry', async () => {
    vi.mocked(apiClient.createWorkEntry).mockResolvedValue({ workEntry: workEntries[0] });
    await renderPage();
    const dialog = openDialog();
    expect(within(dialog).getByText('Add New Work Entry')).toBeInTheDocument();

    selectClient(dialog, 'Globex');
    setHours(dialog, '3.25');
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Planning' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(apiClient.createWorkEntry).toHaveBeenCalledWith({
        clientId: 2,
        hours: 3.25,
        description: 'Planning',
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(apiClient.getWorkEntries).toHaveBeenCalledTimes(2));
  });

  it('shows the server error when creation fails', async () => {
    vi.mocked(apiClient.createWorkEntry).mockRejectedValue({ response: { data: { error: 'Client not found' } } });
    await renderPage();
    const dialog = openDialog();

    selectClient(dialog, 'Acme Corp');
    setHours(dialog, '1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Client not found')).toBeInTheDocument();
  });

  it('falls back to a generic creation error', async () => {
    vi.mocked(apiClient.createWorkEntry).mockRejectedValue(new Error('boom'));
    await renderPage();
    const dialog = openDialog();

    selectClient(dialog, 'Acme Corp');
    setHours(dialog, '1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Failed to create work entry')).toBeInTheDocument();
  });

  it('edits an existing entry', async () => {
    vi.mocked(apiClient.updateWorkEntry).mockResolvedValue({ workEntry: workEntries[0] });
    await renderPage();

    fireEvent.click(iconButton('EditIcon'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit Work Entry')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Hours/)).toHaveValue(2.5);

    setHours(dialog, '4');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(apiClient.updateWorkEntry).toHaveBeenCalledWith(10, {
        clientId: 1,
        hours: 4,
        description: 'Design review',
        date: '2024-01-15',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows an error when updating fails', async () => {
    vi.mocked(apiClient.updateWorkEntry).mockRejectedValue(new Error('boom'));
    await renderPage();

    fireEvent.click(iconButton('EditIcon', 1));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    expect(await screen.findByText('Failed to update work entry')).toBeInTheDocument();
  });

  it('closes the dialog on cancel', async () => {
    await renderPage();
    const dialog = openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('deletes an entry after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.deleteWorkEntry).mockResolvedValue({ message: 'deleted' });
    await renderPage();

    fireEvent.click(iconButton('DeleteIcon'));

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this 2.5 hour entry for Acme Corp?');
    await waitFor(() => expect(apiClient.deleteWorkEntry).toHaveBeenCalledWith(10));
    await waitFor(() => expect(apiClient.getWorkEntries).toHaveBeenCalledTimes(2));
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPage();

    fireEvent.click(iconButton('DeleteIcon'));

    expect(apiClient.deleteWorkEntry).not.toHaveBeenCalled();
  });

  it('shows and dismisses a delete error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.deleteWorkEntry).mockRejectedValue({ response: { data: { error: 'Not found' } } });
    await renderPage();

    fireEvent.click(iconButton('DeleteIcon'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not found');

    fireEvent.click(within(alert).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to a generic delete error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.deleteWorkEntry).mockRejectedValue(new Error('boom'));
    await renderPage();

    fireEvent.click(iconButton('DeleteIcon'));

    expect(await screen.findByText('Failed to delete work entry')).toBeInTheDocument();
  });
});
