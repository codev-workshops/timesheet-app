import React, { useState } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const MIN_PASSWORD_LENGTH = 12;

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const passwordTooShort = isRegistering && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isRegistering) {
        await register(email, password);
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(
        error.response?.data?.error ||
          (isRegistering ? 'Registration failed. Please try again.' : 'Login failed. Please try again.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering((previous) => !previous);
    setError('');
    setPassword('');
  };

  return (
    <Container component="main" maxWidth="sm">
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        px: 2,
      }}
    >
      <Paper elevation={3} sx={{ padding: 3, width: '100%', maxWidth: 500 }}>
        <Typography component="h1" variant="h4" align="center" gutterBottom>
          Time Tracker
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 2 }}>
          {isRegistering ? 'Create an account to get started' : 'Sign in to your account'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="password"
            label="Password"
            name="password"
            type="password"
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            error={passwordTooShort}
            helperText={
              isRegistering ? `Must be at least ${MIN_PASSWORD_LENGTH} characters` : undefined
            }
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 2, mb: 1 }}
            disabled={isLoading || !email || !password || passwordTooShort}
          >
            {isLoading ? (
              <CircularProgress size={24} />
            ) : isRegistering ? (
              'Create Account'
            ) : (
              'Log In'
            )}
          </Button>
          <Typography variant="body2" align="center">
            <Link component="button" type="button" onClick={toggleMode} underline="hover">
              {isRegistering ? 'Already have an account? Log in' : 'Need an account? Register'}
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
    </Container>
  );
};

export default LoginPage;
