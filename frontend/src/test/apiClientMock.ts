import { vi } from 'vitest';

export const createApiClientMock = () => ({
  default: {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
    getClients: vi.fn(),
    getClient: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
    deleteAllClients: vi.fn(),
    getWorkEntries: vi.fn(),
    getWorkEntry: vi.fn(),
    createWorkEntry: vi.fn(),
    updateWorkEntry: vi.fn(),
    deleteWorkEntry: vi.fn(),
    getClientReport: vi.fn(),
    exportClientReportCsv: vi.fn(),
    exportClientReportPdf: vi.fn(),
    healthCheck: vi.fn(),
  },
});
