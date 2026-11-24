import { expect, test } from '@playwright/test';

test('shows the missing-client error and disables both report exports', async ({ page }) => {
  const email = 'reports@example.com';
  await page.addInitScript((email) => localStorage.setItem('userEmail', email), email);
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: { email } } }));
  await page.route('**/api/clients', (route) =>
    route.fulfill({ json: { clients: [{ id: 1, name: 'Deleted client' }] } }),
  );
  await page.route('**/api/reports/client/1', (route) =>
    route.fulfill({ status: 404, json: { error: 'Client not found' } }),
  );

  await page.goto('/reports');
  await page.getByRole('combobox').click();
  const reportResponse = page.waitForResponse('**/api/reports/client/1');
  await page.getByRole('option', { name: 'Deleted client' }).click();
  expect((await reportResponse).status()).toBe(404);
  await expect(page.getByRole('progressbar')).toHaveCount(0);

  await expect.soft(page.getByRole('alert')).toHaveText('Client not found');
  await expect.soft(page.getByRole('button', { name: 'Export as CSV' })).toBeDisabled();
  await expect.soft(page.getByRole('button', { name: 'Export as PDF' })).toBeDisabled();
});
