import { getAllAquariums, getAquariumsByOwner } from './aquariumService';
import { getCurrentUserProfile } from './userService';
import type { Aquarium } from '../types/aquarium';
import type { UserData } from '../types/user';

export type HeaderData = {
  userProfile: UserData;
  aquariums: Aquarium[];
};

export async function getHeaderData(userId: string): Promise<HeaderData | null> {
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
