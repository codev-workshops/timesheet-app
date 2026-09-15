import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

type RequestFulfilled = (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
type Rejected = (error: unknown) => Promise<never>;
type ResponseFulfilled = <T>(response: T) => T;

const { http, interceptors } = vi.hoisted(() => {
  const interceptors = {
    request: { use: vi.fn<(onFulfilled: RequestFulfilled, onRejected: Rejected) => number>() },
    response: { use: vi.fn<(onFulfilled: ResponseFulfilled, onRejected: Rejected) => number>() },
  };
  return {
    interceptors,
    http: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors,
    },
  };
});

vi.mock('axios', () => ({
  default: { create: vi.fn(() => http as unknown as AxiosInstance) },
}));

import { apiClient } from '../client';

const ok = <T,>(data: T) => Promise.resolve({ data });

describe('ApiClient', () => {
  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
    http.put.mockReset();
    http.delete.mockReset();
  });

  describe('interceptors', () => {
    test('request interceptor adds the x-user-email header when stored', () => {
      const [onFulfilled, onRejected] = interceptors.request.use.mock.calls[0];
      localStorage.setItem('userEmail', 'alice@example.com');

      const config = onFulfilled({ headers: {} } as InternalAxiosRequestConfig);

      expect(config.headers['x-user-email']).toBe('alice@example.com');
      expect(onRejected(new Error('req'))).rejects.toThrow('req');
    });

    test('request interceptor leaves headers alone without a stored email', () => {
      const [onFulfilled] = interceptors.request.use.mock.calls[0];

      const config = onFulfilled({ headers: {} } as InternalAxiosRequestConfig);

      expect(config.headers['x-user-email']).toBeUndefined();
    });

    test('response interceptor passes responses through and redirects on 401', async () => {
      const [onFulfilled, onRejected] = interceptors.response.use.mock.calls[0];
      const response = { data: 1 };
      expect(onFulfilled(response)).toBe(response);

      localStorage.setItem('userEmail', 'alice@example.com');
      const originalLocation = window.location;
      const location = { ...originalLocation, href: '' };
      Object.defineProperty(window, 'location', { value: location, writable: true });

      await expect(onRejected({ response: { status: 401 } })).rejects.toBeDefined();
      expect(localStorage.getItem('userEmail')).toBeNull();
      expect(location.href).toBe('/login');

      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    test('response interceptor rejects other errors without side effects', async () => {
      const [, onRejected] = interceptors.response.use.mock.calls[0];
      localStorage.setItem('userEmail', 'alice@example.com');

      await expect(onRejected({ response: { status: 500 } })).rejects.toBeDefined();
      await expect(onRejected(new Error('network'))).rejects.toThrow('network');
      expect(localStorage.getItem('userEmail')).toBe('alice@example.com');
    });
  });

  describe('auth', () => {
    test('login and getCurrentUser', async () => {
      http.post.mockReturnValue(ok({ user: 1 }));
      http.get.mockReturnValue(ok({ user: 2 }));

      await expect(apiClient.login('a@b.c')).resolves.toEqual({ user: 1 });
      expect(http.post).toHaveBeenCalledWith('/api/auth/login', { email: 'a@b.c' });
      await expect(apiClient.getCurrentUser()).resolves.toEqual({ user: 2 });
      expect(http.get).toHaveBeenCalledWith('/api/auth/me');
    });
  });

  describe('clients', () => {
    test('CRUD endpoints', async () => {
      http.get.mockReturnValue(ok('get'));
      http.post.mockReturnValue(ok('post'));
      http.put.mockReturnValue(ok('put'));
      http.delete.mockReturnValue(ok('delete'));

      await expect(apiClient.getClients()).resolves.toBe('get');
      expect(http.get).toHaveBeenCalledWith('/api/clients');
      await expect(apiClient.getClient(3)).resolves.toBe('get');
      expect(http.get).toHaveBeenCalledWith('/api/clients/3');
      await expect(apiClient.createClient({ name: 'Acme' })).resolves.toBe('post');
      expect(http.post).toHaveBeenCalledWith('/api/clients', { name: 'Acme' });
      await expect(apiClient.updateClient(3, { name: 'B' })).resolves.toBe('put');
      expect(http.put).toHaveBeenCalledWith('/api/clients/3', { name: 'B' });
      await expect(apiClient.deleteClient(3)).resolves.toBe('delete');
      expect(http.delete).toHaveBeenCalledWith('/api/clients/3');
      await expect(apiClient.deleteAllClients()).resolves.toBe('delete');
      expect(http.delete).toHaveBeenCalledWith('/api/clients');
    });
  });

  describe('work entries', () => {
    test('CRUD endpoints', async () => {
      http.get.mockReturnValue(ok('get'));
      http.post.mockReturnValue(ok('post'));
      http.put.mockReturnValue(ok('put'));
      http.delete.mockReturnValue(ok('delete'));

      await apiClient.getWorkEntries();
      expect(http.get).toHaveBeenCalledWith('/api/work-entries', { params: {} });
      await apiClient.getWorkEntries(7);
      expect(http.get).toHaveBeenCalledWith('/api/work-entries', { params: { clientId: 7 } });
      await expect(apiClient.getWorkEntry(5)).resolves.toBe('get');
      expect(http.get).toHaveBeenCalledWith('/api/work-entries/5');
      const entry = { clientId: 7, hours: 2, date: '2024-01-01' };
      await expect(apiClient.createWorkEntry(entry)).resolves.toBe('post');
      expect(http.post).toHaveBeenCalledWith('/api/work-entries', entry);
      await expect(apiClient.updateWorkEntry(5, { hours: 3 })).resolves.toBe('put');
      expect(http.put).toHaveBeenCalledWith('/api/work-entries/5', { hours: 3 });
      await expect(apiClient.deleteWorkEntry(5)).resolves.toBe('delete');
      expect(http.delete).toHaveBeenCalledWith('/api/work-entries/5');
    });
  });

  describe('reports and health', () => {
    test('report endpoints request blobs for exports', async () => {
      http.get.mockReturnValue(ok('report'));

      await expect(apiClient.getClientReport(9)).resolves.toBe('report');
      expect(http.get).toHaveBeenCalledWith('/api/reports/client/9');
      await apiClient.exportClientReportCsv(9);
      expect(http.get).toHaveBeenCalledWith('/api/reports/export/csv/9', { responseType: 'blob' });
      await apiClient.exportClientReportPdf(9);
      expect(http.get).toHaveBeenCalledWith('/api/reports/export/pdf/9', { responseType: 'blob' });
      await expect(apiClient.healthCheck()).resolves.toBe('report');
      expect(http.get).toHaveBeenCalledWith('/health');
    });
  });
});
