import { randomUUID } from 'node:crypto';
import { expect, test, type Locator } from '@playwright/test';

const client = {
  name: 'Northwind Studio',
  department: 'Product Design',
  email: 'studio@example.com',
  description: 'Design support for the summer launch.',
};

const entryDescription = 'Reviewed the summer launch design.';

test.beforeEach(async ({ page, request }) => {
  const email = `edit-fields-${randomUUID()}@example.com`;
  const headers = { 'x-user-email': email };
  const clientResponse = await request.post('/api/clients', { data: client, headers });
  await expect(clientResponse).toBeOK();
  const { client: { id } } = await clientResponse.json() as { client: { id: number } };
  const entryResponse = await request.post('/api/work-entries', {
    headers,
    data: { clientId: id, hours: 2, description: entryDescription, date: '2025-06-10' },
  });
  await expect(entryResponse).toBeOK();
  await page.addInitScript((email) => localStorage.setItem('userEmail', email), email);
});

async function clearFields(fields: [Locator, string][]) {
  for (const [field, originalValue] of fields) {
    await expect(field).toHaveValue(originalValue);
    await field.clear();
  }
}

test('cleared client fields stay empty after saving and reopening', async ({ page }, testInfo) => {
  await page.goto('/clients');
  const edit = page.getByRole('row', { name: /Northwind Studio/ }).getByTestId('EditIcon');
  const dialog = page.getByRole('dialog', { name: 'Edit Client' });
  const fields = [
    [dialog.getByLabel('Department'), client.department],
    [dialog.getByLabel('Email'), client.email],
    [dialog.getByLabel('Description'), client.description],
  ] satisfies [Locator, string][];

  await edit.click();
  await clearFields(fields);
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await edit.click();
  await dialog.screenshot({ animations: 'disabled', path: testInfo.outputPath('reopened-edit.png') });
  for (const [field] of fields) {
    await expect.soft(field).toHaveValue('', { timeout: 1000 });
  }
});

test('a cleared work entry description stays empty after saving and reopening', async ({ page }, testInfo) => {
  await page.goto('/work-entries');
  const edit = page.getByRole('row', { name: /Northwind Studio/ }).getByTestId('EditIcon');
  const dialog = page.getByRole('dialog', { name: 'Edit Work Entry' });
  const description = dialog.getByLabel('Description');

  await edit.click();
  await clearFields([[description, entryDescription]]);
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await edit.click();
  await dialog.screenshot({ animations: 'disabled', path: testInfo.outputPath('reopened-edit.png') });
  await expect(description).toHaveValue('');
});
