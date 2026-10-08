import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

type RequestFulfilled = (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
type ResponseFulfilled = (response: AxiosResponse) => AxiosResponse;
type Rejected = (error: unknown) => Promise<never>;

const mocks = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn<(onFulfilled: RequestFulfilled, onRejected: Rejected) => number>() },
      response: { use: vi.fn<(onFulfilled: ResponseFulfilled, onRejected: Rejected) => number>() },
    },
  };
  return { instance, create: vi.fn(() => instance) };
});

vi.mock('axios', () => ({ default: { create: mocks.create } }));

import apiClient from '../client';

const { instance } = mocks;
const createConfig = mocks.create.mock.calls[0] as unknown[];
const [onRequest, onRequestError] = instance.interceptors.request.use.mock.calls[0];
const [onResponse, onResponseError] = instance.interceptors.response.use.mock.calls[0];

const makeConfig = (): InternalAxiosRequestConfig =>
  ({ headers: {} }) as unknown as InternalAxiosRequestConfig;

describe('apiClient', () => {
  beforeEach(() => {
    instance.get.mockReset();
    instance.post.mockReset();
    instance.put.mockReset();
    instance.delete.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an axios instance with relative base URL, timeout and JSON headers', () => {
    expect(createConfig[0]).toEqual({
      baseURL: '',
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  describe('request interceptor', () => {
    it('adds the x-user-email header when a user is stored', () => {
      localStorage.setItem('userEmail', 'jane@example.com');
      const config = onRequest(makeConfig());
      expect(config.headers['x-user-email']).toBe('jane@example.com');
    });

    it('leaves headers untouched when no user is stored', () => {
      const config = onRequest(makeConfig());
      expect(config.headers['x-user-email']).toBeUndefined();
    });

    it('propagates request errors', async () => {
      const error = new Error('request failed');
      await expect(onRequestError(error)).rejects.toBe(error);
    });
  });

  describe('response interceptor', () => {
    it('passes successful responses through', () => {
      const response = { data: { ok: true }, status: 200 } as AxiosResponse;
      expect(onResponse(response)).toBe(response);
    });

    it('clears the stored user and redirects to /login on 401', async () => {
      vi.stubGlobal('location', { href: 'http://localhost/dashboard' });
      localStorage.setItem('userEmail', 'jane@example.com');
      const error = { response: { status: 401 } };

      await expect(onResponseError(error)).rejects.toBe(error);
      expect(localStorage.getItem('userEmail')).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('keeps the session for non-401 errors', async () => {
      localStorage.setItem('userEmail', 'jane@example.com');
      const error = { response: { status: 500 } };

      await expect(onResponseError(error)).rejects.toBe(error);
      expect(localStorage.getItem('userEmail')).toBe('jane@example.com');
    });

    it('handles network errors without a response', async () => {
      const error = new Error('Network Error');
      await expect(onResponseError(error)).rejects.toBe(error);
    });
  });

  describe('endpoints', () => {
    const payload = { result: 'ok' };

    it.each([
      ['login', () => apiClient.login('a@b.com'), 'post', ['/api/auth/login', { email: 'a@b.com' }]],
      ['getCurrentUser', () => apiClient.getCurrentUser(), 'get', ['/api/auth/me']],
      ['getClients', () => apiClient.getClients(), 'get', ['/api/clients']],
      ['getClient', () => apiClient.getClient(3), 'get', ['/api/clients/3']],
      ['createClient', () => apiClient.createClient({ name: 'Acme' }), 'post', ['/api/clients', { name: 'Acme' }]],
      ['updateClient', () => apiClient.updateClient(3, { name: 'B' }), 'put', ['/api/clients/3', { name: 'B' }]],
      ['deleteClient', () => apiClient.deleteClient(3), 'delete', ['/api/clients/3']],
      ['deleteAllClients', () => apiClient.deleteAllClients(), 'delete', ['/api/clients']],
      ['getWorkEntries (all)', () => apiClient.getWorkEntries(), 'get', ['/api/work-entries', { params: {} }]],
      [
        'getWorkEntries (by client)',
        () => apiClient.getWorkEntries(5),
        'get',
        ['/api/work-entries', { params: { clientId: 5 } }],
      ],
      ['getWorkEntry', () => apiClient.getWorkEntry(9), 'get', ['/api/work-entries/9']],
      [
        'createWorkEntry',
        () => apiClient.createWorkEntry({ clientId: 1, hours: 2, date: '2024-01-01' }),
        'post',
        ['/api/work-entries', { clientId: 1, hours: 2, date: '2024-01-01' }],
      ],
      [
        'updateWorkEntry',
        () => apiClient.updateWorkEntry(9, { hours: 3 }),
        'put',
        ['/api/work-entries/9', { hours: 3 }],
      ],
      ['deleteWorkEntry', () => apiClient.deleteWorkEntry(9), 'delete', ['/api/work-entries/9']],
      ['getClientReport', () => apiClient.getClientReport(4), 'get', ['/api/reports/client/4']],
      [
        'exportClientReportCsv',
        () => apiClient.exportClientReportCsv(4),
        'get',
        ['/api/reports/export/csv/4', { responseType: 'blob' }],
      ],
      [
        'exportClientReportPdf',
        () => apiClient.exportClientReportPdf(4),
        'get',
        ['/api/reports/export/pdf/4', { responseType: 'blob' }],
      ],
      ['healthCheck', () => apiClient.healthCheck(), 'get', ['/health']],
    ] as const)('%s calls %s and returns response data', async (_name, call, method, args) => {
      instance[method].mockResolvedValue({ data: payload });

      await expect(call()).resolves.toEqual(payload);
      expect(instance[method]).toHaveBeenCalledWith(...args);
    });

    it('propagates endpoint errors', async () => {
      const error = new Error('boom');
      instance.get.mockRejectedValue(error);
      await expect(apiClient.getClients()).rejects.toBe(error);
    });
  });
});
