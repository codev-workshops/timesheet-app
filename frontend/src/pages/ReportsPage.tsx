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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Autocomplete,
  TextField,
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  Description as CsvIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { type ClientReport, type WorkEntry, PROJECT_MAX_LENGTH } from '../types/api';

const ReportsPage: React.FC = () => {
  const [selectedClientId, setSelectedClientId] = useState<number>(0);
  const [projectInput, setProjectInput] = useState('');
  const [appliedProject, setAppliedProject] = useState('');
  const [error, setError] = useState('');

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.getClients(),
  });

  // Typed text is only applied on Enter, option select, or Apply, to avoid a request per keystroke.
  // The applied (trimmed) value drives the report and both downloads; blank means unfiltered.
  const activeProject = appliedProject;
  const trimmedInput = projectInput.trim();
  const projectInputInvalid = trimmedInput.length > PROJECT_MAX_LENGTH;
  const projectInputPending = trimmedInput !== activeProject;

  const applyProjectFilter = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > PROJECT_MAX_LENGTH) return;
    setAppliedProject(trimmed);
  };

  const { data: clientEntriesData } = useQuery({
    queryKey: ['workEntries', selectedClientId],
    queryFn: () => apiClient.getWorkEntries(selectedClientId),
    enabled: selectedClientId > 0,
  });

  const {
    data: reportData,
    isLoading: reportLoading,
    isError: reportIsError,
  } = useQuery({
    queryKey: ['clientReport', selectedClientId, activeProject],
    queryFn: () => apiClient.getClientReport(selectedClientId, activeProject),
    enabled: selectedClientId > 0,
  });

  const clients = clientsData?.clients || [];
  const report = reportData as ClientReport | undefined;
  const clientEntries: WorkEntry[] = clientEntriesData?.workEntries || [];
  const projectOptions = Array.from(
    new Set(clientEntries.map((entry) => entry.project).filter((p): p is string => !!p))
  ).sort((a, b) => a.localeCompare(b));
  const exportDisabled = !selectedClientId || reportLoading || reportIsError;

  const exportFileName = (extension: string) => {
    const client = clients.find((c: { id: number; name: string }) => c.id === selectedClientId);
    const projectPart = activeProject ? `_${activeProject.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    return `${client?.name?.replace(/[^a-zA-Z0-9]/g, '_')}${projectPart}_report_${new Date().toISOString().split('T')[0]}.${extension}`;
  };

  const handleExportCsv = async () => {
    if (exportDisabled) return;
    
    try {
      const blob = await apiClient.exportClientReportCsv(selectedClientId, activeProject);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName('csv');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      setError('Failed to export CSV report');
      console.error('Export error:', err);
    }
  };

  const handleExportPdf = async () => {
    if (exportDisabled) return;

    try {
      const blob = await apiClient.exportClientReportPdf(selectedClientId, activeProject);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName('pdf');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      setError('Failed to export PDF report');
      console.error('Export error:', err);
    }
  };

  const selectedClient = clients.find((c: { id: number; name: string }) => c.id === selectedClientId);

  if (clientsLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Reports
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {clients.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            You need to create at least one client before generating reports.
          </Typography>
          <Button variant="contained" href="/clients">
            Create Client
          </Button>
        </Paper>
      ) : (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Grid container spacing={3} alignItems="center">
              <Grid size={{ xs: 12, md: 5 }}>
                <FormControl fullWidth>
                  <InputLabel>Select Client</InputLabel>
                  <Select
                    value={selectedClientId}
                    onChange={(e) => {
                      setSelectedClientId(Number(e.target.value));
                      setProjectInput('');
                      setAppliedProject('');
                    }}
                    label="Select Client"
                  >
                    <MenuItem value={0}>Choose a client...</MenuItem>
                    {clients.map((c: { id: number; name: string }) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Box display="flex" gap={1} alignItems="flex-start">
                  <Autocomplete
                    freeSolo
                    fullWidth
                    options={projectOptions}
                    value={activeProject || null}
                    onChange={(_event, value) => applyProjectFilter(value ?? '')}
                    inputValue={projectInput}
                    onInputChange={(_event, value) => setProjectInput(value)}
                    disabled={!selectedClientId}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Filter by Project"
                        placeholder="All projects"
                        error={projectInputInvalid}
                        helperText={
                          projectInputInvalid
                            ? `Project must be ${PROJECT_MAX_LENGTH} characters or less`
                            : projectInputPending
                              ? 'Press Enter or Apply to filter.'
                              : 'Exact match. Leave blank for all entries.'
                        }
                      />
                    )}
                  />
                  <Button
                    variant="contained"
                    onClick={() => applyProjectFilter(projectInput)}
                    disabled={!selectedClientId || projectInputInvalid || !projectInputPending}
                    sx={{ mt: 1 }}
                  >
                    Apply
                  </Button>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Box display="flex" gap={2}>
                  <Tooltip title="Export as CSV">
                    <IconButton
                      onClick={handleExportCsv}
                      disabled={exportDisabled}
                      color="primary"
                      size="large"
                    >
                      <CsvIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export as PDF">
                    <IconButton
                      onClick={handleExportPdf}
                      disabled={exportDisabled}
                      color="error"
                      size="large"
                    >
                      <PdfIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {selectedClient && reportLoading && (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress />
            </Box>
          )}

          {selectedClient && reportIsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load report
            </Alert>
          )}

          {selectedClient && report && (
            <>
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card>
                    <CardContent>
                      <Typography color="textSecondary" gutterBottom>
                        Total Hours
                      </Typography>
                      <Typography variant="h4" component="div">
                        {report.totalHours.toFixed(2)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card>
                    <CardContent>
                      <Typography color="textSecondary" gutterBottom>
                        Total Entries
                      </Typography>
                      <Typography variant="h4" component="div">
                        {report.entryCount}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card>
                    <CardContent>
                      <Typography color="textSecondary" gutterBottom>
                        Average Hours per Entry
                      </Typography>
                      <Typography variant="h4" component="div">
                        {report.entryCount > 0 ? (report.totalHours / report.entryCount).toFixed(2) : '0.00'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Paper>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Hours</TableCell>
                        <TableCell>Project</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Created</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {report.workEntries.length > 0 ? (
                        report.workEntries.map((entry) => (
                          <TableRow key={entry.id}>
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
                              {entry.project ? (
                                <Chip label={entry.project} size="small" color="secondary" />
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  —
                                </Typography>
                              )}
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
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {new Date(entry.created_at).toLocaleDateString()}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            <Typography color="text.secondary" sx={{ py: 3 }}>
                              {activeProject
                                ? `No work entries found for project "${activeProject}".`
                                : 'No work entries found for this client.'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </>
          )}

          {!selectedClient && (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                Select a client to view their time report.
              </Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default ReportsPage;
