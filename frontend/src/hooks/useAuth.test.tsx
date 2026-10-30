import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { useAuth } from './useAuth';
import { AuthContext, type AuthContextType } from '../contexts/AuthContextValue';

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });

  it('returns the context value when inside a provider', () => {
    const value: AuthContextType = {
      user: { email: 'a@b.com', createdAt: '2024-01-01' },
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      isAuthenticated: true,
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current).toBe(value);
  });
});
