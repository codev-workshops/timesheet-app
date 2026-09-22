import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextType } from '../contexts/AuthContextValue';
import { vi } from 'vitest';

export const makeAuth = (overrides: Partial<AuthContextType> = {}): AuthContextType => ({
  user: { email: 'test@example.com', createdAt: '2024-01-01T00:00:00Z' },
  login: vi.fn(async () => {}),
  logout: vi.fn(),
  isLoading: false,
  isAuthenticated: true,
  ...overrides,
});

interface Options {
  route?: string;
  auth?: AuthContextType;
  queryClient?: QueryClient;
}

export const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

export function renderWithProviders(ui: ReactElement, { route = '/', auth = makeAuth(), queryClient = makeQueryClient() }: Options = {}) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper }), queryClient, auth };
}
