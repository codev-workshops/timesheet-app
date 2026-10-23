import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../api/client';
import { usePredictDuration } from '../usePredictDuration';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: { predictDuration: vi.fn() },
}));

vi.mock('../../api/client', () => ({
  default: mockApiClient,
}));

const apiClientMock = vi.mocked(apiClient);

describe('usePredictDuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the API client and returns the predicted hours', async () => {
    const input = { clientId: 1, description: 'bug fix' };
    apiClientMock.predictDuration.mockResolvedValue({ predictedHours: 3.5 });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { result } = renderHook(() => usePredictDuration(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await expect(result.current.mutateAsync(input)).resolves.toEqual({ predictedHours: 3.5 });
    await waitFor(() => {
      expect(apiClientMock.predictDuration).toHaveBeenCalledWith(input);
      expect(result.current.data?.predictedHours).toBe(3.5);
    });
  });
});
