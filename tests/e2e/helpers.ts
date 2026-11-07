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
