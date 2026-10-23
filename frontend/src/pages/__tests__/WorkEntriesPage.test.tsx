import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../api/client';
import { usePredictDuration } from '../../hooks/usePredictDuration';
import WorkEntriesPage from '../WorkEntriesPage';

vi.mock('../../api/client', () => ({
  default: {
    getClients: vi.fn(),
    getWorkEntries: vi.fn(),
  },
}));

vi.mock('../../hooks/usePredictDuration', () => ({
  usePredictDuration: vi.fn(),
}));

describe('WorkEntriesPage prediction suggestions', () => {
  const mutate = vi.fn();
  const reset = vi.fn();
  const predictionResult = {
    mutate,
    mutateAsync: vi.fn(),
    reset,
    data: { predictedHours: 3.25 },
    error: null,
    variables: { clientId: 1 },
    isError: false,
    isIdle: false,
    isPending: false,
    isSuccess: true,
    status: 'success',
    submittedAt: 0,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    context: undefined,
  } satisfies Partial<ReturnType<typeof usePredictDuration>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getClients).mockResolvedValue({
      clients: [{ id: 1, name: 'Example Client' }],
    });
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries: [] });
    vi.mocked(usePredictDuration).mockReturnValue(
      predictionResult as ReturnType<typeof usePredictDuration>,
    );
  });

  it('requests and applies a suggested duration', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkEntriesPage />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Add Work Entry' }));
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    await user.click(await screen.findByRole('option', { name: 'Example Client' }));
    await user.type(screen.getByRole('textbox', { name: 'Description' }), '  Feature work  ');

    expect(await screen.findByText('Suggested: 3.25 hours')).toBeInTheDocument();
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 1,
        description: 'Feature work',
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }));
    });

    await user.click(screen.getByRole('button', { name: 'Apply suggestion' }));
    expect(screen.getByRole('spinbutton', { name: 'Hours' })).toHaveValue(3.25);
  });
});
