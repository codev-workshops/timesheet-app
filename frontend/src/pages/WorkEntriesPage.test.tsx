import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../api/client';
import WorkEntriesPage from './WorkEntriesPage';

vi.mock('../api/client', () => ({
  default: {
    getWorkEntries: vi.fn(),
    getClients: vi.fn(),
    createWorkEntry: vi.fn(),
    updateWorkEntry: vi.fn(),
  },
}));

const client = { id: 1, name: 'Example Consulting' };
const workEntry = {
  id: 7,
  client_id: client.id,
  client_name: client.name,
  hours: 2,
  description: 'Project planning',
  date: new Date(2026, 1, 20, 12).toISOString(),
};

describe('WorkEntriesPage date validation', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 1, 20, 12));
    vi.clearAllMocks();
    vi.mocked(apiClient.getClients).mockResolvedValue({ clients: [client] });
    vi.mocked(apiClient.createWorkEntry).mockResolvedValue({ workEntry });
    vi.mocked(apiClient.updateWorkEntry).mockResolvedValue({ workEntry });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['Update', 'Create'])('%s rejects an impossible date and saves after correction', async (action) => {
    const user = userEvent.setup();
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({
      workEntries: action === 'Update' ? [workEntry] : [],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkEntriesPage />
      </QueryClientProvider>,
    );

    if (action === 'Update') {
      await user.click((await screen.findByTestId('EditIcon')).closest('button')!);
    } else {
      await user.click(await screen.findByRole('button', { name: 'Add Work Entry' }));
      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: client.name }));
      await user.type(screen.getByRole('spinbutton', { name: 'Hours' }), '2');
    }

    const dialog = within(screen.getByRole('dialog'));
    const day = dialog.getByRole('spinbutton', { name: 'Day' });
    const submit = dialog.getByRole('button', { name: action });

    await user.click(day);
    await user.keyboard('31');
    expect(day).toHaveTextContent('31');
    await user.click(submit);

    expect(dialog.getByText('Enter a valid date')).toBeVisible();
    expect(apiClient.createWorkEntry).not.toHaveBeenCalled();
    expect(apiClient.updateWorkEntry).not.toHaveBeenCalled();

    await user.click(day);
    await user.keyboard('28');
    expect(day).toHaveTextContent('28');
    expect(dialog.queryByText('Enter a valid date')).not.toBeInTheDocument();
    await user.click(submit);

    const save = action === 'Update' ? apiClient.updateWorkEntry : apiClient.createWorkEntry;
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
});
