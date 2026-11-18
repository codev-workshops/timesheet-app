import { useState } from 'react';
import {
  Alert, Box, CircularProgress, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { useReportSummary } from '../hooks/useReportSummary';
import type { ReportSummaryParams } from '../types/api';

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function ReportSummarySection() {
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return localDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => localDate(new Date()));
  const [groupBy, setGroupBy] = useState<ReportSummaryParams['groupBy']>('month');
  const { data, isLoading, isError } = useReportSummary({ startDate, endDate, groupBy });
  const invalidRange = !startDate || !endDate || endDate < startDate;

  return (
    <Paper component="section" sx={{ p: 3, mb: 3 }}>
      <Typography variant="h5" gutterBottom>Summary across all clients</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ my: 2 }}>
        <TextField label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <ToggleButtonGroup exclusive value={groupBy} aria-label="Summary grouping" onChange={(_, value: ReportSummaryParams['groupBy'] | null) => { if (value) setGroupBy(value); }}>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="month">Month</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {invalidRange ? <Alert severity="warning">Choose both dates with the end date on or after the start date.</Alert> : isLoading ? (
        <Box role="status"><CircularProgress aria-label="Loading summary" /></Box>
      ) : isError ? <Alert severity="error">Unable to load the summary. Please try again.</Alert> : data && (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>Total hours: {data.totalHours.toFixed(2)} · Entries: {data.entryCount}</Typography>
          {data.entryCount === 0 ? <Alert severity="info">No work entries in this date range.</Alert> : (
            <>
              <Typography variant="subtitle1">Per-client totals</Typography>
              <TableContainer sx={{ mb: 3 }}>
                <Table aria-label="Summary per-client totals">
                  <TableHead><TableRow><TableCell>Client</TableCell><TableCell align="right">Hours</TableCell><TableCell align="right">Entries</TableCell></TableRow></TableHead>
                  <TableBody>{data.clients.map((client) => (
                    <TableRow key={client.clientId}><TableCell>{client.clientName}</TableCell><TableCell align="right">{client.totalHours.toFixed(2)}</TableCell><TableCell align="right">{client.entryCount}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </TableContainer>
              <Typography variant="subtitle1">{groupBy === 'week' ? 'Weekly totals (weeks start Monday)' : 'Monthly totals'}</Typography>
              <TableContainer>
                <Table aria-label="Summary period totals">
                  <TableHead><TableRow><TableCell>Period</TableCell><TableCell align="right">Hours</TableCell><TableCell>Per-client breakdown</TableCell></TableRow></TableHead>
                  <TableBody>{data.periods.map((period) => (
                    <TableRow key={period.period}>
                      <TableCell>{groupBy === 'week' ? `Week of ${period.period}` : period.period}</TableCell>
                      <TableCell align="right">{period.totalHours.toFixed(2)}</TableCell>
                      <TableCell>{period.clients.map((client) => `${client.clientName}: ${client.hours.toFixed(2)} h`).join('; ')}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </>
      )}
    </Paper>
  );
}
