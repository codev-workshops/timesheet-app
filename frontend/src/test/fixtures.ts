import type { Client, ClientReport, WorkEntryWithClient } from '../types/api';

export const clients: Client[] = [
  {
    id: 1,
    name: 'Acme Corp',
    description: 'Main client',
    department: 'Sales',
    email: 'acme@example.com',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Globex',
    description: null,
    department: null,
    email: null,
    created_at: '2024-01-02T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
  },
];

export const workEntries: WorkEntryWithClient[] = [
  {
    id: 10,
    client_id: 1,
    client_name: 'Acme Corp',
    hours: 2.5,
    description: 'Design review',
    date: '2024-01-15',
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 11,
    client_id: 2,
    client_name: 'Globex',
    hours: 5,
    description: null,
    date: '2024-01-16',
    created_at: '2024-01-16T10:00:00.000Z',
    updated_at: '2024-01-16T10:00:00.000Z',
  },
];

export const clientReport: ClientReport = {
  client: clients[0],
  workEntries: [
    { ...workEntries[0] },
    { ...workEntries[0], id: 12, hours: 5, description: null },
  ],
  totalHours: 7.5,
  entryCount: 2,
};
