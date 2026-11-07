// Sprint 4 task 0: the key flows clicked through on the emulator-backed app.
import { expect, test } from '@playwright/test';
import { login, nav, PASSWORD, shot, signUpAndVerify, summary, enrollMockTotp } from './helpers';

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

test('a recommendation marked Applied → maintenance logged', async ({ page }) => {
  const demo = summary();
  await login(page, demo.accounts.ownerA.email, demo.password);
  await page.getByLabel('Select aquarium').selectOption({ label: 'Display Tank B' });
  const rec = page.locator('li').filter({ hasText: 'Water temperature far above range' }).filter({ has: page.getByRole('button', { name: 'Applied' }) }).first();
  await expect(rec).toBeVisible();
  await rec.getByRole('button', { name: 'Applied' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Log maintenance' })).toBeVisible();
  await expect(dialog.getByLabel('Notes (optional)')).toHaveValue('Done: Water temperature far above range');
  await dialog.getByLabel('What was done').selectOption('water_change');
  await dialog.getByLabel('Water changed (%)').fill('30');
  await expect(dialog.getByText('This starts a new cleaning cycle')).toBeVisible();
  await shot(page, 'log-maintenance');
  await dialog.getByRole('button', { name: 'Log and mark applied' }).click();
  await expect(page.getByText(/Maintenance logged and the recommendation marked applied\. A new cleaning cycle starts/)).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'Water temperature far above range' }).filter({ has: page.getByRole('button', { name: 'Applied' }) })).toHaveCount(0);

  await nav(page, 'Monitoring');
  await page.getByRole('button', { name: /Display Tank B/ }).click();
  await expect(page.getByRole('heading', { name: 'Maintenance history' })).toBeVisible();
  const entry = page.locator('li').filter({ hasText: 'Water change · 30%' });
  await expect(entry).toBeVisible();
  await expect(entry.getByText('From recommendation')).toBeVisible();
  await expect(entry.getByText('New cleaning cycle')).toBeVisible();

  // Feed now → the command log records it (no device here: it waits, then "No response").
  await page.getByRole('button', { name: 'Feed Now' }).click();
  const command = page.locator('li').filter({ hasText: 'Feed now' }).first();
  await expect(command).toBeVisible();
  await expect(command.getByText('Waiting for device')).toBeVisible();
  await shot(page, 'monitoring-tank-history');
});

test('Sprint 4 screens: schedules, team co-owners, audit log, notifications, admin rules editor', async ({ browser }) => {
  const demo = summary();
  const owner = await browser.newPage();
  await login(owner, demo.accounts.ownerA.email, demo.password);
  await nav(owner, 'Automation');
  await expect(owner.getByRole('heading', { name: 'Front Counter Tank' })).toBeVisible();
  await shot(owner, 'automation');
  await nav(owner, 'Team');
  await expect(owner.getByRole('button', { name: 'Make owner' }).first()).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Make caretaker' })).toBeDisabled();
  await shot(owner, 'team');
  await nav(owner, 'Audit Log');
  await expect(owner.locator('li').filter({ hasText: 'claimed a device' }).first()).toBeVisible();
  await shot(owner, 'audit-log-owner');
  await nav(owner, 'Settings');
  await expect(owner.getByRole('button', { name: 'Turn on alerts' })).toBeDisabled();
  await expect(owner.getByText(/cannot be sent from the local emulator/)).toBeVisible();
  await owner.getByLabel('Alert level').selectOption('critical');
  await expect(owner.getByText('Preferences saved.')).toBeVisible();
  await shot(owner, 'notification-settings');
  await owner.close();

  const admin = await browser.newPage();
  await login(admin, demo.accounts.admin.email, demo.password);
  await nav(admin, 'Rules Editor');
  await admin.getByRole('button', { name: /pH above range/ }).first().click();
  await admin.getByLabel('ph', { exact: true }).fill('7.9');
  await expect(admin.getByText('ph_high_warning').last()).toBeVisible();
  await admin.getByLabel('Source (citation; required to approve)').fill('Adviser memo 2026-11-07, Table 3');
  await admin.getByRole('button', { name: 'Save draft' }).click();
  await expect(admin.getByText('Saved as draft. The engine uses it within 5 minutes.')).toBeVisible();
  await admin.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Approved. The engine uses it within 5 minutes.')).toBeVisible();
  await expect(admin.getByText(/Approved by Platform Admin/)).toBeVisible();
  await shot(admin, 'rules-editor');
  await nav(admin, 'Audit Log');
  await expect(admin.locator('li').filter({ hasText: 'approved a rule' }).first()).toBeVisible();
  await shot(admin, 'audit-log-admin');
  await admin.close();
});

// ---------------------------------------------------------------------------
// Sprint 5: reports (FR21) and the TOTP MFA screens (emulator mock, --mfa-mock)
// ---------------------------------------------------------------------------
const manilaDate = (offsetDays = 0) => new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

test('Sprint 5: generate a report, read the summary, open the PDF and CSV; a caretaker sees only assigned tanks', async ({ browser }) => {
  const demo = summary();
  const page = await browser.newPage();
  await login(page, demo.accounts.ownerA.email, demo.password);
  await nav(page, 'Reports');
  await expect(page.getByRole('heading', { name: 'Monitoring reports' })).toBeVisible();
  await page.getByLabel('Aquarium', { exact: true }).selectOption({ label: 'Display Tank B' });
  await page.getByLabel('Period', { exact: true }).selectOption('custom');
  // The seeded history is the last 4 hours, which can cross midnight in Manila.
  await page.getByLabel('From').fill(manilaDate(-1));
  await page.getByLabel('To (inclusive)').fill(manilaDate());
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.getByText('Report ready.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Recommendations and what was done' })).toBeVisible();
  await expect(page.getByRole('note').getByText('Draft thresholds.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Readings (valid readings only)' })).toBeVisible();
  await shot(page, 'reports');

  // getDownloadURL reads the file's metadata from Storage (allowed by storage.rules);
  // the browser then opens the file. Fetch the same file with the returned token.
  const fileFrom = async (button: RegExp) => {
    const [response] = await Promise.all([
      page.waitForResponse((item) => item.url().includes('127.0.0.1:9199') && item.url().includes('reports%2F') && item.request().method() === 'GET'),
      page.getByRole('button', { name: button }).first().click(),
    ]);
    expect(response.status()).toBe(200);
    const meta = await response.json() as { name: string; bucket: string; downloadTokens: string };
    expect(meta.name).toMatch(/^reports\/[^/]+\/[^/]+\/[^/]+\.(pdf|csv)$/);
    return fetch(`http://127.0.0.1:9199/v0/b/${meta.bucket}/o/${encodeURIComponent(meta.name)}?alt=media&token=${meta.downloadTokens.split(',')[0]}`);
  };
  const pdf = await (await fileFrom(/^Download PDF/)).arrayBuffer();
  expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  const csv = await (await fileFrom(/^Download CSV/)).text();
  expect(csv.split('\n')[0]).toContain('recorded_at_manila');
  await page.close();

  const caretaker = await browser.newPage();
  await login(caretaker, demo.accounts.caretakerX.email, demo.password);
  await nav(caretaker, 'Reports');
  await expect(caretaker.getByLabel('Aquarium', { exact: true }).locator('option')).toHaveText(['Front Counter Tank']);
  await caretaker.close();
});

test('Sprint 5: MFA (emulator mock): an owner enrolls optionally; a platform admin is gated until enrolled', async ({ browser }) => {
  const demo = summary();
  const owner = await browser.newPage();
  await login(owner, demo.accounts.ownerA.email, demo.password);
  await nav(owner, 'Settings');
  await expect(owner.getByRole('heading', { name: /Two-step verification \(off\)/ })).toBeVisible();
  await expect(owner.getByText('Optional. Recommended for owners.')).toBeVisible();
  await owner.getByRole('button', { name: 'Set up authenticator app' }).click();
  await expect(owner.getByAltText(/QR code to add SmartAqua Pro/)).toBeVisible();
  await owner.getByLabel('Authenticator code').fill('000000');
  await owner.getByRole('button', { name: 'Verify and turn on' }).click();
  await expect(owner.getByText(/That code is not right/)).toBeVisible();
  await shot(owner, 'mfa-enroll');
  await owner.getByLabel('Authenticator code').fill('123 456');
  await owner.getByRole('button', { name: 'Verify and turn on' }).click();
  await expect(owner.getByRole('heading', { name: /Two-step verification \(on\)/ })).toBeVisible();
  await expect(owner.getByText('If you lose your phone')).toBeVisible();
  await owner.close();

  // Logged in by hand (not the helper) to see the gate before enrolling.
  const admin = await browser.newPage();
  await admin.goto('/');
  await admin.getByRole('button', { name: 'Login', exact: true }).click();
  await admin.getByPlaceholder('you@example.com').fill(demo.accounts.admin.email);
  await admin.getByPlaceholder('Enter your password').fill(demo.password);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  const gate = admin.getByText('Platform administrators must turn on two-step verification');
  await expect(gate).toBeVisible();
  await nav(admin, 'Organizations');
  await expect(gate).toBeVisible();
  await shot(admin, 'mfa-admin-gate');
  await enrollMockTotp(admin, { gated: true });
  await expect(gate).toBeHidden();
  await expect(admin.getByRole('heading', { name: /Organizations/ }).first()).toBeVisible();
  await admin.close();
});

test('Sprint 5: a tank with no saved schedule shows "No schedule set" and no default times', async ({ page }) => {
  const demo = summary();
  await login(page, demo.accounts.ownerA.email, demo.password);
  await nav(page, 'Monitoring');
  await page.getByRole('button', { name: /Front Counter Tank/ }).click();
  await expect(page.getByRole('heading', { name: 'Automation', exact: true })).toBeVisible();
  await expect(page.getByText('No schedule set', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing runs automatically. Use Edit to set feeding, light and filter times.')).toBeVisible();
  // The rows that used to show the built-in default times are gone.
  await expect(page.getByText('Light On', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Schedule time zone', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Enable Automation|Disable Automation/ })).toHaveCount(0);
  await shot(page, 'monitoring-no-schedule');
});
