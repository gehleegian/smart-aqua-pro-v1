import { getAllAquariums, getAquariumsByOwner } from './aquariumService';
import { getAllUsers, getCurrentUserProfile } from './userService';
import type { DashboardData } from '../types/dashboard';
import { mapDashboardAquariums } from '../utils/dashboardHelpers';

export async function getDashboardData(userId: string): Promise<DashboardData | null> {
  const userProfile = await getCurrentUserProfile(userId);

  if (!userProfile) {
    return null;
  }

  if (userProfile.role === 'Admin') {
    const [aquariums, users] = await Promise.all([getAllAquariums(), getAllUsers()]);

    return {
      userProfile,
      aquariums: mapDashboardAquariums(aquariums),
      users,
    };
  }

  const aquariums = await getAquariumsByOwner(userId);

  return {
    userProfile,
    aquariums: mapDashboardAquariums(aquariums),
    users: [],
  };
}
