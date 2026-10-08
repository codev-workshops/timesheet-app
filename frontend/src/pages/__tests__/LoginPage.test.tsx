import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import LoginPage from '../LoginPage';
import { createAuthValue, renderWithProviders } from '../../test/utils';

const renderLogin = (login: (email: string) => Promise<void>) => {
  const auth = createAuthValue({ user: null, isAuthenticated: false, login: vi.fn(login) });
  return renderWithProviders(<LoginPage />, { route: '/login', auth });
};

const typeEmail = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value } });

describe('LoginPage', () => {
  it('disables the submit button until an email is entered', () => {
    renderLogin(() => Promise.resolve());
    const submit = screen.getByRole('button', { name: 'Log In' });

    expect(submit).toBeDisabled();
    typeEmail('jane@example.com');
    expect(submit).toBeEnabled();
  });

  it('logs in and navigates to the dashboard', async () => {
    const { auth } = renderLogin(() => Promise.resolve());

    typeEmail('jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(auth.login).toHaveBeenCalledWith('jane@example.com');
  });

  it('shows a spinner and disables the input while logging in', async () => {
    renderLogin(() => new Promise<void>(() => {}));

    typeEmail('jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/)).toBeDisabled();
  });

  it('shows the server error message on failure', async () => {
    renderLogin(() => Promise.reject({ response: { data: { error: 'Invalid email' } } }));

    typeEmail('bad');
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(await screen.findByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled();
  });

  it('falls back to a generic error message', async () => {
    renderLogin(() => Promise.reject(new Error('Network Error')));

    typeEmail('jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(await screen.findByText('Login failed. Please try again.')).toBeInTheDocument();
  });
});
