import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Cloud Functions deploy only the functions/ directory, so it carries a
// checked-in copy of the shared rules core. Refresh it with:
//   cp src/utils/monitoringAssessmentCore.ts functions/src/shared/monitoringAssessmentCore.ts
test('functions copy of monitoringAssessmentCore matches the web source', () => {
  const web = readFileSync(new URL('../../src/utils/monitoringAssessmentCore.ts', import.meta.url), 'utf8');
  const fn = readFileSync(new URL('../../functions/src/shared/monitoringAssessmentCore.ts', import.meta.url), 'utf8');
  assert.equal(fn.replaceAll('\r\n', '\n'), web.replaceAll('\r\n', '\n'));
});
