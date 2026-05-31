import { Plus } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { AquariumCard } from '../components/aquariums/AquariumCard';
import { AquariumFormModal } from '../components/aquariums/AquariumFormModal';
import { AquariumOwnerSelector } from '../components/aquariums/AquariumOwnerSelector';
import { useAquariumsController } from '../hooks/useAquariumsController';
import {
  getAquariumsContextNote,
  getAquariumsEmptyMessage,
} from '../utils/aquariumManagementHelpers';

export default function Aquariums() {
  const aquariums = useAquariumsController();

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

        <button
          onClick={aquariums.actions.openAddModal}
          className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-600/20 transition-all hover:bg-cyan-700"
        >
          <Plus className="h-4 w-4" />
          Add Aquarium
        </button>
      </div>

      {aquariums.currentUserRole === 'Admin' && (
        <AquariumOwnerSelector
          ownerGroups={aquariums.ownerGroups}
          selectedOwnerId={aquariums.selectedOwnerId}
          onSelectOwner={aquariums.actions.selectOwner}
        />
      )}

      {aquariums.currentUserRole === 'Admin' && aquariums.selectedOwnerName && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
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
          currentUserRole={aquariums.currentUserRole}
          selectedOwnerName={aquariums.selectedOwnerName}
          onClose={aquariums.actions.closeModal}
          onSave={() => void aquariums.actions.saveAquarium()}
          onFieldChange={aquariums.actions.updateFormField}
        />
      )}
    </div>
  );
}
