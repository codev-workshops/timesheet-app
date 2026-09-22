import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

type ReqFulfilled = (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
type ResRejected = (error: AxiosError) => Promise<never>;

const requestUse = vi.fn<(onFulfilled: ReqFulfilled, onRejected: (e: unknown) => Promise<never>) => number>();
const responseUse = vi.fn<(onFulfilled: (r: AxiosResponse) => AxiosResponse, onRejected: ResRejected) => number>();
const http = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: { request: { use: requestUse }, response: { use: responseUse } },
};

vi.mock('axios', () => ({
  default: { create: vi.fn(() => http as unknown as AxiosInstance) },
}));

const loadClient = async () => {
  vi.resetModules();
  const mod = await import('../api/client');
  return mod.apiClient;
};

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.get.mockResolvedValue({ data: { ok: true } });
    http.post.mockResolvedValue({ data: { ok: true } });
    http.put.mockResolvedValue({ data: { ok: true } });
    http.delete.mockResolvedValue({ data: { ok: true } });
  });

  afterEach(() => localStorage.clear());

  test('request interceptor adds x-user-email only when stored', async () => {
    await loadClient();
    const [onFulfilled] = requestUse.mock.calls[0];
    const headers = () => ({ headers: {} as Record<string, string> }) as unknown as InternalAxiosRequestConfig;

    expect(onFulfilled(headers()).headers['x-user-email']).toBeUndefined();

    localStorage.setItem('userEmail', 'me@example.com');
    expect(onFulfilled(headers()).headers['x-user-email']).toBe('me@example.com');
  });

  test('response interceptor clears session and redirects on 401 only', async () => {
    await loadClient();
    const [, onRejected] = responseUse.mock.calls[0];
    const original = window.location;
    const location = { href: '/dashboard' } as Location;
    Object.defineProperty(window, 'location', { value: location, writable: true });
    localStorage.setItem('userEmail', 'me@example.com');

    await expect(onRejected({ response: { status: 500 } } as AxiosError)).rejects.toBeDefined();
    expect(localStorage.getItem('userEmail')).toBe('me@example.com');
    expect(location.href).toBe('/dashboard');

    await expect(onRejected({ response: { status: 401 } } as AxiosError)).rejects.toBeDefined();
    expect(localStorage.getItem('userEmail')).toBeNull();
    expect(location.href).toBe('/login');

    Object.defineProperty(window, 'location', { value: original, writable: true });
  });

  test('maps each method to the correct endpoint, verb and payload', async () => {
    const api = await loadClient();

    await api.login('a@b.com');
    expect(http.post).toHaveBeenCalledWith('/api/auth/login', { email: 'a@b.com' });

    await api.getCurrentUser();
    expect(http.get).toHaveBeenCalledWith('/api/auth/me');

    await api.getClients();
    expect(http.get).toHaveBeenCalledWith('/api/clients');
    await api.getClient(3);
    expect(http.get).toHaveBeenCalledWith('/api/clients/3');
    await api.createClient({ name: 'Acme', department: 'Fin', email: 'ap@acme.com' });
    expect(http.post).toHaveBeenCalledWith('/api/clients', { name: 'Acme', department: 'Fin', email: 'ap@acme.com' });
    await api.updateClient(3, { name: 'New' });
    expect(http.put).toHaveBeenCalledWith('/api/clients/3', { name: 'New' });
    await api.deleteClient(3);
    expect(http.delete).toHaveBeenCalledWith('/api/clients/3');
    await api.deleteAllClients();
    expect(http.delete).toHaveBeenCalledWith('/api/clients');

    await api.getWorkEntries();
    expect(http.get).toHaveBeenCalledWith('/api/work-entries', { params: {} });
    await api.getWorkEntries(7);
    expect(http.get).toHaveBeenCalledWith('/api/work-entries', { params: { clientId: 7 } });
    await api.getWorkEntry(9);
    expect(http.get).toHaveBeenCalledWith('/api/work-entries/9');
    await api.createWorkEntry({ clientId: 1, hours: 2, date: '2024-01-01' });
    expect(http.post).toHaveBeenCalledWith('/api/work-entries', { clientId: 1, hours: 2, date: '2024-01-01' });
    await api.updateWorkEntry(9, { hours: 3 });
    expect(http.put).toHaveBeenCalledWith('/api/work-entries/9', { hours: 3 });
    await api.deleteWorkEntry(9);
    expect(http.delete).toHaveBeenCalledWith('/api/work-entries/9');

    await api.getClientReport(4);
    expect(http.get).toHaveBeenCalledWith('/api/reports/client/4');
    await api.exportClientReportCsv(4);
    expect(http.get).toHaveBeenCalledWith('/api/reports/export/csv/4', { responseType: 'blob' });
    await api.exportClientReportPdf(4);
    expect(http.get).toHaveBeenCalledWith('/api/reports/export/pdf/4', { responseType: 'blob' });

    await api.healthCheck();
    expect(http.get).toHaveBeenCalledWith('/health');
  });

  test('returns response.data, not the axios envelope', async () => {
    const api = await loadClient();
    http.get.mockResolvedValueOnce({ data: { clients: [{ id: 1 }] }, status: 200 });
    await expect(api.getClients()).resolves.toEqual({ clients: [{ id: 1 }] });
  });
});
