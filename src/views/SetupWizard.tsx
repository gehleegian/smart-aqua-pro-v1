import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StatusMessage from '../components/ui/StatusMessage';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import ThresholdReview from '../components/condition/ThresholdReview';
import { useOrg } from '../hooks/useOrg';
import { useRuleConfig } from '../hooks/useRuleConfig';
import { getAquariumById, updateAquarium } from '../services/aquariumService';
import { getSetupTarget, setSetupTarget } from '../services/orgContext';
import { computeBioload, selectSpeciesConfig } from '../utils/monitoringAssessmentCore';
import { parseFishWeights, resizeFishWeights } from '../utils/aquariumProfileCalculations';

const STEPS = ['Tank', 'Filter', 'Fish', 'Thresholds'] as const;
type StepName = typeof STEPS[number];
const BIOLOAD_LABEL: Record<string, string> = { light: 'Light', moderate: 'Moderate', heavy: 'Heavy' };
/** The working volume is flagged when it differs this much from L×W×H. */
const VOLUME_WARNING_RATIO = 0.25;

function numberOrNull(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * After a claim the aquarium is in status 'setup'. Owner-only: the rules
 * reject these writes from a caretaker. Finish sets the status to 'active'.
 * Bioload bands and thresholds come from the species doc (DRAFT, Sprint 2).
 */
export default function SetupWizard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { isOwner } = useOrg();
  const config = useRuleConfig();
  const [aquariumId] = useState(() => getSetupTarget());
  const [aquarium, setAquarium] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<StepName>('Tank');
  const [name, setName] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [workingVolume, setWorkingVolume] = useState('');
  const [volumeEdited, setVolumeEdited] = useState(false);
  const [hasFilter, setHasFilter] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterCapacity, setFilterCapacity] = useState('');
  const [speciesId, setSpeciesId] = useState('goldfish');
  const [fishCount, setFishCount] = useState('1');
  const [fishWeights, setFishWeights] = useState<string[]>(['']);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!aquariumId) return;
    getAquariumById(aquariumId)
      .then((data) => {
        if (!data) {
          setLoadError('Aquarium not found.');
          return;
        }
        setAquarium(data);
        setName(typeof data.name === 'string' ? data.name : '');
        const read = (key: string) => (typeof data[key] === 'number' ? String(data[key]) : '');
        setLength(read('tankLengthCm'));
        setWidth(read('tankWidthCm'));
        setHeight(read('tankHeightCm'));
        if (read('workingWaterVolumeLiters')) {
          setWorkingVolume(read('workingWaterVolumeLiters'));
          setVolumeEdited(true);
        }
        if (typeof data.hasFiltrationSystem === 'boolean') setHasFilter(data.hasFiltrationSystem);
        if (typeof data.filtrationSetup === 'string') setFilterType(data.filtrationSetup);
        if (typeof data.filterCapacity === 'string') setFilterCapacity(data.filterCapacity);
        if (typeof data.fishCount === 'number' && Array.isArray(data.fishWeightsG)) {
          setFishCount(String(data.fishCount));
          setFishWeights(data.fishWeightsG.map(String));
        }
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Aquarium could not be loaded.'));
  }, [aquariumId]);

  const calculatedVolume = useMemo(() => {
    const [l, w, h] = [numberOrNull(length), numberOrNull(width), numberOrNull(height)];
    return l && w && h ? Math.round((l * w * h) / 100) / 10 : null;
  }, [length, width, height]);
  const effectiveVolume = volumeEdited ? numberOrNull(workingVolume) : calculatedVolume;
  const volumeWarning =
    calculatedVolume && effectiveVolume && Math.abs(effectiveVolume - calculatedVolume) / calculatedVolume > VOLUME_WARNING_RATIO;

  const speciesOptions = Object.values(config.speciesById);
  const species = config.speciesById[speciesId] ?? selectSpeciesConfig({ species: ['Goldfish'] }, config.speciesById);
  const count = Number(fishCount);
  const weights = parseFishWeights(fishWeights, count);
  const bioload = weights && effectiveVolume
    ? computeBioload({ fishCount: count, fishWeightsG: weights, workingWaterVolumeLiters: effectiveVolume }, species?.bioloadBandsGPerL)
    : null;

  if (!isOwner) {
    return <StatusMessage variant="warning">Only an organization owner can set up an aquarium.</StatusMessage>;
  }
  if (!aquariumId) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-slate-300">No aquarium selected for setup. Open it from the Aquariums page.</p>
          <Button variant="secondary" onClick={() => onNavigate('aquariums')}>Go to Aquariums</Button>
        </CardContent>
      </Card>
    );
  }
  if (loadError) return <StatusMessage variant="error">{loadError}</StatusMessage>;
  if (!aquarium) return <p className="text-slate-300">Loading aquarium…</p>;

  const stepIndex = STEPS.indexOf(step);
  const validate = (target: StepName): string => {
    if (target === 'Tank') {
      if (!name.trim()) return 'Give the aquarium a name.';
      if (!calculatedVolume) return 'Enter the length, width and height in cm.';
      if (!effectiveVolume) return 'Enter the working water volume in litres.';
    }
    if (target === 'Filter' && hasFilter && !filterType.trim()) return 'Enter the filter type, or choose "No filter".';
    if (target === 'Fish') {
      if (!Number.isInteger(count) || count < 1 || count > 100) return 'Fish count must be a whole number from 1 to 100.';
      if (!weights) return 'Enter a weight in grams for every fish.';
    }
    return '';
  };
  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (!problem) setStep(STEPS[stepIndex + 1]);
  };

  const finish = async () => {
    const problem = STEPS.map(validate).find(Boolean);
    if (problem || !effectiveVolume || !weights || !calculatedVolume) {
      setError(problem || 'Some details are missing.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateAquarium(aquariumId, {
        name: name.trim(),
        species: ['Goldfish'],
        tankLengthCm: Number(length),
        tankWidthCm: Number(width),
        tankHeightCm: Number(height),
        tankSizeLiters: calculatedVolume,
        workingWaterVolumeLiters: effectiveVolume,
        hasFiltrationSystem: hasFilter,
        ...(hasFilter ? { filtrationSetup: filterType.trim(), filterCapacity: filterCapacity.trim() } : {}),
        fishCount: count,
        fishWeightsG: weights,
        status: 'active',
      });
      setSetupTarget(null);
      onNavigate('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Device {String(aquarium.deviceId ?? '')}</p>
          <h3 className="text-xl font-semibold text-white">Set up your aquarium</h3>
        </div>
        <Badge variant="warning">Setup</Badge>
      </div>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Setup steps">
        {STEPS.map((item, index) => (
          <li key={item} aria-current={item === step ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${item === step ? 'border-teal-300/50 bg-teal-500/15 text-teal-100' : index < stepIndex ? 'border-emerald-400/30 text-emerald-300' : 'border-slate-600/40 text-slate-400'}`}>
            {index + 1}. {item}
          </li>
        ))}
      </ol>
      {error && <StatusMessage variant="error">{error}</StatusMessage>}

      <Card>
        <CardHeader><h4 className="font-semibold text-white">{step}</h4></CardHeader>
        <CardContent className="space-y-4">
          {step === 'Tank' && (
            <>
              <Input label="Aquarium name" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Length (cm)" inputMode="decimal" value={length} onChange={(event) => setLength(event.target.value)} />
                <Input label="Width (cm)" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} />
                <Input label="Height (cm)" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} />
              </div>
              <p className="text-sm text-slate-300">Calculated volume: <span className="font-medium text-white">{calculatedVolume ? `${calculatedVolume} L` : '—'}</span></p>
              <Input
                label="Working water volume (L)"
                inputMode="decimal"
                placeholder={calculatedVolume ? String(calculatedVolume) : ''}
                value={volumeEdited ? workingVolume : calculatedVolume ? String(calculatedVolume) : ''}
                onChange={(event) => { setVolumeEdited(true); setWorkingVolume(event.target.value); }}
              />
              <p className="text-xs text-slate-400">Usually a little less than the calculated volume (gravel, decorations, the gap at the top).</p>
              {volumeWarning && (
                <p className="flex items-start gap-2 text-sm text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {effectiveVolume} L is far from the calculated {calculatedVolume} L. Check the measurements.
                </p>
              )}
            </>
          )}

          {step === 'Filter' && (
            <>
              <div className="flex gap-3" role="radiogroup" aria-label="Filtration">
                <Button variant={hasFilter ? 'primary' : 'secondary'} onClick={() => setHasFilter(true)} aria-pressed={hasFilter}>Has a filter</Button>
                <Button variant={!hasFilter ? 'primary' : 'secondary'} onClick={() => setHasFilter(false)} aria-pressed={!hasFilter}>No filter</Button>
              </div>
              {hasFilter && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Filter type" placeholder="e.g. Hang-on-back" maxLength={80} value={filterType} onChange={(event) => setFilterType(event.target.value)} />
                  <Input label="Capacity (L/h, optional)" placeholder="e.g. 400" maxLength={40} value={filterCapacity} onChange={(event) => setFilterCapacity(event.target.value)} />
                </div>
              )}
            </>
          )}

          {step === 'Fish' && (
            <>
              <label className="block space-y-1">
                <span className="block text-sm font-medium text-slate-200">Species</span>
                <select value={speciesId} onChange={(event) => setSpeciesId(event.target.value)}
                  className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-slate-100">
                  {(speciesOptions.length ? speciesOptions : [{ speciesId: 'goldfish', name: 'Goldfish' }]).map((option) => (
                    <option key={option.speciesId} value={option.speciesId} className="bg-slate-900">{option.name}</option>
                  ))}
                </select>
                <span className="block text-xs text-slate-400">Goldfish is the only species in the research scope.</span>
              </label>
              <Input label="Number of fish" inputMode="numeric" value={fishCount}
                onChange={(event) => { setFishCount(event.target.value); setFishWeights(resizeFishWeights(fishWeights, Number(event.target.value))); }} />
              <div className="grid gap-3 sm:grid-cols-3">
                {fishWeights.map((weight, index) => (
                  <Input key={index} label={`Fish ${index + 1} (g)`} inputMode="decimal" value={weight}
                    onChange={(event) => setFishWeights(fishWeights.map((item, i) => (i === index ? event.target.value : item)))} />
                ))}
              </div>
              <div className="rounded-lg border border-slate-600/30 bg-slate-900/30 p-4 text-sm" aria-live="polite">
                <p className="text-slate-400">Bioload preview</p>
                {bioload ? (
                  <p className="mt-1 text-white">
                    <span className="text-lg font-semibold">{BIOLOAD_LABEL[bioload.level]}</span>
                    <span className="ml-2 text-slate-300">{bioload.densityGPerL.toFixed(1)} g/L ({bioload.totalBiomassG} g in {effectiveVolume} L)</span>
                  </p>
                ) : (
                  <p className="mt-1 text-slate-300">{species?.bioloadBandsGPerL ? 'Enter every fish weight to see the level.' : 'Bioload bands are not configured for this species.'}</p>
                )}
                <p className="mt-2 text-xs text-amber-300">Bioload bands are a draft pending a citation (docs/bioload.md).</p>
              </div>
            </>
          )}

          {step === 'Thresholds' && (
            <>
              <p className="text-sm text-slate-300">These are the limits the rule engine will use for this tank. You can change them later on the Aquariums page.</p>
              <ThresholdReview species={species ?? null} aquarium={aquarium} />
            </>
          )}

          <div className="flex flex-wrap gap-3 border-t border-slate-600/30 pt-4">
            {stepIndex > 0 && <Button variant="ghost" onClick={() => { setError(''); setStep(STEPS[stepIndex - 1]); }} disabled={saving}>Back</Button>}
            {step !== 'Thresholds' ? (
              <Button onClick={next}>Next</Button>
            ) : (
              <Button onClick={() => void finish()} disabled={saving}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Saving…' : 'Finish setup'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
