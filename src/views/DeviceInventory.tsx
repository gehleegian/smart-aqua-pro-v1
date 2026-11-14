import { useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { InventoryDeviceCard } from '../components/admin/InventoryDeviceCard';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import StatusMessage from '../components/ui/StatusMessage';
import { useClientPagination } from '../hooks/useClientPagination';
import { useNow } from '../hooks/useNow';
import { subscribeToDeviceInventory, type DeviceInventorySnapshot } from '../services/deviceInventoryService';
import { inventorySensorStatuses, inventoryStatus } from '../utils/deviceInventory';

const statusOptions = ['All statuses', 'Online', 'Offline', 'Not reporting', 'Unavailable', 'Unassigned'];

export function DeviceInventoryTable({ data, now }: { data: DeviceInventorySnapshot; now: number }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [sensorFilter, setSensorFilter] = useState('All sensors');
  const rows = data.rows.map(row => ({ ...row,
    liveStatus: inventoryStatus(row, data.telemetry[row.aquariumId], data.connected, now + data.clockOffset, data.errors[row.aquariumId]),
    sensorStatuses: inventorySensorStatuses(row, data.telemetry[row.aquariumId], data.connected, now + data.clockOffset, data.errors[row.aquariumId]),
  }));
  const query = search.trim().toLowerCase();
  const filtered = rows.filter(row => (statusFilter === 'All statuses' || row.liveStatus === statusFilter) &&
    (sensorFilter === 'All sensors' || row.sensorStatuses.some(sensor => sensor.status === (sensorFilter === 'Sensor faults' ? 'Fault' : 'Unknown'))) &&
    [row.id, row.ownerName, row.ownerEmail, row.aquariumName, row.aquariumId].some(value => value.toLowerCase().includes(query)));
  const page = useClientPagination(filtered, JSON.stringify([query, statusFilter, sensorFilter]));
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Registered devices', rows.length], ['Assigned devices', rows.filter(row => row.registration === 'claimed').length],
        ['Online', rows.filter(row => row.liveStatus === 'Online').length], ['Offline', rows.filter(row => row.liveStatus === 'Offline').length],
      ].map(([label, count]) => <Card key={label}><CardContent><p className="text-sm text-slate-300">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-white">{count}</p></CardContent></Card>)}
    </div>
    {!data.connected && <StatusMessage variant="warning">Connecting to live status. Device connectivity is unavailable until the connection is restored.</StatusMessage>}
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><Cpu className="h-5 w-5 text-teal-300" aria-hidden="true" /> Device inventory</h3>
        <p className="mt-2 text-sm text-slate-300">Track device connections and sensor reporting without viewing readings or controlling equipment.</p>
        <p className="mt-2 text-xs text-slate-400">Reporting = fresh, valid sensor diagnostic. Fault = explicitly invalid sample. Unknown = missing diagnostic, stale data or lost connection. These are not electrical On/Off states or accuracy checks.</p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="flex-1 text-sm text-slate-300">Search devices or owners
            <input type="search" aria-label="Search devices or owners" value={search} onChange={event => setSearch(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 text-white" />
          </label>
          <label className="text-sm text-slate-300">Connection status
            <select aria-label="Connection status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}
              className="mt-1 block min-h-11 rounded-lg border border-slate-600/50 bg-slate-900 px-3 text-white">
              {statusOptions.map(status => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Sensor status
            <select aria-label="Sensor status" value={sensorFilter} onChange={event => setSensorFilter(event.target.value)}
              className="mt-1 block min-h-11 rounded-lg border border-slate-600/50 bg-slate-900 px-3 text-white">
              {['All sensors', 'Sensor faults', 'Unknown sensors'].map(status => <option key={status}>{status}</option>)}
            </select>
          </label>
          {(search || statusFilter !== 'All statuses' || sensorFilter !== 'All sensors') && <Button variant="ghost" className="self-end min-h-11"
            onClick={() => { setSearch(''); setStatusFilter('All statuses'); setSensorFilter('All sensors'); }}>Clear filters</Button>}
        </div>
        <div className="space-y-4">
          {page.items.map((row, index) => <InventoryDeviceCard key={row.id} row={row} index={page.startIndex + index + 1}
            status={row.liveStatus} sensors={row.sensorStatuses} updatedAt={data.telemetry[row.aquariumId]?.updatedAt} error={data.errors[row.aquariumId]} />)}
          {filtered.length === 0 && <p role="status" className="py-6 text-sm text-slate-300">{rows.length ? 'No devices match your filters.' : 'No devices have been registered.'}</p>}
        </div>
        <Pagination {...page} label="Device inventory" itemLabel="devices" />
        <p className="mt-4 text-xs text-slate-400">Device connections use the existing 60-second heartbeat window. An offline device does not prove power loss. Invalid sensor samples do not mean the ESP32 is offline. Expand Device details for equipment and ownership records.</p>
      </CardContent>
    </Card>
  </div>;
}

export default function DeviceInventory() {
  const [data, setData] = useState<DeviceInventorySnapshot | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const now = useNow(5000);
  useEffect(() => subscribeToDeviceInventory(snapshot => { setData(snapshot); setError(''); },
    err => { setData(null); setError(err.message); }), [attempt]);
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-white">Device Inventory</h2>
      <Button variant="secondary" onClick={() => { setData(null); setError(''); setAttempt(value => value + 1); }}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Reconnect</Button>
    </div>
    {error && <StatusMessage variant="error">{error}</StatusMessage>}
    {!data && !error && <p role="status" className="text-sm text-slate-300">Loading device inventory...</p>}
    {data && <DeviceInventoryTable data={data} now={now} />}
  </div>;
}
