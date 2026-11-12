import { useEffect, useState } from 'react';
import { CalendarClock, Fish, Settings, Sun, Wind } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import { auth } from '../firebase';
import { getAquariumsByOwner } from '../services/aquariumService';
import { requestTankFocus } from '../services/tankFocus';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import StatusMessage from '../components/ui/StatusMessage';
import { getAutomationSettings } from '../utils/monitoringHelpers';
import { nextScheduledText, SCHEDULE_TIME_ZONE } from '../utils/schedule';
import type { Aquarium } from '../types/aquarium';

/**
 * FR18 (Sprint 4): every tank's saved schedule, replacing the old sample
 * page. Owners edit a schedule in Monitoring (the existing editor, which
 * writes the device's control profile). The device runs the schedule itself.
 */
export default function Automation({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const now = useNow();
  const [aquariums, setAquariums] = useState<Aquarium[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    getAquariumsByOwner(uid)
      .then((items) => { if (!cancelled) setAquariums(items); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Schedules could not be loaded.'); });
    return () => { cancelled = true; };
  }, []);

  const edit = (aquariumId: string) => {
    requestTankFocus(aquariumId);
    onNavigate?.('monitoring');
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        All schedule times use {SCHEDULE_TIME_ZONE} (UTC+8).
      </p>
      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {aquariums === null && !error ? <p className="text-sm text-slate-400">Loading schedules…</p> : null}
        {aquariums?.length === 0 ? <p className="text-sm text-slate-400">No aquariums yet.</p> : null}
        {aquariums?.map((aquarium) => {
          const saved = Boolean(aquarium.automationSettings);
          const settings = getAutomationSettings(aquarium);
          const next = saved && settings.enabled ? nextScheduledText(settings, now) : '';
          return (
            <Card key={aquarium.id}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                  <CalendarClock className="h-5 w-5 text-teal-200" aria-hidden="true" /> {aquarium.name}
                </h3>
                <Badge variant={!saved ? 'default' : settings.enabled ? 'success' : 'warning'}>
                  {!saved ? 'No schedule saved' : settings.enabled ? 'Automation on' : 'Automation off'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {saved ? (
                  <dl className="grid gap-2 sm:grid-cols-3">
                    <div><dt className="flex items-center gap-1 text-xs text-slate-400"><Fish className="h-3.5 w-3.5" aria-hidden="true" /> Feeding</dt><dd className="text-white">{settings.feedingTimes.join(', ')}</dd></div>
                    <div><dt className="flex items-center gap-1 text-xs text-slate-400"><Sun className="h-3.5 w-3.5" aria-hidden="true" /> Light</dt><dd className="text-white">{settings.lightOnTime && settings.lightOffTime ? `${settings.lightOnTime}–${settings.lightOffTime}` : 'Not set'}</dd></div>
                    <div><dt className="flex items-center gap-1 text-xs text-slate-400"><Wind className="h-3.5 w-3.5" aria-hidden="true" /> Filter</dt><dd className="text-white">{settings.filtrationStartTime} for {settings.filtrationRuntimeHours} h</dd></div>
                  </dl>
                ) : <p className="text-slate-400">This tank has no saved schedule yet.</p>}
                {next ? <p className="text-teal-100">{next}</p> : null}
                <Button size="sm" variant="secondary" onClick={() => edit(aquarium.id)}>
                  <Settings className="h-4 w-4" aria-hidden="true" /> {saved ? 'Edit schedule' : 'Set up schedule'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
