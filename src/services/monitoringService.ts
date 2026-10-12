import { getAquariumsByOwner } from './aquariumService';
import { getCurrentUserProfile } from './userService';
import type { MonitoringData } from '../types/monitoring';
import { mapMonitoringAquariums } from '../utils/monitoringHelpers';

export async function getMonitoringData(userId: string): Promise<MonitoringData | null> {
  const userProfile = await getCurrentUserProfile(userId);

  if (!userProfile) {
    return null;
  }

  if (userProfile.role === 'Admin') {
    return {
      userProfile,
      aquariums: [],
      users: [],
    };
  }

  const aquariums = await getAquariumsByOwner(userId);

  return {
    userProfile,
    aquariums: mapMonitoringAquariums(aquariums),
    users: [],
  };
}
