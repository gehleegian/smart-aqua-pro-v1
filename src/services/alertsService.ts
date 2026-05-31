import { getAllAquariums, getAquariumsByOwner } from './aquariumService';
import { getCurrentUserProfile } from './userService';
import type { AlertsPageData } from '../types/alerts';

export async function getAlertsPageData(userId: string): Promise<AlertsPageData | null> {
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
