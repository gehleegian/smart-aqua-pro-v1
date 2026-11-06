import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateDeviceId } from '../../src/services/deviceClaimContracts.ts';
import { validateDeviceId as mobileValidate } from '../../../smart-aqua-mobile/src/utils/device-claim.ts';

test('web and mobile accept and reject the same enclosure IDs', () => {
  for (const id of ['SAQ-AAAA-BBBB', ' saq-aaaa-bbbb ', '', 'SAQ-AAAA',
    'SAQ-AAAA-BBBB/child', 'SAQ-AAAA-BBBB-extra', 'SAQ-1234-5678']) {
    assert.equal(mobileValidate(id), validateDeviceId(id));
  }
});

test('both forms and request services have no claim-code field or state', async () => {
  for (const path of ['../../src/components/aquariums/AquariumFormModal.tsx',
    '../../src/services/aquariumService.ts', '../../src/hooks/useAquariumsController.ts',
    '../../../smart-aqua-mobile/src/components/aquarium-profile-modal.tsx',
    '../../../smart-aqua-mobile/src/services/firebase-service.ts']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /claimCode|private claim code/i);
  }
});
