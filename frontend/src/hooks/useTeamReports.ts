import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { TeamDateRange, TeamGroupBy } from '../types/api';
import { useAuth } from './useAuth';

export const useTeamEmployees = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['teamEmployees', user?.email],
    queryFn: () => apiClient.getTeamEmployees(),
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};

export const useIsManager = (): boolean => {
  const { data } = useTeamEmployees();
  return (data?.employees.length ?? 0) > 0;
};

export const useTeamSummary = (range: TeamDateRange, groupBy: TeamGroupBy, enabled: boolean) =>
  useQuery({
    queryKey: ['teamSummary', range, groupBy],
    queryFn: () => apiClient.getTeamSummary(range, groupBy),
    enabled,
  });

export const useTeamByProject = (range: TeamDateRange, enabled: boolean) =>
  useQuery({
    queryKey: ['teamByProject', range],
    queryFn: () => apiClient.getTeamByProject(range),
    enabled,
  });

export const useTeamEmployeeReport = (email: string | null, range: TeamDateRange, enabled: boolean) =>
  useQuery({
    queryKey: ['teamEmployeeReport', email, range],
    queryFn: () => apiClient.getTeamEmployeeReport(email as string, range),
    enabled: enabled && !!email,
  });
