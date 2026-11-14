import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { HardwareInventory, HardwareSetupState } from '../utils/hardwareInventory';

export async function readHardwareSetup(aquariumId: string): Promise<HardwareSetupState> {
  const result = await httpsCallable<unknown, HardwareSetupState>(functions, 'deviceHardwareSetup')({ aquariumId, mode: 'read' });
  return result.data;
}
export async function confirmHardwareSetup(aquariumId: string, inventory: HardwareInventory): Promise<void> {
  await httpsCallable(functions, 'deviceHardwareSetup')({ aquariumId, mode: 'confirm', inventory, confirmed: true });
}
