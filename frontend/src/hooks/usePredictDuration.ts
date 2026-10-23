import { useMutation } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { PredictDurationRequest, PredictDurationResponse } from '../types/api';

export const usePredictDuration = () =>
  useMutation<PredictDurationResponse, Error, PredictDurationRequest>({
    mutationFn: (input) => apiClient.predictDuration(input),
  });
