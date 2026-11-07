import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { SMOKE_PROJECT } from '../../playwright.config';

export type DemoSummary = {
  projectId: string;
  password: string;
  accounts: Record<'ownerA' | 'caretakerX' | 'ownerB' | 'admin', { email: string; name: string; uid: string }>;
  orgs: { davaoPetShop: string; ownerB: string };
  tanks: { tank1: string; tank2: string; tankB: string };
  spareDevices: Array<{ deviceId: string; claimCode: string; uri: string }>;
};

export function summary(): DemoSummary {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'provisioning-output', SMOKE_PROJECT, 'demo-accounts.json'), 'utf8'));
}

export const PASSWORD = 'SmartAqua-Smoke-2026!';

/** Key screens for the docs (docs/screens/, gitignored except the curated doc-*.png). */
export async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join('docs/screens', `${name}.png`), fullPage: true });
}

export async function openLogin(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

export async function login(page: Page, email: string, password: string) {
  await openLogin(page);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Log out' }).first()).toBeVisible();
  // Sprint 5: the smoke stack runs the emulator TOTP mock (--mfa-mock), so a
  // platform admin is gated until they enroll. Enroll with the mock code.
  const gate = page.getByText('Platform administrators must turn on two-step verification');
  if (await gate.isVisible()) {
    await enrollMockTotp(page, { gated: true });
    await expect(gate).toBeHidden();
  }
}

export const MOCK_TOTP_CODE = '123456';

export async function enrollMockTotp(page: Page, options: { gated?: boolean } = {}) {
  await page.getByRole('button', { name: 'Set up authenticator app' }).click();
  await expect(page.getByAltText(/QR code to add SmartAqua Pro/)).toBeVisible();
  await page.getByLabel('Authenticator code').fill(MOCK_TOTP_CODE);
  await page.getByRole('button', { name: 'Verify and turn on' }).click();
  // Behind the admin gate the card disappears as soon as the factor exists.
  if (!options.gated) await expect(page.getByRole('heading', { name: /Two-step verification \(on\)/ })).toBeVisible();
}

export async function nav(page: Page, label: string) {
  await page.locator('aside').getByRole('button', { name: label, exact: true }).click();
}

/** Signs up through the UI, then applies the emulator's verification link (stands in for the email). */
export async function signUpAndVerify(page: Page, name: string, email: string) {
  await openLogin(page);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.locator('#signup-name').fill(name);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Account created/).first()).toBeVisible();
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  const codes = await (await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${SMOKE_PROJECT}/oobCodes`)).json() as { oobCodes: Array<{ email: string; requestType: string; oobLink: string }> };
  const link = codes.oobCodes.filter((code) => code.email === email && code.requestType === 'VERIFY_EMAIL').at(-1);
  expect(link, 'verification email was sent').toBeTruthy();
  await fetch(link!.oobLink.replace('http://localhost', 'http://127.0.0.1'));
}
