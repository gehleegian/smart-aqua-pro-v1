import { getAllAquariums, getAquariumsByOwner } from './aquariumService';
import { getCurrentUserProfile } from './userService';
import type { Aquarium } from '../types/aquarium';
import type { UserData } from '@smartaqua/shared';

export type AquariumManagementData = {
  userProfile: UserData;
  aquariums: Aquarium[];
};

export async function getAquariumManagementData(
  userId: string
): Promise<AquariumManagementData | null> {
  const userProfile = await getCurrentUserProfile(userId);

  if (!userProfile) {
    return null;
  }

  const aquariums =
    userProfile.role === 'Admin'
      ? await getAllAquariums()
      : await getAquariumsByOwner(userId);

  return {
    userProfile,
    aquariums,
  };
}
