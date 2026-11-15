import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import StatusMessage from '../ui/StatusMessage';
import { useNow } from '../../hooks/useNow';
import { subscribeToDeviceInventory, type DeviceInventorySnapshot } from '../../services/deviceInventoryService';
import { inventoryCounts } from '../../utils/deviceInventory';

/** Live fleet totals for the admin dashboard; same data and status rules as Device Inventory. */
export function AdminDeviceStatusCards({ data, now, onOpenInventory }: {
  data: DeviceInventorySnapshot; now: number; onOpenInventory: () => void;
}) {
  const clock = Math.max(now, data.observedAt) + data.clockOffset;
  const counts = inventoryCounts(data.rows, data.telemetry, data.connected, clock, data.errors);
  const cards: [string, number][] = [
    ['Registered devices', counts.registered], ['Online', counts.online],
    ['Offline', counts.offline], ['Not reporting / unavailable', counts.notReporting],
  ];
  return <Card>
    <CardHeader className="flex items-center justify-between gap-4">
      <h3 className="flex items-center gap-2 text-base font-semibold text-white"><Cpu className="h-4 w-4 text-teal-300" aria-hidden="true" /> Device Status</h3>
      <button type="button" onClick={onOpenInventory} className="rounded text-sm font-medium text-teal-200 transition-colors hover:text-teal-100">View inventory</button>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, count]) => <div key={label} className="rounded-lg border border-slate-600/30 bg-slate-900/25 p-3">
          <p className="text-xs text-slate-300">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{count}</p>
        </div>)}
      </div>
      {!data.connected && <p role="status" className="mt-3 text-xs text-amber-200">Connecting to live status. Device connectivity cannot be confirmed until the connection is restored.</p>}
      <p className="mt-3 text-xs text-slate-400">{counts.assigned} assigned to aquariums. Online means a heartbeat within the last 60 seconds; Offline does not prove power loss.</p>
    </CardContent>
  </Card>;
}

export function AdminDeviceStatusSummary({ onOpenInventory }: { onOpenInventory: () => void }) {
  const [data, setData] = useState<DeviceInventorySnapshot | null>(null);
  const [error, setError] = useState('');
  const now = useNow(5000);
  useEffect(() => subscribeToDeviceInventory(snapshot => { setData(snapshot); setError(''); },
    err => { setData(null); setError(err.message); }), []);
  if (error) return <StatusMessage variant="error">Device status is unavailable: {error}</StatusMessage>;
  if (!data) return <p role="status" className="text-sm text-slate-300">Loading device status...</p>;
  return <AdminDeviceStatusCards data={data} now={now} onOpenInventory={onOpenInventory} />;
}
