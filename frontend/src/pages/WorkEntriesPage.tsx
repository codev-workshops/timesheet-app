import React, { useEffect, useState } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  AutoAwesome as SuggestedIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import apiClient from '../api/client';
import { type WorkEntry, type WorkEntryEstimate } from '../types/api';

const ESTIMATE_DEBOUNCE_MS = 400;

const roundToQuarterHour = (hours: number) => Math.max(0.25, Math.round(hours * 4) / 4);

const toIsoDate = (date: Date | null) =>
  date && !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : '';


const WorkEntriesPage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkEntry | null>(null);
  const [formData, setFormData] = useState({
    clientId: 0,
    hours: '',
    description: '',
    date: new Date(),
  });
  const [error, setError] = useState('');
  const [hoursTouched, setHoursTouched] = useState(false);
  const [debouncedDescription, setDebouncedDescription] = useState('');
  const [lastEstimate, setLastEstimate] = useState<WorkEntryEstimate | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDescription(formData.description), ESTIMATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [formData.description]);

  const estimateDate = toIsoDate(formData.date);
  const estimateEnabled =
    open && !editingEntry && !hoursTouched && formData.clientId > 0 && estimateDate !== '';

  const { data: estimateData } = useQuery({
    queryKey: ['workEntryEstimate', formData.clientId, debouncedDescription, estimateDate],
    queryFn: ({ signal }) =>
      apiClient.getWorkEntryEstimate(
        { clientId: formData.clientId, description: debouncedDescription, date: estimateDate },
        signal,
      ),
    enabled: estimateEnabled,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  });

  if (estimateEnabled && estimateData && estimateData !== lastEstimate) {
    setLastEstimate(estimateData);
  }

  const suggestion = !editingEntry && !hoursTouched ? lastEstimate : null;
  const suggestedHours = suggestion ? roundToQuarterHour(suggestion.estimatedHours).toString() : null;
  const hoursValue = suggestedHours ?? formData.hours;

  const { data: workEntriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['workEntries'],
    queryFn: () => apiClient.getWorkEntries(),
  });

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.getClients(),
  });

  const createMutation = useMutation({
    mutationFn: (entryData: { clientId: number; hours: number; description?: string; date: string }) =>
      apiClient.createWorkEntry(entryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] });
      handleClose();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to create work entry');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { clientId?: number; hours?: number; description?: string; date?: string } }) =>
      apiClient.updateWorkEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] });
      handleClose();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to update work entry');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteWorkEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to delete work entry');
    },
  });

  const workEntries = workEntriesData?.workEntries || [];
  const clients = clientsData?.clients || [];

  const handleOpen = (entry?: WorkEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        clientId: entry.client_id,
        hours: entry.hours.toString(),
        description: entry.description || '',
        date: new Date(entry.date),
      });
    } else {
      setEditingEntry(null);
      setFormData({
        clientId: 0,
        hours: '',
        description: '',
        date: new Date(),
      });
    }
    setError('');
    setHoursTouched(false);
    setLastEstimate(null);
    setDebouncedDescription(entry?.description || '');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingEntry(null);
    setFormData({
      clientId: 0,
      hours: '',
      description: '',
      date: new Date(),
    });
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.clientId) {
      setError('Please select a client');
      return;
    }

    const hours = parseFloat(hoursValue);
    if (!hours || hours <= 0 || hours > 24) {
      setError('Hours must be between 0 and 24');
      return;
    }

    if (!formData.date) {
      setError('Please select a date');
      return;
    }

    const entryData = {
      clientId: formData.clientId,
      hours,
      description: formData.description || undefined,
      date: formData.date.toISOString().split('T')[0],
    };

    if (editingEntry) {
      updateMutation.mutate({
        id: editingEntry.id,
        data: entryData,
      });
    } else {
      createMutation.mutate(entryData);
    }
  };

  const handleDelete = (entry: WorkEntry) => {
    if (window.confirm(`Are you sure you want to delete this ${entry.hours} hour entry for ${entry.client_name}?`)) {
      deleteMutation.mutate(entry.id);
    }
  };

  if (entriesLoading || clientsLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4">Work Entries</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Add Work Entry
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {clients.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              You need to create at least one client before adding work entries.
            </Typography>
            <Button variant="contained" href="/clients">
              Create Client
            </Button>
          </Paper>
        ) : (
          <Paper>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Hours</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workEntries.length > 0 ? (
                    workEntries.map((entry: WorkEntry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Typography variant="subtitle1" fontWeight="medium">
                            {entry.client_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(entry.date).toLocaleDateString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={`${entry.hours} hours`} 
                            color="primary" 
                            variant="outlined" 
                          />
                        </TableCell>
                        <TableCell>
                          {entry.description ? (
                            <Typography variant="body2" color="text.secondary">
                              {entry.description}
                            </Typography>
                          ) : (
                            <Chip label="No description" size="small" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            onClick={() => handleOpen(entry)}
                            color="primary"
                            size="small"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            onClick={() => handleDelete(entry)}
                            color="error"
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography color="text.secondary" sx={{ py: 3 }}>
                          No work entries found. Add your first work entry to get started.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
          <DialogTitle>
            {editingEntry ? 'Edit Work Entry' : 'Add New Work Entry'}
          </DialogTitle>
          <form onSubmit={handleSubmit}>
            <DialogContent>
              <FormControl fullWidth margin="dense" required>
                <InputLabel>Client</InputLabel>
                <Select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: Number(e.target.value) })}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {clients.map((client: { id: number; name: string }) => (
                    <MenuItem key={client.id} value={client.id}>
                      {client.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                margin="dense"
                label="Hours"
                type="number"
                fullWidth
                required
                value={hoursValue}
                onChange={(e) => {
                  setHoursTouched(true);
                  setFormData({ ...formData, hours: e.target.value });
                }}
                disabled={createMutation.isPending || updateMutation.isPending}
                helperText={suggestion ? 'Suggested by model' : undefined}
                slotProps={{
                  htmlInput: { min: 0.01, max: 24, step: 0.01 },
                  input: suggestion
                    ? {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title={`Model: ${suggestion.modelVersion}`}>
                              <SuggestedIcon color="primary" fontSize="small" aria-label="Suggested by model" />
                            </Tooltip>
                          </InputAdornment>
                        ),
                      }
                    : undefined,
                }}
              />

              <DatePicker
                label="Date"
                value={formData.date}
                onChange={(date) => date && setFormData({ ...formData, date })}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    required: true,
                    disabled: createMutation.isPending || updateMutation.isPending,
                  },
                }}
              />

              <TextField
                margin="dense"
                label="Description"
                fullWidth
                multiline
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose} disabled={createMutation.isPending || updateMutation.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <CircularProgress size={24} />
                ) : (
                  editingEntry ? 'Update' : 'Create'
                )}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default WorkEntriesPage;
