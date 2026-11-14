import Input from '../ui/Input';
import { SENSOR_OPTIONS, EQUIPMENT_OPTIONS, type HardwareInventory } from '../../utils/hardwareInventory';

export default function HardwareChecklist({ value, onChange, acknowledged, onAcknowledge }: {
  value: HardwareInventory; onChange: (value: HardwareInventory) => void;
  acknowledged: boolean; onAcknowledge: (value: boolean) => void;
}) {
  return <div className="space-y-5">
    <p className="text-sm text-slate-300">Select what is physically installed on this device and enter the number of probes. This records inventory only; it does not detect sensors, prove accuracy, or change monitoring rules.</p>
    <fieldset className="space-y-3"><legend className="mb-2 font-medium text-white">Installed sensors</legend>
      {SENSOR_OPTIONS.map(option => {
        const selected = value.sensors.find(sensor => sensor.type === option.type);
        return <div key={option.type} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-600/30 p-3">
          <label className="flex min-h-11 flex-1 items-center gap-3 text-sm text-slate-200">
            <input type="checkbox" checked={Boolean(selected)} onChange={event => onChange({ ...value,
              sensors: event.target.checked ? [...value.sensors, { type: option.type, count: 1 }]
                : value.sensors.filter(sensor => sensor.type !== option.type) })} />{option.label}
          </label>
          {selected && <div className="w-32"><Input label={`${option.label} quantity`} type="number" min={1} max={100} step={1}
            value={Number.isFinite(selected.count) ? selected.count : ''} onChange={event => onChange({ ...value,
              sensors: value.sensors.map(sensor => sensor.type === option.type ? { ...sensor, count: event.target.value === '' ? NaN : Number(event.target.value) } : sensor) })} /></div>}
        </div>;
      })}
    </fieldset>
    <fieldset className="space-y-2"><legend className="mb-2 font-medium text-white">Installed equipment (not sensors)</legend>
      {EQUIPMENT_OPTIONS.map(option => <label key={option.type} className="flex min-h-11 items-center gap-3 text-sm text-slate-200">
        <input type="checkbox" checked={value.equipment.includes(option.type)} onChange={event => onChange({ ...value,
          equipment: event.target.checked ? [...value.equipment, option.type] : value.equipment.filter(type => type !== option.type) })} />{option.label}
      </label>)}
    </fieldset>
    <label className="flex min-h-11 items-start gap-3 rounded-lg border border-teal-300/30 p-4 text-sm text-slate-200">
      <input type="checkbox" className="mt-1" checked={acknowledged} onChange={event => onAcknowledge(event.target.checked)} />
      I confirm this checklist matches the sensors and equipment installed on this device.
    </label>
  </div>;
}
