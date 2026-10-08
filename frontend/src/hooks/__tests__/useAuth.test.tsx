import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { AuthContext } from '../../contexts/AuthContextValue';
import { createAuthValue } from '../../test/utils';

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider');
  });

  it('returns the value provided by AuthContext', () => {
    const value = createAuthValue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBe(value);
  });
});
