import { useState } from 'react';
import { Camera, CheckCircle2, Keyboard, QrCode, Wifi } from 'lucide-react';
import { auth } from '../firebase';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StatusMessage from '../components/ui/StatusMessage';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import QrScanner from '../components/org/QrScanner';
import { useOrg } from '../hooks/useOrg';
import { claimDevice, refreshOrgContext } from '../services/orgService';
import { setActiveOrg, setSetupTarget } from '../services/orgContext';
import { parseClaimUri, validateManualClaim, type ClaimPayload } from '../utils/claimUri';

type Step = 'wifi' | 'identify' | 'details';

/**
 * Claim flow (docs/access-model.md): Wi-Fi first, then scan the label QR (or
 * type the ID and code), then name the tank. The first claim creates the
 * owner's organization. Everything is checked again by the claimDevice callable.
 */
export default function AddDevice({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { memberships, active } = useOrg();
  const ownedOrg = active?.role === 'owner' ? active : memberships.find((item) => item.role === 'owner') ?? null;
  const firstClaim = !ownedOrg;
  const [step, setStep] = useState<Step>('wifi');
  const [scanning, setScanning] = useState(false);
  const [payload, setPayload] = useState<ClaimPayload | null>(null);
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [aquariumName, setAquariumName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const acceptPayload = (next: ClaimPayload) => {
    setPayload(next);
    setScanning(false);
    setError('');
    setStep('details');
  };

  const handleScan = (text: string) => {
    const parsed = parseClaimUri(text);
    if (parsed) acceptPayload(parsed);
    else setError('That QR code is not a SmartAqua device label.');
  };

  const handleManual = () => {
    const result = validateManualClaim(deviceIdInput, codeInput);
    if (typeof result === 'string') setError(result);
    else acceptPayload(result);
  };

  const handleClaim = async () => {
    if (!payload) return;
    if (!aquariumName.trim()) {
      setError('Give the aquarium a name.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await claimDevice({
        deviceId: payload.deviceId,
        claimCode: payload.claimCode,
        aquariumName: aquariumName.trim(),
        ...(firstClaim && orgName.trim() ? { orgName: orgName.trim() } : {}),
        ...(ownedOrg ? { orgId: ownedOrg.orgId } : {}),
      });
      const uid = auth.currentUser?.uid;
      if (uid) await refreshOrgContext(uid);
      setActiveOrg(result.orgId);
      setSetupTarget(result.aquariumId);
      onNavigate('setup');
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'The device could not be added.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {(['wifi', 'identify', 'details'] as Step[]).map((item, index) => (
          <li
            key={item}
            aria-current={step === item ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${step === item ? 'border-teal-300/50 bg-teal-500/15 text-teal-100' : 'border-slate-600/40 text-slate-400'}`}
          >
            {index + 1}. {item === 'wifi' ? 'Wi-Fi' : item === 'identify' ? 'Scan label' : 'Name the tank'}
          </li>
        ))}
      </ol>

      {error && <StatusMessage variant="error">{error}</StatusMessage>}

      {step === 'wifi' && (
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Wifi className="h-5 w-5 text-teal-300" aria-hidden="true" /> Set up Wi-Fi first
            </h3>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Plug in the SmartAqua device and wait about 30 seconds.</li>
              <li>On your phone, join the Wi-Fi hotspot named <span className="font-mono text-slate-100">SmartAqua-XXXX</span>.</li>
              <li>Pick your home Wi-Fi in the page that opens and enter its password.</li>
              <li>When the device light stays on, come back here.</li>
            </ol>
            <p className="text-xs text-slate-400">The hotspot set-up runs on the device (firmware); it is not verified by this app.</p>
            <Button onClick={() => setStep('identify')}>Wi-Fi is set up</Button>
          </CardContent>
        </Card>
      )}

      {step === 'identify' && (
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <QrCode className="h-5 w-5 text-teal-300" aria-hidden="true" /> Scan the device label
            </h3>
          </CardHeader>
          <CardContent className="space-y-5">
            {scanning ? (
              <div className="space-y-3">
                <QrScanner onResult={handleScan} />
                <Button variant="secondary" onClick={() => setScanning(false)}>Stop camera</Button>
              </div>
            ) : (
              <Button onClick={() => setScanning(true)}>
                <Camera className="h-4 w-4" aria-hidden="true" /> Scan QR code
              </Button>
            )}
            <div className="space-y-3 border-t border-slate-600/30 pt-5">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Keyboard className="h-4 w-4" aria-hidden="true" /> Or type what is printed on the label
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Device ID" placeholder="SAQ-XXXX-XXXX" autoCapitalize="characters" value={deviceIdInput} onChange={(event) => setDeviceIdInput(event.target.value)} />
                <Input label="Claim code" placeholder="8 characters" autoCapitalize="characters" autoComplete="off" value={codeInput} onChange={(event) => setCodeInput(event.target.value)} />
              </div>
              <Button variant="secondary" onClick={handleManual}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'details' && payload && (
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" /> Device {payload.deviceId}
            </h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Aquarium name" placeholder="e.g. Front counter tank" maxLength={60} value={aquariumName} onChange={(event) => setAquariumName(event.target.value)} />
            {firstClaim ? (
              <div className="space-y-1">
                <Input
                  label="Organization name (optional)"
                  placeholder="e.g. Davao Pet Shop"
                  maxLength={80}
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                />
                <p className="text-xs text-slate-400">This is your first device, so your organization is created now. Leave it blank for a personal one named after you.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-300">Adding to <span className="font-medium text-white">{ownedOrg?.org.name}</span>.</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void handleClaim()} disabled={submitting}>{submitting ? 'Adding…' : 'Add device'}</Button>
              <Button variant="ghost" onClick={() => { setPayload(null); setStep('identify'); }} disabled={submitting}>Back</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
