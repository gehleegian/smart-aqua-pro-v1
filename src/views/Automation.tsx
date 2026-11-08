import { useEffect, useState } from 'react';
import { CalendarClock, Fish, Settings, Sun, Wind, Zap } from 'lucide-react';
import { useRuleConfig } from '../hooks/useRuleConfig';
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
  const ruleConfig = useRuleConfig();
  const rules = [...ruleConfig.rules].sort((a, b) => a.parameter.localeCompare(b.parameter) || a.priority - b.priority);
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
      <StatusMessage variant="warning">
        Times are {SCHEDULE_TIME_ZONE} (UTC+8). The device runs these schedules on its own clock and keeps them running if Wi-Fi drops;
        that behaviour needs the firmware update and hardware testing (docs/firmware-changes.md §11).
      </StatusMessage>
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

      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Rule-Based Automation
          </h3>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-slate-400">
            Live IF-THEN rules from Firestore (read-only here). Thresholds come from the species defaults plus any per-aquarium overrides.
          </p>
          {ruleConfig.error ? <p className="mb-3 text-sm text-amber-300">{ruleConfig.error}</p> : null}
          {!ruleConfig.loaded ? (
            <p className="text-sm text-slate-400">Loading rules...</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-slate-400">No rules are stored yet.</p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.ruleId} className="flex items-start justify-between gap-4 rounded-lg bg-slate-700/30 p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-600">
                      <Settings className="h-4 w-4 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-teal-200">{rule.title}</p>
                      <p className="text-xs text-slate-400">
                        IF {rule.parameter} {rule.condition.op} {rule.condition.ref ?? JSON.stringify(rule.condition.value)}
                        {rule.condition.marginPct ? ` +${rule.condition.marginPct}%` : ''}
                        {rule.extraChecks.map((check) => ` AND ${check.field} ${check.op} ${String(check.value)}`).join('')}
                        {' '}THEN {rule.severity}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">→ {rule.action}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <span className={rule.status === 'draft' ? 'text-teal-200' : 'text-emerald-300'}>{rule.status}</span>
                    <span className="text-slate-500">{rule.enabled ? 'enabled' : 'disabled'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
