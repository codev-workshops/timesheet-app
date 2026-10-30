import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '../LoginPage';
import { AuthProvider } from '../../contexts/AuthContext';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => {
  const mockClient = {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  };
  return { default: mockClient, apiClient: mockClient };
});

const mockedLogin = vi.mocked(apiClient.login);

const renderLoginPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>Dashboard Destination</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

const getEmailInput = () => screen.getByRole('textbox', { name: /email address/i });
const getSubmitButton = () => screen.getByRole('button', { name: /log in/i });

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders the login form', () => {
    renderLoginPage();

    expect(screen.getByRole('heading', { name: 'Time Tracker' })).toBeInTheDocument();
    expect(screen.getByText('Enter your email to log in')).toBeInTheDocument();
    expect(
      screen.getByText('This app intentionally does not have a password field.')
    ).toBeInTheDocument();
    expect(getEmailInput()).toBeRequired();
    expect(getEmailInput()).toHaveFocus();
    expect(getSubmitButton()).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('disables submit while the email is empty and enables it once typed', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    expect(getSubmitButton()).toBeDisabled();

    await user.type(getEmailInput(), 'user@example.com');
    expect(getEmailInput()).toHaveValue('user@example.com');
    expect(getSubmitButton()).toBeEnabled();

    await user.clear(getEmailInput());
    expect(getSubmitButton()).toBeDisabled();
  });

  it('does not call login when the empty form is submitted', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    expect(getSubmitButton()).toBeDisabled();

    await user.type(getEmailInput(), '{enter}');

    expect(mockedLogin).not.toHaveBeenCalled();
    expect(screen.queryByText('Dashboard Destination')).not.toBeInTheDocument();
  });

  it('logs in, stores the email and navigates to the dashboard', async () => {
    const user = userEvent.setup();
    mockedLogin.mockResolvedValue({
      message: 'Login successful',
      user: { email: 'user@example.com', createdAt: '2024-01-01T00:00:00Z' },
    });
    renderLoginPage();

    await user.type(getEmailInput(), 'user@example.com');
    await user.click(getSubmitButton());

    expect(await screen.findByText('Dashboard Destination')).toBeInTheDocument();
    expect(mockedLogin).toHaveBeenCalledWith('user@example.com');
    expect(localStorage.getItem('userEmail')).toBe('user@example.com');
  });

  it('shows the server error message when login fails', async () => {
    const user = userEvent.setup();
    mockedLogin.mockRejectedValue({ response: { data: { error: 'Invalid email format' } } });
    renderLoginPage();

    await user.type(getEmailInput(), 'bad@example.com');
    await user.click(getSubmitButton());

    expect(await screen.findByText('Invalid email format')).toBeInTheDocument();
    expect(localStorage.getItem('userEmail')).toBeNull();
    expect(screen.queryByText('Dashboard Destination')).not.toBeInTheDocument();
    expect(getEmailInput()).toBeEnabled();
    expect(getSubmitButton()).toBeEnabled();
  });

  it('shows a fallback error message when the failure has no server message', async () => {
    const user = userEvent.setup();
    mockedLogin.mockRejectedValue(new Error('Network Error'));
    renderLoginPage();

    await user.type(getEmailInput(), 'user@example.com');
    await user.click(getSubmitButton());

    expect(await screen.findByText('Login failed. Please try again.')).toBeInTheDocument();
  });

  it('clears a previous error when submitting again', async () => {
    const user = userEvent.setup();
    mockedLogin
      .mockRejectedValueOnce({ response: { data: { error: 'Server unavailable' } } })
      .mockResolvedValueOnce({
        message: 'Login successful',
        user: { email: 'user@example.com', createdAt: '2024-01-01T00:00:00Z' },
      });
    renderLoginPage();

    await user.type(getEmailInput(), 'user@example.com');
    await user.click(getSubmitButton());
    expect(await screen.findByText('Server unavailable')).toBeInTheDocument();

    await user.click(getSubmitButton());
    expect(await screen.findByText('Dashboard Destination')).toBeInTheDocument();
    expect(screen.queryByText('Server unavailable')).not.toBeInTheDocument();
  });

  it('shows a loading indicator and disables the form while logging in', async () => {
    const user = userEvent.setup();
    let resolveLogin: (value: { message: string; user: { email: string; createdAt: string } }) => void =
      () => {};
    mockedLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );
    renderLoginPage();

    await user.type(getEmailInput(), 'user@example.com');
    await user.click(getSubmitButton());

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(getEmailInput()).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();

    resolveLogin({
      message: 'Login successful',
      user: { email: 'user@example.com', createdAt: '2024-01-01T00:00:00Z' },
    });

    expect(await screen.findByText('Dashboard Destination')).toBeInTheDocument();
  });
});
