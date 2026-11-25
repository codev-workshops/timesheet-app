import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { Client, CreateProjectRequest, Project, UpdateProjectRequest } from '../types/api';

interface MutationCallbacks {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

export const useProjects = () =>
  useQuery<{ projects: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => apiClient.getProjects(),
  });

export const useClients = () =>
  useQuery<{ clients: Client[] }>({
    queryKey: ['clients'],
    queryFn: () => apiClient.getClients(),
  });

export const useCreateProject = ({ onSuccess, onError }: MutationCallbacks = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectData: CreateProjectRequest) => apiClient.createProject(projectData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onSuccess?.();
    },
    onError,
  });
};

export const useUpdateProject = ({ onSuccess, onError }: MutationCallbacks = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProjectRequest }) =>
      apiClient.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onSuccess?.();
    },
    onError,
  });
};

export const useDeleteProject = ({ onSuccess, onError }: MutationCallbacks = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onSuccess?.();
    },
    onError,
  });
};
