import React from 'react';
import {
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { type WorkEntry } from '../types/api';

interface WorkEntriesTableProps {
  workEntries: WorkEntry[];
  onEdit: (entry: WorkEntry) => void;
  onDelete: (entry: WorkEntry) => void;
}

const WorkEntriesTable = React.memo<WorkEntriesTableProps>(({
  workEntries,
  onEdit,
  onDelete,
}) => (
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
            workEntries.map((entry) => (
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
                    onClick={() => onEdit(entry)}
                    color="primary"
                    size="small"
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(entry)}
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
));

export default WorkEntriesTable;
