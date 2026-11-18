import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { ReportSummaryParams } from '../types/api';
import { useAuth } from './useAuth';

export const useReportSummary = (params: ReportSummaryParams) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['reportSummary', user?.email, params],
    queryFn: () => apiClient.getReportSummary(params),
    enabled: Boolean(user?.email && params.startDate && params.endDate && params.startDate <= params.endDate),
  });
};
