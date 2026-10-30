import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

type RequestFulfilled = (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
type ResponseFulfilled = (response: AxiosResponse) => AxiosResponse;
type Rejected = (error: unknown) => Promise<never>;

const stub = vi.hoisted(() => {
  const handlers: {
    requestFulfilled?: RequestFulfilled;
    requestRejected?: Rejected;
    responseFulfilled?: ResponseFulfilled;
    responseRejected?: Rejected;
  } = {};
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn((fulfilled: RequestFulfilled, rejected: Rejected) => {
          handlers.requestFulfilled = fulfilled;
          handlers.requestRejected = rejected;
        }),
      },
      response: {
        use: vi.fn((fulfilled: ResponseFulfilled, rejected: Rejected) => {
          handlers.responseFulfilled = fulfilled;
          handlers.responseRejected = rejected;
        }),
      },
    },
  };
  const create = vi.fn(() => instance);
  return { handlers, instance, create };
});

vi.mock('axios', () => ({
  default: { create: stub.create },
}));

import apiClient, { apiClient as namedClient } from './client';

const { handlers, instance } = stub;

const makeConfig = (): InternalAxiosRequestConfig =>
  ({ headers: {} }) as unknown as InternalAxiosRequestConfig;

describe('ApiClient construction', () => {
  it('creates an axios instance with base config and registers interceptors', () => {
    expect(stub.create).toHaveBeenCalledWith({
      baseURL: '',
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(instance.interceptors.request.use).toHaveBeenCalledTimes(1);
    expect(instance.interceptors.response.use).toHaveBeenCalledTimes(1);
    expect(namedClient).toBe(apiClient);
  });
});

describe('request interceptor', () => {
  it('adds x-user-email header when userEmail is stored', () => {
    localStorage.setItem('userEmail', 'user@example.com');
    const config = handlers.requestFulfilled!(makeConfig());
    expect(config.headers['x-user-email']).toBe('user@example.com');
  });

  it('omits x-user-email header when no userEmail is stored', () => {
    const config = handlers.requestFulfilled!(makeConfig());
    expect(config.headers['x-user-email']).toBeUndefined();
  });

  it('rejects request errors', async () => {
    const error = new Error('request failed');
    await expect(handlers.requestRejected!(error)).rejects.toBe(error);
  });
});

describe('response interceptor', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '/dashboard' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('passes successful responses through', () => {
    const response = { data: { ok: true }, status: 200 } as AxiosResponse;
    expect(handlers.responseFulfilled!(response)).toBe(response);
  });

  it('clears stored email and redirects to /login on 401', async () => {
    localStorage.setItem('userEmail', 'user@example.com');
    const error = { response: { status: 401 } };
    await expect(handlers.responseRejected!(error)).rejects.toBe(error);
    expect(localStorage.getItem('userEmail')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('passes through non-401 errors without clearing storage', async () => {
    localStorage.setItem('userEmail', 'user@example.com');
    const error = { response: { status: 500 } };
    await expect(handlers.responseRejected!(error)).rejects.toBe(error);
    expect(localStorage.getItem('userEmail')).toBe('user@example.com');
    expect(window.location.href).toBe('/dashboard');
  });

  it('passes through errors without a response', async () => {
    const error = new Error('Network Error');
    await expect(handlers.responseRejected!(error)).rejects.toBe(error);
    expect(window.location.href).toBe('/dashboard');
  });
});

describe('endpoint methods', () => {
  const data = { result: 'ok' };

  beforeEach(() => {
    instance.get.mockReset().mockResolvedValue({ data });
    instance.post.mockReset().mockResolvedValue({ data });
    instance.put.mockReset().mockResolvedValue({ data });
    instance.delete.mockReset().mockResolvedValue({ data });
  });

  it('login posts the email', async () => {
    await expect(apiClient.login('a@b.com')).resolves.toBe(data);
    expect(instance.post).toHaveBeenCalledWith('/api/auth/login', { email: 'a@b.com' });
  });

  it('getCurrentUser gets /api/auth/me', async () => {
    await expect(apiClient.getCurrentUser()).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/auth/me');
  });

  it('getClients gets /api/clients', async () => {
    await expect(apiClient.getClients()).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/clients');
  });

  it('getClient gets a client by id', async () => {
    await expect(apiClient.getClient(3)).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/clients/3');
  });

  it('createClient posts client data', async () => {
    const body = { name: 'Acme', description: 'd', department: 'Eng', email: 'c@acme.com' };
    await expect(apiClient.createClient(body)).resolves.toBe(data);
    expect(instance.post).toHaveBeenCalledWith('/api/clients', body);
  });

  it('updateClient puts client data', async () => {
    const body = { name: 'Acme 2' };
    await expect(apiClient.updateClient(4, body)).resolves.toBe(data);
    expect(instance.put).toHaveBeenCalledWith('/api/clients/4', body);
  });

  it('deleteClient deletes a client by id', async () => {
    await expect(apiClient.deleteClient(5)).resolves.toBe(data);
    expect(instance.delete).toHaveBeenCalledWith('/api/clients/5');
  });

  it('deleteAllClients deletes /api/clients', async () => {
    await expect(apiClient.deleteAllClients()).resolves.toBe(data);
    expect(instance.delete).toHaveBeenCalledWith('/api/clients');
  });

  it('getWorkEntries passes clientId param when provided', async () => {
    await expect(apiClient.getWorkEntries(7)).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/work-entries', { params: { clientId: 7 } });
  });

  it('getWorkEntries sends empty params when clientId is omitted', async () => {
    await expect(apiClient.getWorkEntries()).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/work-entries', { params: {} });
  });

  it('getWorkEntry gets an entry by id', async () => {
    await expect(apiClient.getWorkEntry(8)).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/work-entries/8');
  });

  it('createWorkEntry posts entry data', async () => {
    const body = { clientId: 1, hours: 2.5, description: 'work', date: '2024-01-01' };
    await expect(apiClient.createWorkEntry(body)).resolves.toBe(data);
    expect(instance.post).toHaveBeenCalledWith('/api/work-entries', body);
  });

  it('updateWorkEntry puts entry data', async () => {
    const body = { hours: 3 };
    await expect(apiClient.updateWorkEntry(9, body)).resolves.toBe(data);
    expect(instance.put).toHaveBeenCalledWith('/api/work-entries/9', body);
  });

  it('deleteWorkEntry deletes an entry by id', async () => {
    await expect(apiClient.deleteWorkEntry(10)).resolves.toBe(data);
    expect(instance.delete).toHaveBeenCalledWith('/api/work-entries/10');
  });

  it('getClientReport gets the client report', async () => {
    await expect(apiClient.getClientReport(11)).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/reports/client/11');
  });

  it('exportClientReportCsv requests a blob', async () => {
    await expect(apiClient.exportClientReportCsv(12)).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/reports/export/csv/12', { responseType: 'blob' });
  });

  it('exportClientReportPdf requests a blob', async () => {
    await expect(apiClient.exportClientReportPdf(13)).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/api/reports/export/pdf/13', { responseType: 'blob' });
  });

  it('healthCheck gets /health', async () => {
    await expect(apiClient.healthCheck()).resolves.toBe(data);
    expect(instance.get).toHaveBeenCalledWith('/health');
  });
});
