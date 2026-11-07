import { PlusCircle, Wrench } from 'lucide-react';
import Button from '../components/ui/Button';
import { setSetupTarget } from '../services/orgContext';
import { Card, CardContent } from '../components/ui/Card';
import { AquariumCard } from '../components/aquariums/AquariumCard';
import { AquariumFormModal } from '../components/aquariums/AquariumFormModal';
import { AquariumOwnerSelector } from '../components/aquariums/AquariumOwnerSelector';
import { useAquariumsController } from '../hooks/useAquariumsController';
import {
  getAquariumsContextNote,
  getAquariumsEmptyMessage,
} from '../utils/aquariumManagementHelpers';

export default function Aquariums({ onNavigate }: { onNavigate: (page: string) => void }) {
  const aquariums = useAquariumsController();
  const pendingSetup = aquariums.visibleAquariums.filter((aquarium) => aquarium.setupStatus === 'setup');

  return (
    <div className="space-y-6">
      {(aquariums.error || aquariums.success) && (
        <div className="space-y-3">
          {aquariums.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
              {aquariums.error}
            </div>
          )}
          {aquariums.success && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
              {aquariums.success}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Manage and configure your aquariums</p>
          <p className="mt-1 text-xs text-slate-500">
            {getAquariumsContextNote(aquariums.currentUserRole)}
          </p>
        </div>

        {aquariums.currentUserRole === 'User' ? (
          // Sprint 3: an aquarium is created by claiming its device.
          <Button onClick={() => onNavigate('add-device')}>
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Add device
          </Button>
        ) : null}
      </div>

      {pendingSetup.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-200">Finish setting up {pendingSetup.length === 1 ? 'this aquarium' : 'these aquariums'}:</p>
          <div className="flex flex-wrap gap-2">
            {pendingSetup.map((aquarium) => (
              <Button key={aquarium.id} size="sm" variant="secondary" onClick={() => { setSetupTarget(aquarium.id); onNavigate('setup'); }}>
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> {aquarium.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {aquariums.currentUserRole === 'Admin' && (
        <AquariumOwnerSelector
          ownerGroups={aquariums.ownerGroups}
          selectedOwnerId={aquariums.selectedOwnerId}
          onSelectOwner={aquariums.actions.selectOwner}
        />
      )}

      {aquariums.currentUserRole === 'Admin' && aquariums.selectedOwnerName && (
        <div className="rounded-lg border border-slate-600/30 bg-slate-900/35 px-4 py-3">
          <p className="text-sm text-slate-400">Showing aquariums for</p>
          <p className="text-base font-semibold text-white">{aquariums.selectedOwnerName}</p>
        </div>
      )}

      {aquariums.loading ? (
        <div className="text-slate-300">Loading aquariums...</div>
      ) : aquariums.visibleAquariums.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-slate-300">
              {getAquariumsEmptyMessage(aquariums.currentUserRole)}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {aquariums.visibleAquariums.map((aquarium) => (
            <AquariumCard
              key={aquarium.id}
              aquarium={aquarium}
              currentUserRole={aquariums.currentUserRole}
              deleting={aquariums.deletingId === aquarium.id}
              onEdit={aquariums.actions.openEditModal}
              onDelete={(aquariumId) => void aquariums.actions.removeAquarium(aquariumId)}
            />
          ))}
        </div>
      )}

      {aquariums.showModal && (
        <AquariumFormModal
          formData={aquariums.formData}
          formMode={aquariums.formMode}
          saving={aquariums.saving}
          error={aquariums.error}
          currentUserRole={aquariums.currentUserRole}
          selectedOwnerName={aquariums.selectedOwnerName}
          onClose={aquariums.actions.closeModal}
          onSave={() => void aquariums.actions.saveAquarium()}
          onFieldChange={aquariums.actions.updateFormField}
          onFishWeightChange={aquariums.actions.updateFishWeight}
        />
      )}
    </div>
  );
}
