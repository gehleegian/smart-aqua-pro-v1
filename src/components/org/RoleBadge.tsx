import Badge from '../ui/Badge';
import { useOrg } from '../../hooks/useOrg';

export function useRoleLabel(platformRole: string) {
  const { role } = useOrg();
  if (platformRole === 'Admin') return 'Platform admin';
  if (role === 'owner') return 'Owner';
  if (role === 'caretaker') return 'Caretaker';
  return 'No organization yet';
}

export default function RoleBadge({ platformRole }: { platformRole: string }) {
  const label = useRoleLabel(platformRole);
  const variant = label === 'Owner' ? 'info' : label === 'Caretaker' ? 'success' : label === 'Platform admin' ? 'warning' : 'default';
  return <Badge variant={variant}>{label}</Badge>;
}
