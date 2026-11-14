import { ChevronDown } from 'lucide-react';
import Badge from '../ui/Badge';
import type { InventoryRow, inventorySensorStatuses, inventoryStatus } from '../../utils/deviceInventory';

type SensorRow = ReturnType<typeof inventorySensorStatuses>[number];
export function InventoryDeviceCard({ row, index, status, sensors, updatedAt, error }: {
  row: InventoryRow; index: number; status: ReturnType<typeof inventoryStatus>;
  sensors: SensorRow[]; updatedAt?: number; error?: string;
}) {
  const headingId = `device-heading-${row.id}`;
  return <article aria-labelledby={headingId} className="rounded-xl border border-slate-600/35 bg-slate-900/25 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-xs text-slate-400"><span aria-label={`Device index ${index}`}>#{index}</span> · {row.id}</p>
        <h4 id={headingId} className="break-words text-base font-semibold text-white">{row.aquariumName || (row.registration === 'claimed' ? 'Aquarium record unavailable' : 'Unassigned device')}</h4>
        <p className="text-sm text-slate-300">Owner: {row.ownerName}</p>
      </div>
      <div className="space-y-1 text-right">
        <Badge variant={status === 'Online' ? 'success' : status === 'Offline' ? 'warning' : 'default'}>{status}</Badge>
        <p className="text-xs text-slate-400">Last heartbeat: {updatedAt
          ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Manila' }).format(updatedAt)
          : 'Not received'}</p>
        {updatedAt && <p className="text-xs text-slate-400">UTC+8</p>}
      </div>
    </div>
    {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <h5 className="text-sm font-medium text-slate-200">Sensor status</h5>
      <p className="text-xs text-slate-400">{row.sensors
        ? `${row.sensors.reduce((sum, sensor) => sum + sensor.count, 0)} configured sensors`
        : 'Physical count not recorded'}</p>
    </div>
    {sensors.length ? <ul aria-label={`${row.id}: sensor statuses`} className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {sensors.map(sensor => <li key={sensor.type} className="rounded-lg border border-slate-600/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-white">{sensor.label}{sensor.count ? ` × ${sensor.count}` : ''}</span>
          <span title={sensor.reason}><Badge variant={sensor.status === 'Reporting' ? 'success' : sensor.status === 'Fault' ? 'danger' : 'default'}>{sensor.status}</Badge></span>
        </div>
        <p className="mt-1 text-xs text-slate-400">{sensor.reason}</p>
        {sensor.count !== null && sensor.count > 1 && <p className="mt-1 text-xs text-amber-200">Shared channel only; individual probe status unknown.</p>}
        {sensor.count === null && <p className="mt-1 text-xs text-slate-400">Reported type; installed quantity not recorded.</p>}
      </li>)}
    </ul> : <p className="mt-2 text-sm text-slate-400">No sensor inventory or sensor types reported.</p>}
    <details className="group mt-4 border-t border-slate-600/30 pt-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 text-sm font-medium text-teal-200 focus-visible:outline-2 focus-visible:outline-teal-300">
        Device details <span className="sr-only">for {row.id}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-400">Owner account</dt><dd className="mt-1 break-all text-slate-200">{row.ownerEmail || row.ownerId || 'Not assigned'}</dd></div>
        <div><dt className="text-xs text-slate-400">Registration</dt><dd className="mt-1 capitalize text-slate-200">{row.registration}</dd></div>
        <div><dt className="text-xs text-slate-400">Equipment (not sensors)</dt><dd className="mt-1 text-slate-200">{row.equipment ? row.equipment.join(', ') || 'None confirmed' : 'Not recorded'}</dd></div>
        <div><dt className="text-xs text-slate-400">Inventory source</dt><dd className="mt-1 text-slate-200">{row.sensorSource === 'owner-confirmed' ? 'Owner-confirmed installation' : row.sensorSource === 'registry' ? 'Registry inventory' : 'Reported types only; quantities unverified'}</dd></div>
        {row.registration === 'claimed' && <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Aquarium ID</dt><dd className="mt-1 break-all text-slate-200">{row.aquariumId}</dd></div>}
      </dl>
    </details>
  </article>;
}
