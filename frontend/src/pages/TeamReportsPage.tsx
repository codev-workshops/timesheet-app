import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  Description as CsvIcon,
  PictureAsPdf as PdfIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, isValid, startOfMonth, subMonths } from 'date-fns';
import apiClient from '../api/client';
import {
  useTeamByProject,
  useTeamEmployeeReport,
  useTeamEmployees,
  useTeamSummary,
} from '../hooks/useTeamReports';
import type { TeamDateRange, TeamGroupBy } from '../types/api';

const toApiDate = (date: Date) => format(date, 'yyyy-MM-dd');

const formatHours = (hours: number) => hours.toFixed(2);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
    {children}
  </Typography>
);

const EmptyRow: React.FC<{ colSpan: number; message: string }> = ({ colSpan, message }) => (
  <TableRow>
    <TableCell colSpan={colSpan} align="center">
      <Typography color="text.secondary" sx={{ py: 2 }}>
        {message}
      </Typography>
    </TableCell>
  </TableRow>
);

const TeamReportsPage: React.FC = () => {
  const [startDate, setStartDate] = useState<Date | null>(() => startOfMonth(subMonths(new Date(), 2)));
  const [endDate, setEndDate] = useState<Date | null>(() => new Date());
  const [groupBy, setGroupBy] = useState<TeamGroupBy>('week');
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [error, setError] = useState('');

  const rangeIsValid =
    !!startDate && !!endDate && isValid(startDate) && isValid(endDate) && startDate <= endDate;
  const range: TeamDateRange = useMemo(
    () => ({
      start_date: startDate && isValid(startDate) ? toApiDate(startDate) : '',
      end_date: endDate && isValid(endDate) ? toApiDate(endDate) : '',
    }),
    [startDate, endDate]
  );

  const employeesQuery = useTeamEmployees();
  const isManager = (employeesQuery.data?.employees.length ?? 0) > 0;
  const enabled = isManager && rangeIsValid;

  const summaryQuery = useTeamSummary(range, groupBy, enabled);
  const byProjectQuery = useTeamByProject(range, enabled);
  const employeeQuery = useTeamEmployeeReport(selectedEmployee, range, enabled);

  const employees = employeesQuery.data?.employees ?? [];
  const summary = useMemo(() => summaryQuery.data?.summary ?? [], [summaryQuery.data]);
  const byProject = byProjectQuery.data?.byProject ?? [];
  const projectTotals = byProjectQuery.data?.projectTotals ?? [];

  const hoursByEmployee = useMemo(() => {
    const totals = new Map<string, number>();
    summary.forEach((row) => {
      totals.set(row.employee_email, (totals.get(row.employee_email) ?? 0) + row.total_hours);
    });
    return totals;
  }, [summary]);

  const teamTotal = Array.from(hoursByEmployee.values()).reduce((sum, hours) => sum + hours, 0);

  const handleExport = async (exportFormat: 'csv' | 'pdf') => {
    try {
      const blob = await apiClient.exportTeamReport(exportFormat, range);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `team_report_${range.start_date}_${range.end_date}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      setError(`Failed to export ${exportFormat.toUpperCase()} report`);
      console.error('Export error:', err);
    }
  };

  if (employeesQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!isManager) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Team Reports
        </Typography>
        <Alert severity="info">Team reports are only available to managers with assigned employees.</Alert>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Team Reports
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label="Start date"
                value={startDate}
                onChange={(date) => setStartDate(date)}
                slotProps={{ textField: { fullWidth: true, inputProps: { 'data-testid': 'start-date' } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DatePicker
                label="End date"
                value={endDate}
                onChange={(date) => setEndDate(date)}
                slotProps={{ textField: { fullWidth: true, inputProps: { 'data-testid': 'end-date' } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <ToggleButtonGroup
                value={groupBy}
                exclusive
                onChange={(_e, value: TeamGroupBy | null) => value && setGroupBy(value)}
                aria-label="Group by"
                color="primary"
              >
                <ToggleButton value="week">Weekly</ToggleButton>
                <ToggleButton value="month">Monthly</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Box display="flex" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<CsvIcon />}
                  onClick={() => handleExport('csv')}
                  disabled={!rangeIsValid}
                >
                  CSV
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<PdfIcon />}
                  onClick={() => handleExport('pdf')}
                  disabled={!rangeIsValid}
                >
                  PDF
                </Button>
              </Box>
            </Grid>
          </Grid>
          {!rangeIsValid && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Select a valid date range (start date on or before end date).
            </Alert>
          )}
        </Paper>

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Employees
                </Typography>
                <Typography variant="h4">{employees.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Team Hours
                </Typography>
                <Typography variant="h4">{formatHours(teamTotal)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Projects
                </Typography>
                <Typography variant="h4">{projectTotals.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper sx={{ mb: 3 }}>
          <SectionTitle>Employees</SectionTitle>
          <TableContainer>
            <Table size="small" aria-label="Employees">
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell align="right">Hours in range</TableCell>
                  <TableCell align="right">Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employees.map(({ email }) => (
                  <TableRow key={email} selected={selectedEmployee === email}>
                    <TableCell>{email}</TableCell>
                    <TableCell align="right">{formatHours(hoursByEmployee.get(email) ?? 0)}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<PersonIcon />}
                        onClick={() => setSelectedEmployee(selectedEmployee === email ? null : email)}
                      >
                        {selectedEmployee === email ? 'Hide entries' : 'View entries'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {selectedEmployee && (
          <Paper sx={{ mb: 3 }}>
            <SectionTitle>
              Entries for {selectedEmployee}
              {employeeQuery.data && (
                <Chip
                  sx={{ ml: 2 }}
                  color="primary"
                  label={`${formatHours(employeeQuery.data.totalHours)} hours · ${employeeQuery.data.entryCount} entries`}
                />
              )}
            </SectionTitle>
            <TableContainer>
              <Table size="small" aria-label="Employee entries">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell align="right">Hours</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employeeQuery.isLoading ? (
                    <EmptyRow colSpan={4} message="Loading..." />
                  ) : (employeeQuery.data?.workEntries.length ?? 0) === 0 ? (
                    <EmptyRow colSpan={4} message="No entries in this date range." />
                  ) : (
                    employeeQuery.data?.workEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.date}</TableCell>
                        <TableCell>{entry.client_name}</TableCell>
                        <TableCell align="right">{formatHours(entry.hours)}</TableCell>
                        <TableCell>{entry.description || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper>
              <SectionTitle>Hours per {groupBy === 'week' ? 'week' : 'month'}</SectionTitle>
              <TableContainer>
                <Table size="small" aria-label="Summary by period">
                  <TableHead>
                    <TableRow>
                      <TableCell>{groupBy === 'week' ? 'Week (YYYY-WW)' : 'Month (YYYY-MM)'}</TableCell>
                      <TableCell>Employee</TableCell>
                      <TableCell align="right">Hours</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summaryQuery.isLoading ? (
                      <EmptyRow colSpan={3} message="Loading..." />
                    ) : summary.length === 0 ? (
                      <EmptyRow colSpan={3} message="No hours logged in this date range." />
                    ) : (
                      summary.map((row) => (
                        <TableRow key={`${row.period}-${row.employee_email}`}>
                          <TableCell>{row.period}</TableCell>
                          <TableCell>{row.employee_email}</TableCell>
                          <TableCell align="right">{formatHours(row.total_hours)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ mb: 3 }}>
              <SectionTitle>Hours by project</SectionTitle>
              <TableContainer>
                <Table size="small" aria-label="Hours by project">
                  <TableHead>
                    <TableRow>
                      <TableCell>Client</TableCell>
                      <TableCell>Employee</TableCell>
                      <TableCell align="right">Hours</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byProjectQuery.isLoading ? (
                      <EmptyRow colSpan={3} message="Loading..." />
                    ) : byProject.length === 0 ? (
                      <EmptyRow colSpan={3} message="No hours logged in this date range." />
                    ) : (
                      byProject.map((row) => (
                        <TableRow key={`${row.client_name}-${row.employee_email}`}>
                          <TableCell>{row.client_name}</TableCell>
                          <TableCell>{row.employee_email}</TableCell>
                          <TableCell align="right">{formatHours(row.total_hours)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper>
              <SectionTitle>Project totals (all employees)</SectionTitle>
              <TableContainer>
                <Table size="small" aria-label="Project totals">
                  <TableHead>
                    <TableRow>
                      <TableCell>Client</TableCell>
                      <TableCell align="right">Hours</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectTotals.length === 0 ? (
                      <EmptyRow colSpan={2} message="No projects in this date range." />
                    ) : (
                      projectTotals.map((row) => (
                        <TableRow key={row.client_name}>
                          <TableCell>{row.client_name}</TableCell>
                          <TableCell align="right">{formatHours(row.total_hours)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </LocalizationProvider>
  );
};

export default TeamReportsPage;
