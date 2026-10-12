import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  DeleteSweep as DeleteSweepIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '../types/api';

const CategoriesPage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: categoriesData, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.getCategories(),
  });

  const createMutation = useMutation({
    mutationFn: (categoryData: CreateCategoryRequest) => apiClient.createCategory(categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      handleClose();
    },
    onError: (err: unknown) => {
      const apiError = err as { response?: { data?: { error?: string } } };
      setError(apiError.response?.data?.error || 'Failed to create category');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryRequest }) =>
      apiClient.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['workEntries'] });
      handleClose();
    },
    onError: (err: unknown) => {
      const apiError = err as { response?: { data?: { error?: string } } };
      setError(apiError.response?.data?.error || 'Failed to update category');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['workEntries'] });
    },
    onError: (err: unknown) => {
      const apiError = err as { response?: { data?: { error?: string } } };
      setError(apiError.response?.data?.error || 'Failed to delete category');
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiClient.deleteAllCategories(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['workEntries'] });
    },
    onError: (err: unknown) => {
      const apiError = err as { response?: { data?: { error?: string } } };
      setError(apiError.response?.data?.error || 'Failed to delete all categories');
    },
  });

  const categories: Category[] = categoriesData?.categories || [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleOpen = (category?: Category) => {
    setEditingCategory(category || null);
    setName(category?.name || '');
    setError('');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingCategory(null);
    setName('');
    setError('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Category name is required');
      return;
    }

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: { name: trimmedName } });
    } else {
      createMutation.mutate({ name: trimmedName });
    }
  };

  const handleDelete = (category: Category) => {
    if (window.confirm(`Are you sure you want to delete "${category.name}"?`)) {
      deleteMutation.mutate(category.id);
    }
  };

  const handleDeleteAll = () => {
    if (window.confirm('Are you sure you want to delete ALL categories? This action cannot be undone.')) {
      deleteAllMutation.mutate();
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
        <Typography variant="h4">Categories</Typography>
        <Box display="flex" gap={2}>
          {categories.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepIcon />}
              onClick={handleDeleteAll}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? 'Clearing...' : 'Clear All'}
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Add Category
          </Button>
        </Box>
      </Box>

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
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.length > 0 ? (
                categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <Typography variant="subtitle1" fontWeight="medium">
                        {category.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(category.created_at).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton onClick={() => handleOpen(category)} color="primary" size="small">
                        <EditIcon />
                      </IconButton>
                      <IconButton onClick={() => handleDelete(category)} color="error" size="small">
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      No categories found. Create your first category to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Category Name"
              fullWidth
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSaving}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={isSaving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSaving}>
              {isSaving ? <CircularProgress size={24} /> : editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default CategoriesPage;
