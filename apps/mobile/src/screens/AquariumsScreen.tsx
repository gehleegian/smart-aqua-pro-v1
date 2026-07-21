import { type ComponentType } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Droplets,
  Fish,
  PencilLine,
  Plus,
  Thermometer,
  Trash2,
  Users,
  Waves,
  X,
} from 'lucide-react-native';
import SectionCard from '../components/common/SectionCard';
import { useAquariumsScreen } from '../hooks/useAquariumsScreen';
import { mobileTheme } from '../theme';
import type { Aquarium } from '../types/aquarium';
import type { AquariumFormData, AquariumFormMode } from '../types/aquariumManagement';
import {
  getAquariumFormSubmitLabel,
  getAquariumFormTitle,
  getAquariumsContextNote,
  getAquariumsEmptyMessage,
} from '../utils/aquariumManagementHelpers';

const PlusIcon = Plus as ComponentType<any>;
const UsersIcon = Users as ComponentType<any>;
const FishIcon = Fish as ComponentType<any>;
const PencilIcon = PencilLine as ComponentType<any>;
const TrashIcon = Trash2 as ComponentType<any>;
const ThermometerIcon = Thermometer as ComponentType<any>;
const DropletsIcon = Droplets as ComponentType<any>;
const WavesIcon = Waves as ComponentType<any>;
const CloseIcon = X as ComponentType<any>;

export default function AquariumsScreen() {
  const aquariums = useAquariumsScreen();

  return (
    <>
      <View style={styles.stack}>
        {aquariums.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{aquariums.error}</Text>
          </View>
        ) : null}

        {aquariums.success ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{aquariums.success}</Text>
          </View>
        ) : null}

        <SectionCard
          title="Aquarium Management"
          subtitle={getAquariumsContextNote(aquariums.currentUserRole)}
          action={
            <Pressable onPress={aquariums.actions.openAddModal} style={styles.addButton}>
              <PlusIcon size={15} stroke={mobileTheme.colors.text} />
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          }
        >
          <View style={styles.overviewGrid}>
            <OverviewTile label="Records" value={String(aquariums.aquariumList.length)} />
            <OverviewTile label="Showing" value={String(aquariums.visibleAquariums.length)} />
          </View>
        </SectionCard>

        {aquariums.currentUserRole === 'Admin' ? (
          <SectionCard title="Owners" subtitle="Select which owner's aquariums to view.">
            {aquariums.ownerGroups.length === 0 ? (
              <Text style={styles.emptyText}>No owners with aquariums yet.</Text>
            ) : (
              <View style={styles.ownerWrap}>
                {aquariums.ownerGroups.map((owner) => (
                  <Pressable
                    key={owner.ownerId || owner.ownerName}
                    onPress={() => aquariums.actions.selectOwner(owner.ownerId)}
                    style={[
                      styles.ownerChip,
                      aquariums.selectedOwnerId === owner.ownerId && styles.ownerChipActive,
                    ]}
                  >
                    <UsersIcon size={14} stroke={mobileTheme.colors.textMuted} />
                    <Text
                      style={[
                        styles.ownerChipText,
                        aquariums.selectedOwnerId === owner.ownerId && styles.ownerChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {owner.ownerName}
                    </Text>
                    <Text style={styles.ownerCount}>{owner.aquariums.length}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {aquariums.selectedOwnerName ? (
              <View style={styles.ownerBanner}>
                <Text style={styles.ownerBannerText}>Showing aquariums for</Text>
                <Text style={styles.ownerBannerName}>{aquariums.selectedOwnerName}</Text>
              </View>
            ) : null}
          </SectionCard>
        ) : null}

        {aquariums.loading ? (
          <SectionCard title="Aquariums" subtitle="Loading aquarium records.">
            <View style={styles.centerState}>
              <ActivityIndicator color={mobileTheme.colors.accent} />
              <Text style={styles.loadingText}>Loading aquariums...</Text>
            </View>
          </SectionCard>
        ) : aquariums.visibleAquariums.length === 0 ? (
          <SectionCard title="Aquariums" subtitle="No records match the current owner view.">
            <Text style={styles.emptyText}>{getAquariumsEmptyMessage(aquariums.currentUserRole)}</Text>
          </SectionCard>
        ) : (
          <View style={styles.list}>
            {aquariums.visibleAquariums.map((aquarium) => (
              <AquariumCard
                key={aquarium.id}
                aquarium={aquarium}
                deleting={aquariums.deletingId === aquarium.id}
                isAdmin={aquariums.currentUserRole === 'Admin'}
                onDelete={() => aquariums.actions.requestDeleteAquarium(aquarium)}
                onEdit={() => aquariums.actions.openEditModal(aquarium)}
              />
            ))}
          </View>
        )}
      </View>

      <AquariumFormModal
        currentUserRole={aquariums.currentUserRole}
        formData={aquariums.formData}
        formMode={aquariums.formMode}
        saving={aquariums.saving}
        selectedOwnerName={aquariums.selectedOwnerName}
        visible={aquariums.showModal}
        onClose={aquariums.actions.closeModal}
        onFieldChange={aquariums.actions.updateFormField}
        onSave={() => void aquariums.actions.saveAquarium()}
      />

      <DeleteConfirmModal
        aquarium={aquariums.pendingDeleteAquarium}
        deleting={Boolean(aquariums.deletingId)}
        onCancel={aquariums.actions.closeDeleteConfirm}
        onConfirm={() => void aquariums.actions.confirmDeleteAquarium()}
      />
    </>
  );
}

type AquariumCardProps = {
  aquarium: Aquarium;
  deleting: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

function AquariumCard({ aquarium, deleting, isAdmin, onEdit, onDelete }: AquariumCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <View style={styles.fishBadge}>
            <FishIcon size={20} stroke={mobileTheme.colors.text} />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>{aquarium.name}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {aquarium.species.length > 0 ? aquarium.species.join(', ') : 'No species listed'}
            </Text>
            {isAdmin ? <Text style={styles.ownerLine}>Owner: {aquarium.ownerName}</Text> : null}
          </View>
        </View>
        <BioloadBadge bioload={aquarium.bioload} />
      </View>

      <View style={styles.metricGrid}>
        <Metric icon={ThermometerIcon} label="Target Range" value={`${aquarium.minTemp} C - ${aquarium.maxTemp} C`} />
        <Metric icon={DropletsIcon} label="Minimum Level" value={`${aquarium.minLevel}%`} />
        <Metric icon={WavesIcon} label="Minimum Purity" value={`${aquarium.minQuality}%`} />
      </View>

      <View style={styles.monitoringNote}>
        <Text style={styles.noteLabel}>Live Monitoring</Text>
        <Text style={styles.noteValue}>Open Monitoring to view live sensor data.</Text>
      </View>

      <View style={styles.statusRow}>
        <StatusPill label={`Feeder: ${aquarium.feeder}`} active={aquarium.feeder === 'Active'} />
        <StatusPill label={`Light: ${aquarium.light}`} active={aquarium.light === 'On'} />
        <StatusPill label={`Filter: ${aquarium.filter}`} active={aquarium.filter === 'Active'} />
      </View>

      <View style={styles.cardActions}>
        <Pressable onPress={onEdit} style={styles.editButton}>
          <PencilIcon size={15} stroke={mobileTheme.colors.text} />
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable disabled={deleting} onPress={onDelete} style={[styles.deleteButton, deleting && styles.disabled]}>
          <TrashIcon size={15} stroke={mobileTheme.colors.danger} />
          <Text style={styles.deleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OverviewTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.overviewTile}>
      <Text style={styles.overviewLabel}>{label}</Text>
      <Text style={styles.overviewValue}>{value}</Text>
    </View>
  );
}

function BioloadBadge({ bioload }: { bioload: Aquarium['bioload'] }) {
  return (
    <View
      style={[
        styles.bioloadBadge,
        bioload === 'high' ? styles.bioloadHigh : bioload === 'medium' ? styles.bioloadMedium : styles.bioloadLow,
      ]}
    >
      <Text style={styles.bioloadBadgeText}>{bioload} bioload</Text>
    </View>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<any>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Icon size={18} stroke={mobileTheme.colors.accent} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={[styles.statusPill, active ? styles.statusActive : styles.statusIdle]}>
      <Text style={styles.statusPillText}>{label}</Text>
    </View>
  );
}

type AquariumFormModalProps = {
  currentUserRole: 'Admin' | 'User';
  formData: AquariumFormData;
  formMode: AquariumFormMode;
  saving: boolean;
  selectedOwnerName: string;
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: <Field extends keyof AquariumFormData>(
    field: Field,
    value: AquariumFormData[Field]
  ) => void;
};

function AquariumFormModal({
  currentUserRole,
  formData,
  formMode,
  saving,
  selectedOwnerName,
  visible,
  onClose,
  onSave,
  onFieldChange,
}: AquariumFormModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalTitle}>{getAquariumFormTitle(formMode)}</Text>
                {currentUserRole === 'Admin' && selectedOwnerName ? (
                  <Text style={styles.modalSubtitle}>Owner: {selectedOwnerName}</Text>
                ) : (
                  <Text style={styles.modalSubtitle}>Keep aquarium details aligned with the web app.</Text>
                )}
              </View>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <CloseIcon size={17} stroke={mobileTheme.colors.textMuted} />
              </Pressable>
            </View>

            <FormField
              label="Aquarium Name"
              placeholder="e.g., Tropical Tank E"
              value={formData.name}
              onChangeText={(value) => onFieldChange('name', value)}
            />
            <FormField
              label="Fish Species"
              placeholder="e.g., Guppies, Tetras"
              value={formData.species}
              onChangeText={(value) => onFieldChange('species', value)}
            />

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Bioload Classification</Text>
              <View style={styles.bioloadRow}>
                {(['low', 'medium', 'high'] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => onFieldChange('bioload', item)}
                    style={[styles.bioloadButton, formData.bioload === item && styles.bioloadButtonActive]}
                  >
                    <Text style={[styles.bioloadText, formData.bioload === item && styles.bioloadTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inlineRow}>
              <FormField
                keyboardType="numeric"
                label="Min Temp (C)"
                placeholder="24"
                value={formData.minTemp}
                onChangeText={(value) => onFieldChange('minTemp', value)}
              />
              <FormField
                keyboardType="numeric"
                label="Max Temp (C)"
                placeholder="28"
                value={formData.maxTemp}
                onChangeText={(value) => onFieldChange('maxTemp', value)}
              />
            </View>
            <View style={styles.inlineRow}>
              <FormField
                keyboardType="numeric"
                label="Water Level Min (%)"
                placeholder="70"
                value={formData.minLevel}
                onChangeText={(value) => onFieldChange('minLevel', value)}
              />
              <FormField
                keyboardType="numeric"
                label="Water Purity Min (%)"
                placeholder="80"
                value={formData.minQuality}
                onChangeText={(value) => onFieldChange('minQuality', value)}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={onClose} style={[styles.modalGhostButton, saving && styles.disabled]}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={onSave} style={[styles.modalPrimaryButton, saving && styles.disabled]}>
                <Text style={styles.modalPrimaryText}>{getAquariumFormSubmitLabel(formMode, saving)}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DeleteConfirmModal({
  aquarium,
  deleting,
  onCancel,
  onConfirm,
}: {
  aquarium: Aquarium | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal transparent visible={Boolean(aquarium)} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onCancel} />
        <View style={styles.confirmSheet}>
          <Text style={styles.modalTitle}>Delete Aquarium</Text>
          <Text style={styles.confirmText}>
            Are you sure you want to delete {aquarium?.name || 'this aquarium'}?
          </Text>
          <View style={styles.modalActions}>
            <Pressable disabled={deleting} onPress={onCancel} style={[styles.modalGhostButton, deleting && styles.disabled]}>
              <Text style={styles.modalGhostText}>Cancel</Text>
            </Pressable>
            <Pressable disabled={deleting} onPress={onConfirm} style={[styles.confirmDeleteButton, deleting && styles.disabled]}>
              <Text style={styles.confirmDeleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FormField({
  label,
  value,
  placeholder,
  keyboardType,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  keyboardType?: 'default' | 'numeric';
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.modalField}>
      <Text style={styles.modalLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={mobileTheme.colors.textMuted}
        style={styles.modalInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
    padding: 12,
  },
  errorText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
  },
  successBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
    padding: 12,
  },
  successText: {
    color: mobileTheme.colors.success,
    fontSize: 13,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: mobileTheme.colors.accent,
    paddingHorizontal: 12,
  },
  addButtonText: {
    color: mobileTheme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  overviewTile: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 12,
    gap: 4,
  },
  overviewLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  overviewValue: {
    color: mobileTheme.colors.accent,
    fontSize: 22,
    fontWeight: '800',
  },
  ownerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ownerChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ownerChipActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  ownerChipText: {
    color: mobileTheme.colors.textMuted,
    maxWidth: 180,
    fontSize: 12,
    fontWeight: '700',
  },
  ownerChipTextActive: {
    color: mobileTheme.colors.text,
  },
  ownerCount: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  ownerBanner: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 12,
  },
  ownerBannerText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  ownerBannerName: {
    color: mobileTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  centerState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  emptyText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 14,
    gap: 14,
  },
  cardHeader: {
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fishBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBlock: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: mobileTheme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  ownerLine: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  bioloadBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bioloadLow: {
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
  },
  bioloadMedium: {
    borderColor: mobileTheme.colors.warningBorder,
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  bioloadHigh: {
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
  },
  bioloadBadgeText: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minHeight: 96,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 5,
  },
  metricValue: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  metricLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
  },
  monitoringNote: {
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 12,
    gap: 2,
  },
  noteLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
  },
  noteValue: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusActive: {
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
  },
  statusIdle: {
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  statusPillText: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  editButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: mobileTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  deleteButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: mobileTheme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  actionText: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  deleteText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mobileTheme.colors.overlay,
  },
  modalSheet: {
    maxHeight: '90%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.background,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitleBlock: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    color: mobileTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalField: {
    flex: 1,
    gap: 6,
  },
  modalLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  modalInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    color: mobileTheme.colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  bioloadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bioloadButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  bioloadButtonActive: {
    backgroundColor: mobileTheme.colors.accentSoft,
    borderColor: mobileTheme.colors.accent,
  },
  bioloadText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  bioloadTextActive: {
    color: mobileTheme.colors.text,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalGhostButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  modalGhostText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accent,
  },
  modalPrimaryText: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  confirmSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.background,
    padding: 18,
    gap: 14,
  },
  confirmText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  confirmDeleteButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
  },
  confirmDeleteText: {
    color: mobileTheme.colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.65,
  },
});
