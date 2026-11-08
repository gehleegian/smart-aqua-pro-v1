import { Ban, Mail, PlusCircle, Wifi } from 'lucide-react';
import Button from '../ui/Button';
import { Card, CardContent } from '../ui/Card';

/**
 * A signed-in account with no organization and no accepted invite can see
 * nothing (rules enforce it); this tells them the two ways in.
 */
export default function NoOrgState({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="text-center">
        <h3 className="text-2xl font-semibold text-white">Welcome to SmartAqua Pro</h3>
        <p className="mt-2 text-sm text-slate-300">Your account isn&apos;t linked to any aquarium yet. There are two ways to start.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <PlusCircle className="h-8 w-8 text-teal-300" aria-hidden="true" />
            <div>
              <h4 className="text-lg font-semibold text-white">Add your first device</h4>
              <p className="mt-1 text-sm text-slate-300">
                Own a SmartAqua device? Scan the QR label on it. Your organization is created with your first device, and you become its owner.
              </p>
            </div>
            <p className="flex items-start gap-2 text-xs text-slate-400">
              <Wifi className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              Set up the device&apos;s Wi-Fi first: join its SmartAqua-XXXX hotspot.
            </p>
            <Button onClick={() => onNavigate('add-device')}>
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              Add device
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-6">
            <Mail className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <div>
              <h4 className="text-lg font-semibold text-white">Waiting for an invite</h4>
              <p className="mt-1 text-sm text-slate-300">
                Caring for someone else&apos;s tanks? Ask the owner to invite this email address from their Team page, then open the link they send you.
              </p>
            </div>
            <p className="text-xs text-slate-400">Invite links last 48 hours and only work for the invited email.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SuspendedOrgState({ orgName }: { orgName: string }) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="space-y-3 p-8 text-center">
        <Ban className="mx-auto h-8 w-8 text-rose-300" aria-hidden="true" />
        <h3 className="text-xl font-semibold text-white">{orgName} is suspended</h3>
        <p className="text-sm text-slate-300">
          Monitoring, devices and history for this organization are locked. Contact SmartAqua support to have it reactivated.
        </p>
      </CardContent>
    </Card>
  );
}
