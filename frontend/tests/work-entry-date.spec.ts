import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

for (const action of ['Update', 'Create'] as const) {
  test(`${action} rejects an impossible work entry date and saves after correction`, async ({ page, request }) => {
    const email = `work-entry-${randomUUID()}@example.com`;
    const headers = { 'x-user-email': email };
    await expect(await request.post('/api/auth/login', { data: { email } })).toBeOK();
    const clientResponse = await request.post('/api/clients', {
      headers,
      data: { name: 'Example Consulting' },
    });
    await expect(clientResponse).toBeOK();

    if (action === 'Update') {
      const { client } = await clientResponse.json();
      await expect(await request.post('/api/work-entries', {
        headers,
        data: { clientId: client.id, hours: 2, description: 'Project planning', date: '2026-02-20' },
      })).toBeOK();
    }

    await page.addInitScript((userEmail) => localStorage.setItem('userEmail', userEmail), email);
    await page.clock.setFixedTime(new Date('2026-02-20T12:00:00Z'));
    await page.goto('/work-entries');
    if (action === 'Update') {
      await page.getByRole('button').filter({ has: page.getByTestId('EditIcon') }).click();
    } else {
      await page.getByRole('button', { name: 'Add Work Entry' }).click();
      await page.getByRole('combobox').click();
      await page.getByRole('option', { name: 'Example Consulting' }).click();
      await page.getByRole('spinbutton', { name: 'Hours' }).fill('2');
    }

    const dialog = page.getByRole('dialog');
    const day = dialog.getByRole('spinbutton', { name: 'Day' });
    const submit = dialog.getByRole('button', { name: action });
    const errors: string[] = [];
    const writes: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('request', (request) => {
      if (request.url().includes('/api/work-entries') && ['POST', 'PUT'].includes(request.method())) {
        writes.push(request.method());
      }
    });

    await day.click();
    await day.pressSequentially('31');
    await expect(day).toHaveText('31');
    await submit.click();

    if (action === 'Update' && process.env.WORK_ENTRY_SCREENSHOT) {
      await page.screenshot({
        path: process.env.WORK_ENTRY_SCREENSHOT,
        animations: 'disabled',
        clip: { x: 220, y: 105, width: 660, height: 550 },
      });
    }

    expect(errors).toEqual([]);
    await expect(dialog.getByText('Enter a valid date')).toBeVisible();
    expect(writes).toEqual([]);

    await day.click();
    await day.pressSequentially('28');
    await expect(dialog.getByText('Enter a valid date')).toBeHidden();
    const response = page.waitForResponse((response) =>
      response.url().includes('/api/work-entries') &&
      response.request().method() === (action === 'Update' ? 'PUT' : 'POST'));
    await submit.click();
    const saved = await response;
    expect(saved.ok()).toBe(true);
    expect(saved.request().postDataJSON().date).toBe('2026-02-28');
    await expect(dialog).toBeHidden();
  });
}
