import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext, type AuthContextType } from '../contexts/AuthContextValue';
import LocationProbe from './LocationProbe';

export const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

export const createAuthValue = (overrides: Partial<AuthContextType> = {}): AuthContextType => ({
  user: { email: 'jane@example.com', createdAt: '2024-01-01T00:00:00.000Z' },
  login: vi.fn<(email: string) => Promise<void>>().mockResolvedValue(undefined),
  logout: vi.fn<() => void>(),
  isLoading: false,
  isAuthenticated: true,
  ...overrides,
});

interface RenderOptions {
  route?: string;
  auth?: AuthContextType;
  queryClient?: QueryClient;
}

export const renderWithProviders = (
  ui: ReactElement,
  { route = '/', auth = createAuthValue(), queryClient = createTestQueryClient() }: RenderOptions = {},
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>
          {children}
          <LocationProbe />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper }), auth, queryClient };
};
