import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Profiler,
  type ComponentProps,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../api/client';
import WorkEntriesTable from '../../components/WorkEntriesTable';
import { usePredictDuration } from '../../hooks/usePredictDuration';
import WorkEntriesPage from '../WorkEntriesPage';

type WorkEntriesTableMemo = {
  type: (props: ComponentProps<typeof WorkEntriesTable>) => ReactNode;
};

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

  it('profiles description typing with 1500 work entries', async () => {
    const workEntries = Array.from({ length: 1500 }, (_, index) => ({
      id: index + 1,
      client_id: 1,
      hours: 1.5,
      description: 'Performance sample',
      date: '2025-01-01',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      client_name: 'Example Client',
    }));
    vi.mocked(apiClient.getWorkEntries).mockResolvedValue({ workEntries });

    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let isTyping = false;
    const profileDurations: number[] = [];
    const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
      if (isTyping && phase === 'update') {
        profileDurations.push(actualDuration);
      }
    };
    const tableRenderSpy = vi.spyOn(
      WorkEntriesTable as unknown as WorkEntriesTableMemo,
      'type',
    );

    render(
      <QueryClientProvider client={queryClient}>
        <Profiler id="work-entries-page" onRender={onRender}>
          <WorkEntriesPage />
        </Profiler>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Add Work Entry' }));
    const tableRendersBeforeTyping = tableRenderSpy.mock.calls.length;
    const description = screen.getByRole('textbox', { name: 'Description' });
    isTyping = true;
    const startedAt = performance.now();
    await user.type(description, 'abcdefghijklmnopqrst');
    const elapsed = performance.now() - startedAt;
    isTyping = false;

    console.info(
      `WORK_ENTRIES_TYPING_PROFILE after entries=1500 chars=20 elapsedMs=${elapsed.toFixed(1)} profilerCommits=${profileDurations.length} profilerActualMs=${profileDurations.reduce((total, duration) => total + duration, 0).toFixed(1)} tableRenders=${tableRenderSpy.mock.calls.length}`,
    );
    expect(description).toHaveValue('abcdefghijklmnopqrst');
    expect(tableRendersBeforeTyping).toBe(1);
    expect(tableRenderSpy).toHaveBeenCalledTimes(1);
    tableRenderSpy.mockRestore();
  }, 90_000);
});
