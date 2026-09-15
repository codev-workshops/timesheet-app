import React, { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import {
  DEFAULT_FEATURE_FLAGS,
  FeatureFlagsContext,
  type FeatureFlagsContextType,
} from './FeatureFlagsContextValue';

interface FeatureFlagsProviderProps {
  children: ReactNode;
}

export const FeatureFlagsProvider: React.FC<FeatureFlagsProviderProps> = ({ children }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiClient.getConfig(),
    staleTime: Infinity,
  });

  const value = useMemo<FeatureFlagsContextType>(
    () => ({
      features: { ...DEFAULT_FEATURE_FLAGS, ...(data?.features ?? {}) },
      isLoading,
    }),
    [data, isLoading]
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
};
