// Sprint 4 task 0: the key flows clicked through on the emulator-backed app.
import { expect, test } from '@playwright/test';
import { login, nav, PASSWORD, shot, signUpAndVerify, summary } from './helpers';

test.describe.configure({ mode: 'serial' });

const newOwner = { name: 'Nina Newowner', email: 'nina.newowner@demo.smartaqua.test' };
const newCaretaker = { name: 'Carlo Caretaker', email: 'carlo.caretaker@demo.smartaqua.test' };

test('sign up → empty state', async ({ page }) => {
  await signUpAndVerify(page, newOwner.name, newOwner.email);
  await shot(page, 'login');
  await page.getByPlaceholder('you@example.com').fill(newOwner.email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to SmartAqua Pro' })).toBeVisible();
  await expect(page.getByText('Add your first device')).toBeVisible();
  await expect(page.getByText('Waiting for an invite')).toBeVisible();
  await shot(page, 'empty-state');
});

test('claim a device → wizard → dashboard', async ({ page }) => {
  const device = summary().spareDevices[0];
  await login(page, newOwner.email, PASSWORD);
  await page.getByRole('button', { name: 'Add device' }).first().click();
  await page.getByRole('button', { name: 'Wi-Fi is set up' }).click();
  await page.getByLabel('Device ID').fill(device.deviceId);
  await page.getByLabel('Claim code').fill(device.claimCode);
  await shot(page, 'add-device');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Aquarium name').fill('Nina Office Tank');
  await page.getByLabel('Organization name (optional)').fill('Nina Aquatics');
  await page.getByRole('button', { name: 'Add device' }).last().click();

  await expect(page.getByRole('heading', { name: 'Set up your aquarium' })).toBeVisible();
  await page.getByLabel('Length (cm)').fill('60');
  await page.getByLabel('Width (cm)').fill('30');
  await page.getByLabel('Height (cm)').fill('35');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Filter type').fill('Hang-on-back');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Number of fish').fill('2');
  await page.getByLabel('Fish 1 (g)').fill('40');
  await page.getByLabel('Fish 2 (g)').fill('55');
  await expect(page.getByText('Bioload preview')).toBeVisible();
  await shot(page, 'setup-wizard-fish');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await shot(page, 'setup-wizard-thresholds');
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page.getByText('Nina Office Tank').first()).toBeVisible();
  await nav(page, 'Dashboard');
  await expect(page.getByText('Nina Office Tank').first()).toBeVisible();
  await expect(page.getByText('Nina Aquatics').first()).toBeVisible();
  await shot(page, 'dashboard-new-tank');
});

test('owner invites → caretaker accepts → caretaker sees only tank 1', async ({ browser }) => {
  const demo = summary();
  const owner = await browser.newPage();
  await login(owner, demo.accounts.ownerA.email, demo.password);
  await nav(owner, 'Team');
  await owner.getByLabel('Their email').fill(newCaretaker.email);
  await owner.getByLabel('Front Counter Tank').check();
  await owner.getByRole('button', { name: 'Create invite link' }).click();
  const link = (await owner.locator('code').filter({ hasText: '/invite/' }).innerText()).trim();
  await shot(owner, 'team-invite');
  await owner.close();

  const caretaker = await browser.newPage();
  await signUpAndVerify(caretaker, newCaretaker.name, newCaretaker.email);
  await caretaker.goto(new URL(link).pathname);
  await caretaker.waitForURL((url) => url.pathname === '/');
  await caretaker.getByRole('button', { name: 'Login', exact: true }).click();
  await caretaker.getByPlaceholder('you@example.com').fill(newCaretaker.email);
  await caretaker.getByPlaceholder('Enter your password').fill(PASSWORD);
  await caretaker.getByRole('button', { name: 'Sign in' }).click();
  await expect(caretaker.getByRole('heading', { name: /invited as a caretaker/ })).toBeVisible();
  await shot(caretaker, 'accept-invite');
  await caretaker.getByRole('button', { name: 'Accept invite' }).click();
  await expect(caretaker.getByText('Davao Pet Shop').first()).toBeVisible();
  await shot(caretaker, 'caretaker-dashboard');
  await nav(caretaker, 'Monitoring');
  await expect(caretaker.getByText('Front Counter Tank').first()).toBeVisible();
  await expect(caretaker.getByText('Display Tank B')).toHaveCount(0);
  await expect(caretaker.locator('aside').getByRole('button', { name: 'Team', exact: true })).toHaveCount(0);
  await shot(caretaker, 'caretaker-monitoring');
  await caretaker.close();
});

test('admin suspends an org, and its owner sees the suspended state', async ({ browser }) => {
  const demo = summary();
  const admin = await browser.newPage();
  await login(admin, demo.accounts.admin.email, demo.password);
  await nav(admin, 'Organizations');
  const row = admin.getByRole('row').filter({ hasText: 'Ben Owner' });
  await row.getByRole('button', { name: 'Suspend' }).click();
  await admin.getByRole('button', { name: 'Suspend', exact: true }).last().click();
  await expect(row.getByText('Suspended')).toBeVisible();
  await shot(admin, 'admin-organizations');

  const owner = await browser.newPage();
  await login(owner, demo.accounts.ownerB.email, demo.password);
  await expect(owner.getByRole('heading', { name: /is suspended/ })).toBeVisible();
  await shot(owner, 'org-suspended');
  await owner.close();

  await row.getByRole('button', { name: 'Reactivate' }).click();
  await admin.getByRole('button', { name: 'Reactivate', exact: true }).last().click();
  await expect(row.getByText('Active')).toBeVisible();
  await admin.close();
});
