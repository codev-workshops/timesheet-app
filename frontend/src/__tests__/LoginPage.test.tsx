import { describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import { renderWithProviders, makeAuth } from '../test/utils';

const renderLogin = (login: (email: string) => Promise<void>) =>
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<h1>Dashboard landed</h1>} />
    </Routes>,
    { route: '/login', auth: makeAuth({ login, isAuthenticated: false, user: null }) }
  );

describe('LoginPage', () => {
  test('submit is disabled until an email is typed', async () => {
    renderLogin(vi.fn(async () => {}));
    const button = screen.getByRole('button', { name: 'Log In' });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Email Address/i), 'a@b.com');
    expect(button).toBeEnabled();
  });

  test('successful login navigates to /dashboard', async () => {
    const login = vi.fn(async () => {});
    renderLogin(login);

    await userEvent.type(screen.getByLabelText(/Email Address/i), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(login).toHaveBeenCalledWith('a@b.com');
    await waitFor(() => expect(screen.getByText('Dashboard landed')).toBeInTheDocument());
  });

  test('shows the server error message on failure and stays on the page', async () => {
    const login = vi.fn(async () => {
      throw { response: { data: { error: 'Invalid email format' } } };
    });
    renderLogin(login);

    await userEvent.type(screen.getByLabelText(/Email Address/i), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(await screen.findByText('Invalid email format')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard landed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled();
  });

  test('falls back to a generic message when the error has no body', async () => {
    const login = vi.fn(async () => { throw new Error('network'); });
    renderLogin(login);

    await userEvent.type(screen.getByLabelText(/Email Address/i), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(await screen.findByText('Login failed. Please try again.')).toBeInTheDocument();
  });
});
