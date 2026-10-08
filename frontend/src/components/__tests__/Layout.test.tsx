import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import Typography from '@mui/material/Typography';
import Layout from '../Layout';
import { createAuthValue, renderWithProviders } from '../../test/utils';

const renderLayout = (route: string, auth = createAuthValue()) =>
  renderWithProviders(
    <Layout>
      <Typography>Page body</Typography>
    </Layout>,
    { route, auth },
  );

describe('Layout', () => {
  it('renders children, the user email and avatar initial', () => {
    renderLayout('/dashboard');

    expect(screen.getByText('Page body')).toBeInTheDocument();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('jane@example.com')).toBeInTheDocument();
    expect(within(banner).getByText('J')).toBeInTheDocument();
  });

  it.each([
    ['/dashboard', 'Dashboard'],
    ['/clients', 'Clients'],
    ['/work-entries', 'Work Entries'],
    ['/reports', 'Reports'],
    ['/unknown', 'Time Tracker'],
  ])('shows the title for %s', (route, title) => {
    renderLayout(route);
    expect(within(screen.getByRole('banner')).getByText(title)).toBeInTheDocument();
  });

  it('marks the current menu item as selected', () => {
    renderLayout('/clients');
    const selected = screen.getAllByRole('button', { name: 'Clients' });
    selected.forEach((item) => expect(item).toHaveClass('Mui-selected'));
    screen
      .getAllByRole('button', { name: 'Reports' })
      .forEach((item) => expect(item).not.toHaveClass('Mui-selected'));
  });

  it('navigates when a menu item is clicked', () => {
    renderLayout('/dashboard');

    fireEvent.click(screen.getAllByRole('button', { name: 'Work Entries' })[0]);

    expect(screen.getByTestId('location')).toHaveTextContent('/work-entries');
  });

  it('calls logout from the app bar', () => {
    const auth = createAuthValue();
    renderLayout('/dashboard', auth);

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('toggles the mobile drawer', () => {
    renderLayout('/dashboard');
    const toggle = screen.getByRole('button', { name: 'open drawer' });
    const mobileDrawer = () => document.querySelector('.MuiDrawer-modal');

    expect(mobileDrawer()).toHaveClass('MuiModal-hidden');
    fireEvent.click(toggle);
    expect(mobileDrawer()).not.toHaveClass('MuiModal-hidden');
  });

  it('renders without a user', () => {
    renderLayout('/dashboard', createAuthValue({ user: null, isAuthenticated: false }));
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });
});
