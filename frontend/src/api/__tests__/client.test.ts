import { describe, expect, it, vi } from 'vitest';
import apiClient from '../client';

const { mockAxiosClient, mockAxiosCreate } = vi.hoisted(() => {
  const client = {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    mockAxiosClient: client,
    mockAxiosCreate: vi.fn(() => client),
  };
});

vi.mock('axios', () => ({
  default: { create: mockAxiosCreate },
}));

describe('ApiClient.predictDuration', () => {
  it('posts the prediction input to the prediction endpoint', async () => {
    const input = { clientId: 1, description: 'bug fix' };
    const response = { predictedHours: 3.5 };
    mockAxiosClient.post.mockResolvedValue({ data: response });

    await expect(apiClient.predictDuration(input)).resolves.toEqual(response);
    expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/predictions', input);
  });
});
