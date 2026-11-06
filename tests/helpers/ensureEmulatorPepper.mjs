// Emulator only: the Functions emulator reads secrets from functions/.secret.local
// (gitignored). Create it with a random throwaway pepper if it is missing, so
// the e2e test and provision-device agree. Never used for a real project.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'functions/.secret.local';
const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
if (!/^CLAIM_CODE_PEPPER=.+/m.test(current)) {
  writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}CLAIM_CODE_PEPPER=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  console.log('Created an emulator-only CLAIM_CODE_PEPPER in functions/.secret.local (gitignored).');
}
