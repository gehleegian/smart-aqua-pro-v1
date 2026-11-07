import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FlaskConical, Plus, Save } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StatusMessage from '../components/ui/StatusMessage';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import {
  COMPARE_OPS_LIST,
  evaluateAquarium,
  isCitedSource,
  normalizeRuleConfig,
  normalizeSpeciesConfig,
  resolveThresholds,
  RULE_PARAMETERS,
  ruleMatrixMarkdown,
  validateRuleDraft,
  validateSpeciesDraft,
  type RuleConfig,
} from '../utils/monitoringAssessmentCore';
import { approveRuleConfig, editableContent, loadRawRuleConfig, saveRuleConfig, type RawConfigDoc } from '../services/ruleAdminService';

type Kind = 'rule' | 'species';
type Selection = { kind: Kind; id: string; isNew: boolean } | null;

const NEW_RULE: Record<string, unknown> = {
  parameter: 'temperatureC', severity: 'warning', condition: { op: 'gt', ref: 'max' }, priority: 100,
  title: '', action: '', basis: '', preCheck: '', source: 'TBD', enabled: true,
};

const SAMPLE_DEFAULT = {
  temperatureC: '25', ph: '7.2', tdsPpm: '300', turbidity: '3', waterLevelPercent: '85', filterState: 'Active', powerStatus: 'Online', equipmentStatus: 'Normal',
};

function num(value: string) {
  return value.trim() === '' ? undefined : Number(value);
}

/**
 * FR13 admin side (Sprint 4): platform admin lists, creates and edits the
 * IF-THEN rules and species defaults (draft → approved), previews which rules
 * a sample reading would match, and exports the sign-off matrix. Saving goes
 * through the audited callables; the engine picks changes up within 5 minutes.
 */
export default function RulesEditor() {
  const [docs, setDocs] = useState<{ rules: RawConfigDoc[]; species: RawConfigDoc[] } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [newId, setNewId] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [sample, setSample] = useState(SAMPLE_DEFAULT);
  const [sampleSpecies, setSampleSpecies] = useState('goldfish');

  const reload = useCallback(async () => {
    try {
      setDocs(await loadRawRuleConfig());
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Rules could not be loaded.' });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const stored = selection && !selection.isNew
    ? (selection.kind === 'rule' ? docs?.rules : docs?.species)?.find((item) => item.id === selection.id) ?? null
    : null;
  const id = selection?.isNew ? newId.trim() : selection?.id ?? '';
  const validation = selection ? (selection.kind === 'rule' ? validateRuleDraft(id, draft) : validateSpeciesDraft(id, draft)) : null;

  const select = (kind: Kind, item: RawConfigDoc) => {
    setSelection({ kind, id: item.id, isNew: false });
    setDraft(editableContent(item.data));
    setMessage(null);
  };

  const set = (path: string[], value: unknown) => {
    setDraft((previous) => {
      const next = structuredClone(previous) as Record<string, unknown>;
      let cursor = next;
      for (const key of path.slice(0, -1)) {
        cursor[key] = typeof cursor[key] === 'object' && cursor[key] !== null ? cursor[key] : {};
        cursor = cursor[key] as Record<string, unknown>;
      }
      if (value === undefined) delete cursor[path[path.length - 1]];
      else cursor[path[path.length - 1]] = value;
      return next;
    });
  };

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try {
      const text = await action();
      setMessage({ kind: 'success', text });
      await reload();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message.replace(/^.*?: /, '') : 'That did not work.' });
    } finally {
      setBusy('');
    }
  };

  // The engine's view of everything, with the current draft applied (for the preview).
  const effective = useMemo(() => {
    const rules = (docs?.rules ?? []).flatMap((item) => {
      const data = selection?.kind === 'rule' && item.id === selection.id ? { ...item.data, ...draft } : item.data;
      const rule = normalizeRuleConfig(item.id, data);
      return rule ? [rule] : [];
    });
    if (selection?.kind === 'rule' && selection.isNew && validation?.ok) {
      const rule = normalizeRuleConfig(id || 'new_rule', draft);
      if (rule) rules.push(rule);
    }
    const species = (docs?.species ?? []).flatMap((item) => {
      const data = selection?.kind === 'species' && item.id === selection.id ? { ...item.data, ...draft } : item.data;
      const config = normalizeSpeciesConfig(item.id, data);
      return config ? [config] : [];
    });
    return { rules, species };
  }, [docs, draft, selection, validation?.ok, id]);

  const preview = useMemo(() => {
    const species = effective.species.find((item) => item.speciesId === sampleSpecies) ?? null;
    const reading = {
      temperatureC: num(sample.temperatureC), temperatureReadingValid: true, ph: num(sample.ph), phReadingValid: true,
      tdsPpm: num(sample.tdsPpm), tdsReadingValid: true, turbidity: num(sample.turbidity), turbidityReadingValid: true,
      waterLevelPercent: num(sample.waterLevelPercent), waterPresent: true, filterState: sample.filterState,
      powerStatus: sample.powerStatus, equipmentStatus: sample.equipmentStatus, online: true, updatedAt: Date.UTC(2026, 0, 1),
    };
    return evaluateAquarium(reading, resolveThresholds(species), effective.rules, { hasFiltrationSystem: true });
  }, [effective, sample, sampleSpecies]);

  const exportMatrix = () => {
    const markdown = ruleMatrixMarkdown(effective.species, effective.rules as RuleConfig[], new Date().toISOString().slice(0, 10));
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rule-matrix-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const condition = (draft.condition ?? {}) as Record<string, unknown>;
  const ranges = (draft.ranges ?? {}) as Record<string, Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <StatusMessage variant="warning">
        Saved changes reach the rules engine within 5 minutes (the functions cache the configuration). Editing an approved item returns it to draft.
        Approving needs a citation in Source.
      </StatusMessage>
      {message ? <StatusMessage variant={message.kind}>{message.text}</StatusMessage> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-white">Rules and species</h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setSelection({ kind: 'rule', id: '', isNew: true }); setNewId(''); setDraft({ ...NEW_RULE }); setMessage(null); }}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New rule
              </Button>
              <Button size="sm" variant="secondary" onClick={exportMatrix} disabled={!docs}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-4 overflow-y-auto">
            {!docs ? <p className="text-sm text-slate-400">Loading…</p> : null}
            {(['species', 'rule'] as const).map((kind) => (
              <div key={kind}>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{kind === 'rule' ? `Rules (${docs?.rules.length ?? 0})` : 'Species defaults'}</p>
                <ul className="space-y-1">
                  {(kind === 'rule' ? docs?.rules : docs?.species)?.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => select(kind, item)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${selection?.id === item.id && selection.kind === kind ? 'border-teal-300/50 bg-teal-500/10' : 'border-slate-600/30 bg-slate-900/30 hover:bg-slate-800/40'}`}>
                        <span className="min-w-0">
                          <span className="block truncate text-white">{String(item.data.title ?? item.data.name ?? item.id)}</span>
                          <span className="block truncate font-mono text-xs text-slate-400">{item.id}{kind === 'rule' ? ` · ${String(item.data.parameter)} · ${String(item.data.severity)}` : ''}</span>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {item.data.enabled === false ? <Badge>off</Badge> : null}
                          <Badge variant={item.data.status === 'approved' ? 'success' : 'info'}>{String(item.data.status ?? 'draft')}</Badge>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">
                {!selection ? 'Select a rule or species' : selection.isNew ? 'New rule' : `${selection.kind === 'rule' ? 'Rule' : 'Species'} ${selection.id}`}
              </h3>
              {stored ? (
                <span className="text-xs text-slate-400">
                  {stored.data.status === 'approved' ? `Approved by ${String(stored.data.approvedBy)} on ${new Date(Number(stored.data.approvedAt)).toLocaleDateString()}` : 'Draft'}
                </span>
              ) : null}
            </CardHeader>
            {selection ? (
              <CardContent className="space-y-4">
                {selection.isNew ? <Input label="Rule ID (lower-case, digits, _)" value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="e.g. temp_high_warning_night" /> : null}
                {selection.kind === 'rule' ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1 text-sm"><span className="block text-slate-200">Parameter</span>
                        <select value={String(draft.parameter ?? '')} onChange={(event) => set(['parameter'], event.target.value)} className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-3 py-2 text-slate-100">
                          {RULE_PARAMETERS.map((parameter) => <option key={parameter} value={parameter} className="bg-slate-900">{parameter}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm"><span className="block text-slate-200">Severity</span>
                        <select value={String(draft.severity ?? '')} onChange={(event) => set(['severity'], event.target.value)} className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-3 py-2 text-slate-100">
                          <option value="warning" className="bg-slate-900">WARNING</option>
                          <option value="critical" className="bg-slate-900">CRITICAL</option>
                        </select>
                      </label>
                      <Input label="Priority (lower first)" type="number" value={String(draft.priority ?? '')} onChange={(event) => set(['priority'], event.target.value === '' ? undefined : Number(event.target.value))} />
                    </div>
                    <fieldset className="grid gap-3 rounded-lg border border-slate-600/30 p-3 sm:grid-cols-4">
                      <legend className="px-1 text-sm text-slate-200">IF {String(draft.parameter ?? '')}</legend>
                      <label className="space-y-1 text-sm"><span className="block text-slate-400">is</span>
                        <select value={String(condition.op ?? '')} onChange={(event) => set(['condition', 'op'], event.target.value)} className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-3 py-2 text-slate-100">
                          {COMPARE_OPS_LIST.map((op) => <option key={op} value={op} className="bg-slate-900">{op}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm"><span className="block text-slate-400">than threshold</span>
                        <select value={condition.ref ? String(condition.ref) : 'value'} onChange={(event) => {
                          if (event.target.value === 'value') { set(['condition', 'ref'], undefined); set(['condition', 'value'], ''); }
                          else { set(['condition', 'value'], undefined); set(['condition', 'ref'], event.target.value); }
                        }} className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-3 py-2 text-slate-100">
                          <option value="max" className="bg-slate-900">max</option>
                          <option value="min" className="bg-slate-900">min</option>
                          <option value="value" className="bg-slate-900">a value</option>
                        </select>
                      </label>
                      {condition.ref ? (
                        <Input label="margin %" type="number" value={condition.marginPct === undefined ? '' : String(condition.marginPct)} onChange={(event) => set(['condition', 'marginPct'], event.target.value === '' ? undefined : Number(event.target.value))} />
                      ) : (
                        <Input label="value" value={condition.value === undefined ? '' : String(condition.value)} onChange={(event) => {
                          const raw = event.target.value;
                          set(['condition', 'value'], raw === 'true' ? true : raw === 'false' ? false : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw);
                        }} />
                      )}
                      <label className="flex items-end gap-2 pb-2 text-sm text-slate-200">
                        <input type="checkbox" className="accent-teal-500" checked={draft.enabled !== false} onChange={(event) => set(['enabled'], event.target.checked)} /> Enabled
                      </label>
                    </fieldset>
                    <Input label="Title" value={String(draft.title ?? '')} onChange={(event) => set(['title'], event.target.value)} />
                    {(['action', 'basis', 'preCheck'] as const).map((field) => (
                      <label key={field} className="block space-y-1 text-sm">
                        <span className="block text-slate-200">{field === 'action' ? 'THEN recommended action' : field === 'basis' ? 'Why (basis)' : 'Check first'}</span>
                        <textarea rows={field === 'action' ? 3 : 2} value={String(draft[field] ?? '')} onChange={(event) => set([field], event.target.value)}
                          className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-3 py-2 text-slate-100" />
                      </label>
                    ))}
                  </>
                ) : (
                  <>
                    <Input label="Name" value={String(draft.name ?? '')} onChange={(event) => set(['name'], event.target.value)} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(['temperatureC', 'ph', 'tdsPpm', 'turbidity'] as const).map((key) => (
                        <div key={key} className="grid grid-cols-2 gap-2">
                          <Input label={`${key} min`} type="number" value={ranges[key]?.min === undefined ? '' : String(ranges[key]?.min)} onChange={(event) => set(['ranges', key, 'min'], num(event.target.value))} />
                          <Input label={`${key} max`} type="number" value={ranges[key]?.max === undefined ? '' : String(ranges[key]?.max)} onChange={(event) => set(['ranges', key, 'max'], num(event.target.value))} />
                        </div>
                      ))}
                      <Input label="Minimum water level (%)" type="number" value={draft.minWaterLevelPercent === undefined ? '' : String(draft.minWaterLevelPercent)} onChange={(event) => set(['minWaterLevelPercent'], num(event.target.value))} />
                    </div>
                    <p className="text-xs text-slate-400">Bioload bands, cleaning intervals and early-cleaning triggers are kept as stored (docs/bioload.md).</p>
                  </>
                )}
                <Input label="Source (citation; required to approve)" value={String(draft.source ?? '')} onChange={(event) => set(['source'], event.target.value)} />
                {validation && !validation.ok ? (
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-200">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy !== '' || !validation?.ok} onClick={() => void run('save', async () => {
                    const result = await saveRuleConfig(selection.kind, id, draft);
                    if (selection.isNew) setSelection({ kind: selection.kind, id, isNew: false });
                    return result.changed ? 'Saved as draft. The engine uses it within 5 minutes.' : 'No changes to save.';
                  })}>
                    <Save className="h-4 w-4" aria-hidden="true" /> {busy === 'save' ? 'Saving…' : 'Save draft'}
                  </Button>
                  {!selection.isNew ? (
                    <Button variant="secondary" disabled={busy !== '' || stored?.data.status === 'approved' || !isCitedSource(stored?.data.source)}
                      title={!isCitedSource(stored?.data.source) ? 'Save a citation in Source first.' : undefined}
                      onClick={() => void run('approve', async () => { await approveRuleConfig(selection.kind, selection.id); return 'Approved. The engine uses it within 5 minutes.'; })}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            ) : (
              <CardContent><p className="text-sm text-slate-400">Pick an item on the left, or create a new rule.</p></CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><FlaskConical className="h-5 w-5 text-teal-300" aria-hidden="true" /> Preview</h3>
              <p className="text-xs text-slate-400">Which rules a sample reading would match, using the stored configuration with your unsaved edit applied. Nothing is saved.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm"><span className="block text-slate-200">Species</span>
                  <select value={sampleSpecies} onChange={(event) => setSampleSpecies(event.target.value)} className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-3 py-2 text-slate-100">
                    {effective.species.map((item) => <option key={item.speciesId} value={item.speciesId} className="bg-slate-900">{item.name}</option>)}
                  </select>
                </label>
                {(['temperatureC', 'ph', 'tdsPpm', 'turbidity', 'waterLevelPercent'] as const).map((key) => (
                  <Input key={key} label={key} type="number" value={sample[key]} onChange={(event) => setSample({ ...sample, [key]: event.target.value })} />
                ))}
                <label className="space-y-1 text-sm"><span className="block text-slate-200">filterState</span>
                  <select value={sample.filterState} onChange={(event) => setSample({ ...sample, filterState: event.target.value })} className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-3 py-2 text-slate-100">
                    <option value="Active" className="bg-slate-900">Active</option>
                    <option value="Inactive" className="bg-slate-900">Inactive</option>
                  </select>
                </label>
              </div>
              <p className="text-sm text-slate-300">Overall: <strong className="text-white">{preview.overall.toUpperCase()}</strong></p>
              {preview.matchedRules.length === 0 ? <p className="text-sm text-slate-400">No rule matches this reading.</p> : (
                <ul className="space-y-2">
                  {preview.matchedRules.map((rule) => (
                    <li key={rule.ruleId} className={`rounded-lg border p-3 text-sm ${rule.ruleId === id ? 'border-teal-300/50 bg-teal-500/10' : 'border-slate-600/30 bg-slate-900/30'}`}>
                      <p className="flex flex-wrap items-center gap-2 font-medium text-white">
                        {rule.title} <Badge variant={rule.severity === 'critical' ? 'danger' : 'warning'}>{rule.severity}</Badge>
                        <span className="font-mono text-xs text-slate-400">{rule.ruleId}</span>
                      </p>
                      <p className="text-slate-300">{rule.issueDetected}</p>
                    </li>
                  ))}
                </ul>
              )}
              {preview.missingRules.length > 0 ? <p className="text-xs text-amber-200">No rule configured for: {preview.missingRules.join(', ')}.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
