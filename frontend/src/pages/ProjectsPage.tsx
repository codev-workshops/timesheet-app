import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import {
  type Client,
  type Project,
  type ProjectStatus,
  type CreateProjectRequest,
  type UpdateProjectRequest,
} from '../types/api';

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'on-hold', label: 'On Hold' },
];

const STATUS_COLORS: Record<ProjectStatus, 'success' | 'default' | 'warning'> = {
  active: 'success',
  completed: 'default',
  'on-hold': 'warning',
};

const statusLabel = (status: ProjectStatus) =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;

interface ProjectFormData {
  name: string;
  description: string;
  clientId: string;
  startDate: string;
  status: ProjectStatus;
}

const emptyForm: ProjectFormData = {
  name: '',
  description: '',
  clientId: '',
  startDate: '',
  status: 'active',
};

const ProjectsPage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<ProjectFormData>(emptyForm);
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const {
    data: projectsData,
    isLoading,
    isError: isProjectsError,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.getProjects(),
  });

  const { data: clientsData, isError: isClientsError } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.getClients(),
  });

  const createMutation = useMutation({
    mutationFn: (projectData: CreateProjectRequest) => apiClient.createProject(projectData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleClose();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to create project');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProjectRequest }) =>
      apiClient.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleClose();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to update project');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to delete project');
    },
  });

  const projects: Project[] = projectsData?.projects || [];
  const clients: Client[] = clientsData?.clients || [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleOpen = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setFormData({
        name: project.name,
        description: project.description || '',
        clientId: String(project.client_id),
        startDate: project.start_date || '',
        status: project.status,
      });
    } else {
      setEditingProject(null);
      setFormData(emptyForm);
    }
    setError('');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingProject(null);
    setFormData(emptyForm);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Project name is required');
      return;
    }

    if (!formData.clientId) {
      setError('Client is required');
      return;
    }

    const payload = {
      name: formData.name,
      description: formData.description,
      clientId: parseInt(formData.clientId),
      startDate: formData.startDate,
      status: formData.status,
    };

    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (project: Project) => {
    if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
      deleteMutation.mutate(project.id);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Projects</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpen()}
          disabled={isClientsError}
        >
          Add Project
        </Button>
      </Box>

      {isProjectsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load projects. Please try again later.
        </Alert>
      )}

      {isClientsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load clients. Projects cannot be created until clients are available.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.length > 0 ? (
                projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Typography variant="subtitle1" fontWeight="medium">
                        {project.name}
                      </Typography>
                      {project.description && (
                        <Typography variant="body2" color="text.secondary">
                          {project.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{project.client_name}</Typography>
                    </TableCell>
                    <TableCell>
                      {project.start_date ? (
                        <Typography variant="body2" color="text.secondary">
                          {project.start_date}
                        </Typography>
                      ) : (
                        <Chip label="-" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={statusLabel(project.status)}
                        size="small"
                        color={STATUS_COLORS[project.status]}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(project.created_at).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        onClick={() => handleOpen(project)}
                        color="primary"
                        size="small"
                        disabled={deleteMutation.isPending}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDelete(project)}
                        color="error"
                        size="small"
                        disabled={deleteMutation.isPending}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      {isProjectsError
                        ? 'Projects could not be loaded.'
                        : 'No projects found. Create your first project to get started.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingProject ? 'Edit Project' : 'Add New Project'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Project Name"
              fullWidth
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isSaving}
            />
            <FormControl fullWidth margin="dense" required disabled={isSaving}>
              <InputLabel id="project-client-label">Client</InputLabel>
              <Select
                labelId="project-client-label"
                label="Client"
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              >
                {clients.map((client) => (
                  <MenuItem key={client.id} value={String(client.id)}>
                    {client.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              margin="dense"
              label="Start Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              disabled={isSaving}
            />
            <FormControl fullWidth margin="dense" disabled={isSaving}>
              <InputLabel id="project-status-label">Status</InputLabel>
              <Select
                labelId="project-status-label"
                label="Status"
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as ProjectStatus })
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              margin="dense"
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={isSaving}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isSaving}>
              {isSaving ? <CircularProgress size={24} /> : editingProject ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default ProjectsPage;
