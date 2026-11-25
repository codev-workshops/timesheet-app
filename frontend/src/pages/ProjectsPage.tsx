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

interface ProjectFormData {
  name: string;
  description: string;
  clientId: number | '';
  startDate: string;
  status: ProjectStatus;
}

const emptyFormData: ProjectFormData = {
  name: '',
  description: '',
  clientId: '',
  startDate: '',
  status: 'active',
};

const statusOptions: { value: ProjectStatus; label: string; color: 'success' | 'default' | 'warning' }[] = [
  { value: 'active', label: 'Active', color: 'success' },
  { value: 'completed', label: 'Completed', color: 'default' },
  { value: 'on-hold', label: 'On Hold', color: 'warning' },
];

const ProjectsPage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<ProjectFormData>(emptyFormData);
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.getProjects(),
  });

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
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
        clientId: project.client_id,
        startDate: project.start_date || '',
        status: project.status,
      });
    } else {
      setEditingProject(null);
      setFormData(emptyFormData);
    }
    setError('');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingProject(null);
    setFormData(emptyFormData);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Project name is required');
      return;
    }

    if (formData.clientId === '') {
      setError('Please select a client');
      return;
    }

    if (editingProject) {
      updateMutation.mutate({
        id: editingProject.id,
        data: {
          name: formData.name,
          description: formData.description,
          clientId: formData.clientId,
          startDate: formData.startDate || null,
          status: formData.status,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        description: formData.description || undefined,
        clientId: formData.clientId,
        startDate: formData.startDate || undefined,
        status: formData.status,
      });
    }
  };

  const handleDelete = (project: Project) => {
    if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
      deleteMutation.mutate(project.id);
    }
  };

  const getClientName = (project: Project) =>
    project.client_name || clients.find((client) => client.id === project.client_id)?.name || '-';

  if (projectsLoading || clientsLoading) {
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
          disabled={clients.length === 0}
        >
          Add Project
        </Button>
      </Box>

      {clients.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You need to create at least one client before adding projects.
        </Alert>
      )}

      {error && !open && (
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
                <TableCell>Status</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.length > 0 ? (
                projects.map((project) => {
                  const status = statusOptions.find((option) => option.value === project.status);
                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <Typography variant="subtitle1" fontWeight="medium">
                          {project.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {getClientName(project)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={status?.label || project.status}
                          color={status?.color || 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {project.start_date ? (
                          <Typography variant="body2" color="text.secondary">
                            {new Date(`${project.start_date}T00:00:00`).toLocaleDateString()}
                          </Typography>
                        ) : (
                          <Chip label="-" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        {project.description ? (
                          <Typography variant="body2" color="text.secondary">
                            {project.description}
                          </Typography>
                        ) : (
                          <Chip label="No description" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          onClick={() => handleOpen(project)}
                          color="primary"
                          size="small"
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
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      No projects found. Create your first project to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingProject ? 'Edit Project' : 'Add New Project'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
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
            <FormControl fullWidth margin="dense" required>
              <InputLabel id="project-client-label">Client</InputLabel>
              <Select
                labelId="project-client-label"
                label="Client"
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: Number(e.target.value) })}
                disabled={isSaving}
              >
                {clients.map((client) => (
                  <MenuItem key={client.id} value={client.id}>
                    {client.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth margin="dense">
              <InputLabel id="project-status-label">Status</InputLabel>
              <Select
                labelId="project-status-label"
                label="Status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
                disabled={isSaving}
              >
                {statusOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              margin="dense"
              label="Start Date"
              type="date"
              fullWidth
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              disabled={isSaving}
              slotProps={{ inputLabel: { shrink: true } }}
            />
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
              {isSaving ? (
                <CircularProgress size={24} />
              ) : (
                editingProject ? 'Update' : 'Create'
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default ProjectsPage;
