import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';

// Use empty string to make requests relative to the current origin
// Vite proxy will forward /api requests to the backend
const API_BASE_URL = '';
const TOKEN_STORAGE_KEY = 'authToken';
const EMAIL_STORAGE_KEY = 'userEmail';

// Attaches a user-facing message to normalized errors so callers can display it
export interface NormalizedApiError extends AxiosError {
  userMessage?: string;
}

function normalizeError(error: AxiosError): NormalizedApiError {
  const normalized = error as NormalizedApiError;
  if (error.response) {
    // Server responded with an error status; prefer its message
    const data = error.response.data as { error?: string } | undefined;
    normalized.userMessage = data?.error || `Request failed (${error.response.status})`;
  } else if (error.code === 'ECONNABORTED') {
    normalized.userMessage = 'Request timed out. Please try again.';
  } else {
    normalized.userMessage = 'Unable to reach the server. Check your connection and try again.';
  }
  return normalized;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add the JWT bearer token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Clear stored credentials on auth error; only redirect when not
          // already on the login page to avoid a reload loop
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(EMAIL_STORAGE_KEY);
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(normalizeError(error));
      }
    );
  }

  // Auth endpoints
  async login(email: string) {
    const response = await this.client.post('/api/auth/login', { email });
    const { token } = response.data;
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(EMAIL_STORAGE_KEY, email);
    }
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  // Client endpoints
  async getClients() {
    const response = await this.client.get('/api/clients');
    return response.data;
  }

  async getClient(id: number) {
    const response = await this.client.get(`/api/clients/${id}`);
    return response.data;
  }

  async createClient(clientData: { name: string; description?: string; department?: string; email?: string }) {
    const response = await this.client.post('/api/clients', clientData);
    return response.data;
  }

  async updateClient(id: number, clientData: { name?: string; description?: string; department?: string; email?: string }) {
    const response = await this.client.put(`/api/clients/${id}`, clientData);
    return response.data;
  }

  async deleteClient(id: number) {
    const response = await this.client.delete(`/api/clients/${id}`);
    return response.data;
  }

  async deleteAllClients() {
    const response = await this.client.delete('/api/clients');
    return response.data;
  }

  // Work entry endpoints
  async getWorkEntries(clientId?: number) {
    const params = clientId ? { clientId } : {};
    const response = await this.client.get('/api/work-entries', { params });
    return response.data;
  }

  async getWorkEntry(id: number) {
    const response = await this.client.get(`/api/work-entries/${id}`);
    return response.data;
  }

  async createWorkEntry(entryData: { clientId: number; hours: number; description?: string; date: string }) {
    const response = await this.client.post('/api/work-entries', entryData);
    return response.data;
  }

  async updateWorkEntry(id: number, entryData: { clientId?: number; hours?: number; description?: string; date?: string }) {
    const response = await this.client.put(`/api/work-entries/${id}`, entryData);
    return response.data;
  }

  async deleteWorkEntry(id: number) {
    const response = await this.client.delete(`/api/work-entries/${id}`);
    return response.data;
  }

  // Report endpoints
  async getClientReport(clientId: number) {
    const response = await this.client.get(`/api/reports/client/${clientId}`);
    return response.data;
  }

  async exportClientReportCsv(clientId: number) {
    const response = await this.client.get(`/api/reports/export/csv/${clientId}`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async exportClientReportPdf(clientId: number) {
    const response = await this.client.get(`/api/reports/export/pdf/${clientId}`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Health check
  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
export { TOKEN_STORAGE_KEY, EMAIL_STORAGE_KEY };
