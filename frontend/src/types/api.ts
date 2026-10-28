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
  created_at: string;
  updated_at: string;
  client_name?: string;
}

export interface WorkEntryWithClient extends WorkEntry {
  client_name: string;
}

export interface ClientReport {
  client: Client;
  workEntries: WorkEntry[];
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
}

export interface UpdateWorkEntryRequest {
  clientId?: number;
  hours?: number;
  description?: string;
  date?: string;
}

export interface LoginRequest {
  email: string;
}

export interface LoginResponse {
  message: string;
  user: User;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export type TeamGroupBy = 'week' | 'month';

export interface TeamDateRange {
  start_date: string;
  end_date: string;
}

export interface TeamEmployeesResponse {
  employees: { email: string }[];
}

export interface TeamSummaryRow {
  employee_email: string;
  period: string;
  total_hours: number;
}

export interface TeamSummaryResponse {
  startDate: string;
  endDate: string;
  groupBy: TeamGroupBy;
  summary: TeamSummaryRow[];
}

export interface TeamByProjectRow {
  client_name: string;
  employee_email: string;
  total_hours: number;
}

export interface TeamByProjectResponse {
  startDate: string;
  endDate: string;
  byProject: TeamByProjectRow[];
  projectTotals: { client_name: string; total_hours: number }[];
}

export interface TeamEmployeeEntry {
  id: number;
  date: string;
  hours: number;
  description: string | null;
  client_name: string;
  created_at: string;
  updated_at: string;
}

export interface TeamEmployeeReport {
  employee_email: string;
  startDate: string;
  endDate: string;
  workEntries: TeamEmployeeEntry[];
  totalHours: number;
  entryCount: number;
}
