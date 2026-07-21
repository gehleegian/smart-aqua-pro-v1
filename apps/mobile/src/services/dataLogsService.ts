import { getAllAquariums, getAquariumsByOwner } from './aquariumService';
import { getCurrentUserProfile } from './userService';
import type { Aquarium } from '../types/aquarium';
import type { UserData, UserRole } from '@smartaqua/shared';

export type DataLogsPageData = {
  userProfile: UserData;
  aquariums: Aquarium[];
  userRole: UserRole;
};

export async function getDataLogsPageData(userId: string): Promise<DataLogsPageData | null> {
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
    userRole: userProfile.role,
  };
}
