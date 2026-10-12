import {
  getAquariumDirectoryEntries,
  getAquariumsByOwner,
} from './aquariumService';
import { getAllUsers, getCurrentUserProfile } from './userService';
import type { DashboardData } from '../types/dashboard';
import { mapDashboardAquariums } from '../utils/dashboardHelpers';

export async function getDashboardData(userId: string): Promise<DashboardData | null> {
  const userProfile = await getCurrentUserProfile(userId);

  if (!userProfile) {
    return null;
  }

  if (userProfile.role === 'Admin') {
    const [aquariumDirectory, users] = await Promise.all([
      getAquariumDirectoryEntries(),
      getAllUsers(),
    ]);

    return {
      userProfile,
      aquariums: [],
      aquariumDirectory,
      users,
    };
  }

  const aquariums = await getAquariumsByOwner(userId);

  return {
    userProfile,
    aquariums: mapDashboardAquariums(aquariums),
    aquariumDirectory: [],
    users: [],
  };
}
