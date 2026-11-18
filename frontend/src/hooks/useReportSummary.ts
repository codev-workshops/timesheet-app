import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { ReportSummaryParams } from '../types/api';

export const useReportSummary = (params: ReportSummaryParams) => useQuery({
  queryKey: ['reportSummary', params],
  queryFn: () => apiClient.getReportSummary(params),
  enabled: Boolean(params.startDate && params.endDate && params.startDate <= params.endDate),
});
