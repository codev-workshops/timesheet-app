export interface User {
  email: string;
  createdAt: string;
}

export interface Client {
  id: number;
  name: string;
  description: string | null;
  department: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkEntry {
  id: number;
  client_id: number;
  hours: number;
  description: string | null;
  date: string;
  project: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
}

export interface WorkEntryWithClient extends WorkEntry {
  client_name: string;
}

export type ClientReportEntry = Pick<
  WorkEntry,
  'id' | 'hours' | 'description' | 'date' | 'project' | 'created_at' | 'updated_at'
>;

export interface ClientReport {
  client: Pick<Client, 'id' | 'name'>;
  workEntries: ClientReportEntry[];
  totalHours: number;
  entryCount: number;
}

export interface CreateClientRequest {
  name: string;
  description?: string;
  department?: string;
  email?: string;
}

export interface UpdateClientRequest {
  name?: string;
  description?: string;
  department?: string;
  email?: string;
}

export interface CreateWorkEntryRequest {
  clientId: number;
  hours: number;
  description?: string;
  date: string;
  project?: string;
}

export interface UpdateWorkEntryRequest {
  clientId?: number;
  hours?: number;
  description?: string;
  date?: string;
  project?: string;
}

export interface WorkEntriesQuery {
  clientId?: number;
  project?: string;
}

export interface ClientReportQuery {
  project?: string;
}

export interface LoginRequest {
  email: string;
}

export interface LoginResponse {
  message: string;
  user: User;
}

export interface ApiError {
  error: string;
  details?: string[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
