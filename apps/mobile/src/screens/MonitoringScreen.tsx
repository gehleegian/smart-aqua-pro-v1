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
import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Clock,
  Fish,
  Lightbulb,
  Plus,
  Power,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Timer,
  Trash2,
  Waves,
  Wind,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import SectionCard from '../components/common/SectionCard';
import MonitoringActionButton from '../components/monitoring/MonitoringActionButton';
import { useMonitoringScreen } from '../hooks/useMonitoringScreen';
import { mobileTheme } from '../theme';
import type { MonitoringAquarium, SystemField, SystemMode } from '../types/monitoring';
import {
  formatAutomationTimes,
  formatAutomationTime,
  formatTdsReading,
  getLevelLabel,
  getManualActionKey,
  getPhLabel,
  getPurityTone,
  getQualityLabel,
  getTurbidityLabel,
  getTemperatureLabel,
} from '../utils/monitoringHelpers';
import { getDeviceTelemetryStatusText } from '../types/device';

const modeOptions: Array<{ key: SystemMode; label: string }> = [
  { key: 'manual', label: 'Manual' },
  { key: 'automation', label: 'Auto' },
];

const WHEEL_ITEM_HEIGHT = 46;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS;

export default function MonitoringScreen() {
  const monitoring = useMonitoringScreen();
  const selectedAquarium = monitoring.selectedAquarium;
  const selectedPurityTone = selectedAquarium?.hasFreshPurityTelemetry
    ? getPurityTone(selectedAquarium.quality, selectedAquarium.tdsPpm, selectedAquarium.minQuality)
    : 'warning';
  const RefreshIcon = RefreshCw as ComponentType<any>;
  const WavesIcon = Waves as ComponentType<any>;
  const SettingsIcon = Settings2 as ComponentType<any>;
  const FishIcon = Fish as ComponentType<any>;
  const LightIcon = Lightbulb as ComponentType<any>;
  const FilterIcon = SlidersHorizontal as ComponentType<any>;
  const PowerIcon = Power as ComponentType<any>;
  const ClockIcon = Clock as ComponentType<any>;
  const TimerIcon = Timer as ComponentType<any>;
  const WindIcon = Wind as ComponentType<any>;
  const PlusIcon = Plus as ComponentType<any>;
  const TrashIcon = Trash2 as ComponentType<any>;
  const SaveIcon = Save as ComponentType<any>;
  const CloseIcon = X as ComponentType<any>;

  if (monitoring.loading) {
    return (
      <SectionCard title="Monitoring overview" subtitle="Loading your tanks and device links.">
        <View style={styles.centerState}>
          <ActivityIndicator color={mobileTheme.colors.accent} />
          <Text style={styles.mutedText}>Loading monitoring data...</Text>
        </View>
      </SectionCard>
    );
  }

  if (monitoring.error) {
    return (
      <SectionCard title="Monitoring unavailable" subtitle={monitoring.error}>
        <Pressable style={styles.refreshButton} onPress={monitoring.actions.refresh}>
          <RefreshIcon size={16} stroke={mobileTheme.colors.text} />
          <Text style={styles.refreshLabel}>Retry</Text>
        </Pressable>
      </SectionCard>
    );
  }

  if (monitoring.aquariums.length === 0) {
    return (
      <SectionCard
        title="No aquariums yet"
        subtitle="Add an aquarium on the web app first, then it will appear here."
      >
        <View style={styles.emptyPanel}>
          <WavesIcon size={22} stroke={mobileTheme.colors.accent} />
          <Text style={styles.emptyText}>Monitoring will activate once a tank is available.</Text>
        </View>
      </SectionCard>
    );
  }

  return (
    <View style={styles.stack}>
      <SectionCard
        title="Monitoring overview"
        subtitle={monitoring.userName ? `Signed in as ${monitoring.userName}` : 'Live device overview'}
      >
        <View style={styles.summaryGrid}>
          <SummaryCell label="Live tanks" value={`${monitoring.summary.live}/${monitoring.summary.total}`} />
          <SummaryCell
            label="Warnings"
            value={`${monitoring.summary.warning}`}
            tone={monitoring.summary.warning > 0 ? 'warning' : 'success'}
          />
        </View>
        <ConnectionNotice
          message={
            monitoring.liveDataError ||
            (monitoring.realtimeEnabled
              ? 'Realtime device data is connected.'
              : 'Realtime Database is not configured.')
          }
          realtimeEnabled={monitoring.realtimeEnabled && !monitoring.liveDataError}
        />
      </SectionCard>

      <SectionCard
        title="Aquariums"
        subtitle="Choose a tank to inspect its live readings and controls."
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tankScroller}>
          {monitoring.aquariums.map((aquarium) => (
            <TankChip
              key={aquarium.id}
              aquarium={aquarium}
              active={aquarium.id === selectedAquarium?.id}
              onPress={() => monitoring.actions.selectAquarium(aquarium.id)}
            />
          ))}
        </ScrollView>
      </SectionCard>

      {selectedAquarium ? (
        <>
          <SectionCard
            title={selectedAquarium.name}
            subtitle={selectedAquarium.ownerName ? `Owner: ${selectedAquarium.ownerName}` : 'Live tank snapshot'}
          >
            <View style={styles.statusRow}>
              <StatusPill
                label={selectedAquarium.telemetryState === 'live' ? 'Live data' : 'No live data'}
                tone={selectedAquarium.telemetryState === 'live' ? 'success' : 'warning'}
              />
              <StatusPill
                label={selectedAquarium.healthStatus === 'healthy' ? 'Healthy' : 'Needs attention'}
                tone={selectedAquarium.healthStatus === 'healthy' ? 'success' : 'warning'}
              />
            </View>

            <View style={styles.metricStack}>
              <MetricRow
                label="Temperature"
                value={
                  selectedAquarium.hasFreshTemperatureTelemetry
                    ? `${selectedAquarium.temp.toFixed(1)}\u00B0C`
                    : '--'
                }
                detail={getTemperatureLabel(
                  selectedAquarium.temp,
                  selectedAquarium.minTemp,
                  selectedAquarium.maxTemp
                )}
              />
              <MetricRow
                label="Water level"
                value={selectedAquarium.hasFreshTelemetry ? `${Math.round(selectedAquarium.level)}%` : '--'}
                detail={getLevelLabel(selectedAquarium.level)}
              />
              <MetricRow
                label="Purity"
                value={
                  selectedAquarium.hasFreshPurityTelemetry
                    ? formatTdsReading(selectedAquarium.tdsPpm, selectedAquarium.quality)
                    : '--'
                }
                detail={getQualityLabel(selectedAquarium.quality, selectedAquarium.tdsPpm)}
                tone={selectedPurityTone === 'success' ? 'accent' : selectedPurityTone}
              />
              <MetricRow
                label="pH Level"
                value={
                  selectedAquarium.hasFreshTelemetry && typeof selectedAquarium.ph === 'number'
                    ? selectedAquarium.ph.toFixed(2)
                    : '--'
                }
                detail={getPhLabel(selectedAquarium.ph)}
              />
              <MetricRow
                label="Turbidity"
                value={
                  selectedAquarium.hasFreshTelemetry && typeof selectedAquarium.turbidity === 'number'
                    ? `${Math.round(selectedAquarium.turbidity)}`
                    : '--'
                }
                detail={getTurbidityLabel(selectedAquarium.turbidity)}
              />
              <MetricRow
                label="Power status"
                value={
                  selectedAquarium.telemetryState === 'live'
                    ? 'Online'
                    : selectedAquarium.telemetryState === 'offline'
                      ? 'Offline'
                      : 'Waiting'
                }
                detail={getDeviceTelemetryStatusText(selectedAquarium.telemetryState)}
              />
            </View>

            {monitoring.selectedDeviceShadow?.latestCommand ? (
              <Text style={styles.helperText}>
                Last command: {formatCommandType(monitoring.selectedDeviceShadow.latestCommand.type)}
              </Text>
            ) : null}
          </SectionCard>

          <SectionCard
            title={monitoring.systemMode === 'automation' ? 'Automation' : 'Quick controls'}
            subtitle={
              monitoring.systemMode === 'automation'
                ? 'Saved schedules are active for this tank.'
                : undefined
            }
          >
            <View style={styles.modeRow}>
              {modeOptions.map((mode) => (
                <Pressable
                  key={mode.key}
                  disabled={monitoring.savingMode}
                  onPress={() => monitoring.actions.handleSystemModeChange(mode.key)}
                  style={({ pressed }) => [
                    styles.modeButton,
                    monitoring.systemMode === mode.key && styles.modeButtonActive,
                    pressed && !monitoring.savingMode && styles.pressed,
                    monitoring.savingMode && styles.disabled,
                  ]}
                >
                  <SettingsIcon
                    size={15}
                    stroke={
                      monitoring.systemMode === mode.key
                        ? mobileTheme.colors.text
                        : mobileTheme.colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      monitoring.systemMode === mode.key && styles.modeLabelActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {monitoring.systemMode === 'automation' && monitoring.automationSettings ? (
              <AutomationPanel
                automationEnabled={monitoring.automationEnabled}
                clockIcon={ClockIcon}
                filterIcon={WindIcon}
                lightIcon={LightIcon}
                powerIcon={PowerIcon}
                saving={monitoring.savingAutomationEnabled}
                settings={monitoring.automationSettings}
                systemMode={monitoring.systemMode}
                timerIcon={TimerIcon}
                onConfigure={monitoring.actions.openAutomationEditor}
                onToggle={monitoring.actions.handleAutomationEnabledToggle}
              />
            ) : null}

            {monitoring.systemMode === 'manual' && monitoring.manualActions ? (
              <View style={styles.actionStack}>
                <CommandButton
                  field="feeder"
                  icon={FishIcon}
                  tone="accent"
                  selectedAquariumId={selectedAquarium.id}
                  monitoring={monitoring}
                />
                <CommandButton
                  field="light"
                  icon={LightIcon}
                  tone="warning"
                  selectedAquariumId={selectedAquarium.id}
                  monitoring={monitoring}
                />
                <CommandButton
                  field="filter"
                  icon={FilterIcon}
                  tone="success"
                  selectedAquariumId={selectedAquarium.id}
                  monitoring={monitoring}
                />
              </View>
            ) : null}

            {monitoring.systemError ? <Text style={styles.errorText}>{monitoring.systemError}</Text> : null}
          </SectionCard>

          <AutomationEditorModal
            aquariumName={selectedAquarium.name}
            closeIcon={CloseIcon}
            draft={monitoring.automationDraft}
            error={monitoring.automationError}
            plusIcon={PlusIcon}
            saving={monitoring.savingAutomation}
            saveIcon={SaveIcon}
            trashIcon={TrashIcon}
            visible={monitoring.showAutomationEditor}
            onAddFeedingTime={monitoring.actions.addFeedingTime}
            onCancel={monitoring.actions.closeAutomationEditor}
            onDraftChange={monitoring.actions.updateAutomationDraft}
            onRemoveFeedingTime={monitoring.actions.removeFeedingTime}
            onSave={monitoring.actions.handleAutomationSave}
            onUpdateFeedingTime={monitoring.actions.updateFeedingTime}
          />
        </>
      ) : null}
    </View>
  );
}

type MonitoringState = ReturnType<typeof useMonitoringScreen>;

type CommandButtonProps = {
  field: SystemField;
  icon: ComponentType<any>;
  monitoring: MonitoringState;
  selectedAquariumId: string;
  tone: 'accent' | 'success' | 'warning';
};

function CommandButton({
  field,
  icon,
  monitoring,
  selectedAquariumId,
  tone,
}: CommandButtonProps) {
  const action = monitoring.manualActions?.[field];

  if (!action) {
    return null;
  }

  const actionKey = getManualActionKey(selectedAquariumId, field);
  const automationFilterActive =
    field === 'filter' &&
    Boolean(monitoring.automationEnabled) &&
    Boolean(monitoring.automationSettings) &&
    Boolean(
      monitoring.automationSettings && isFiltrationScheduledNow(monitoring.automationSettings)
    ) &&
    monitoring.selectedAquarium?.filter === 'Active';
  const displayAction = automationFilterActive
    ? {
        ...action,
        buttonLabel: 'Stop Filtration',
        status: 'Filtration automation active',
      }
    : action;

  return (
    <MonitoringActionButton
      disabled={displayAction.disabled}
      icon={icon}
      label={displayAction.buttonLabel}
      loading={monitoring.savingManualKey === actionKey}
      onPress={() => monitoring.actions.handleManualAction(field)}
      status={displayAction.status}
      tone={tone}
    />
  );
}

type AutomationPanelProps = {
  automationEnabled: boolean;
  clockIcon: ComponentType<any>;
  filterIcon: ComponentType<any>;
  lightIcon: ComponentType<any>;
  powerIcon: ComponentType<any>;
  saving: boolean;
  settings: NonNullable<MonitoringState['automationSettings']>;
  systemMode: SystemMode;
  timerIcon: ComponentType<any>;
  onConfigure: () => void;
  onToggle: () => void;
};

function AutomationPanel({
  automationEnabled,
  clockIcon,
  filterIcon,
  lightIcon,
  powerIcon: PowerIcon,
  saving,
  settings,
  systemMode,
  timerIcon,
  onConfigure,
  onToggle,
}: AutomationPanelProps) {
  const filtrationActive = automationEnabled && isFiltrationScheduledNow(settings);

  return (
    <View style={styles.automationStack}>
      <View style={[styles.automationBanner, automationEnabled ? styles.automationBannerOn : styles.automationBannerOff]}>
        <View style={styles.automationBannerCopy}>
          <PowerIcon
            size={18}
            stroke={filtrationActive ? mobileTheme.colors.success : automationEnabled ? mobileTheme.colors.success : mobileTheme.colors.warning}
          />
          <View style={styles.automationBannerText}>
            <Text style={styles.automationTitle}>
              {saving
                ? 'Saving automation...'
                : filtrationActive
                  ? 'Filtration Automation Active'
                  : automationEnabled
                    ? 'Automation On'
                    : 'Automation Off'}
            </Text>
            <Text style={styles.automationMeta}>
              {filtrationActive
                ? systemMode === 'manual'
                  ? 'Filtration is running now. You can stop it from the Manual filter control.'
                  : 'Filtration is running now according to the saved schedule.'
                : automationEnabled
                  ? 'Device follows the saved schedule'
                  : 'Schedules are paused'}
            </Text>
          </View>
        </View>

        <Pressable
          disabled={saving}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.switchTrack,
            automationEnabled && styles.switchTrackOn,
            saving && styles.disabled,
            pressed && !saving && styles.pressed,
          ]}
        >
          <View style={[styles.switchThumb, automationEnabled && styles.switchThumbOn]} />
        </Pressable>
      </View>

      <Pressable
        onPress={onConfigure}
        style={({ pressed }) => [styles.configureButton, pressed && styles.pressed]}
      >
        <Settings2Icon />
        <Text style={styles.configureButtonText}>Configure Automation</Text>
      </Pressable>

      <View style={styles.automationGrid}>
        <AutomationInfoTile
          icon={clockIcon}
          label="Feeding"
          value={formatAutomationTimes(settings.feedingTimes)}
        />
        <AutomationInfoTile
          icon={filterIcon}
          label="Filtration"
          value={`${formatAutomationTime(settings.filtrationStartTime)} / ${settings.filtrationRuntimeHours}h`}
        />
        <AutomationInfoTile
          icon={lightIcon}
          label="Lighting"
          value={`${formatAutomationTime(settings.lightOnTime)} to ${formatAutomationTime(settings.lightOffTime)}`}
        />
      </View>
    </View>
  );
}

function Settings2Icon() {
  const Icon = Settings2 as ComponentType<any>;

  return <Icon size={16} stroke={mobileTheme.colors.background} />;
}

type AutomationEditorProps = {
  aquariumName: string;
  closeIcon: ComponentType<any>;
  draft: MonitoringState['automationDraft'];
  error: string;
  plusIcon: ComponentType<any>;
  saving: boolean;
  saveIcon: ComponentType<any>;
  trashIcon: ComponentType<any>;
  onAddFeedingTime: () => void;
  onCancel: () => void;
  onDraftChange: MonitoringState['actions']['updateAutomationDraft'];
  onRemoveFeedingTime: (index: number) => void;
  onSave: () => void;
  onUpdateFeedingTime: (index: number, value: string) => void;
};

type AutomationEditorModalProps = AutomationEditorProps & {
  visible: boolean;
};

function AutomationEditorModal({
  visible,
  onCancel,
  aquariumName,
  ...editorProps
}: AutomationEditorModalProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onCancel} />
        <View style={styles.modalSheet}>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <AutomationEditor {...editorProps} aquariumName={aquariumName} onCancel={onCancel} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AutomationEditor({
  aquariumName,
  closeIcon: CloseIcon,
  draft,
  error,
  plusIcon: PlusIcon,
  saving,
  saveIcon: SaveIcon,
  trashIcon: TrashIcon,
  onAddFeedingTime,
  onCancel,
  onDraftChange,
  onRemoveFeedingTime,
  onSave,
  onUpdateFeedingTime,
}: AutomationEditorProps) {
  const FeedingIcon = Fish as ComponentType<any>;
  const LightingIcon = Lightbulb as ComponentType<any>;
  const FiltrationIcon = Wind as ComponentType<any>;
  const ClockIcon = Clock as ComponentType<any>;

  return (
    <View style={styles.editorPanel}>
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.editorTitle}>Edit Automation</Text>
          <Text style={styles.editorSubtitle}>{aquariumName}</Text>
        </View>
        <Pressable
          disabled={saving}
          onPress={onCancel}
          style={({ pressed }) => [styles.iconButton, pressed && !saving && styles.pressed, saving && styles.disabled]}
        >
          <CloseIcon size={17} stroke={mobileTheme.colors.textMuted} />
        </Pressable>
      </View>

      {error ? <Text style={styles.editorError}>{error}</Text> : null}

      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionIconBubble}>
              <FeedingIcon size={17} stroke={mobileTheme.colors.accent} />
            </View>
            <Text style={styles.sectionHeaderTitle}>Feeding Schedule</Text>
          </View>
          <Pressable
            disabled={saving}
            onPress={onAddFeedingTime}
            style={({ pressed }) => [styles.plusButton, pressed && !saving && styles.pressed, saving && styles.disabled]}
          >
            <PlusIcon size={18} stroke={mobileTheme.colors.background} />
          </Pressable>
        </View>

        {draft.feedingTimes.map((feedingTime, index) => (
          <View key={`feeding-time-${index}`} style={styles.feedTimeRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.inputLabel}>Feeding time {index + 1}</Text>
              <AutomationTimeControl
                clockIcon={ClockIcon}
                disabled={saving}
                value={feedingTime}
                trailingAction={{
                  icon: TrashIcon,
                  disabled: saving || draft.feedingTimes.length === 1,
                  onPress: () => onRemoveFeedingTime(index),
                }}
                onChange={(value) => onUpdateFeedingTime(index, value)}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionIconBubble}>
              <LightingIcon size={17} stroke={mobileTheme.colors.warning} />
            </View>
            <Text style={styles.sectionHeaderTitle}>Lighting Automation</Text>
          </View>
        </View>
        <Text style={styles.sectionBody}>
          Set when the aquarium light turns on and off automatically. Manual light control is still available
          from Monitoring.
        </Text>
        <View style={styles.filterColumn}>
          <View style={styles.timeBlockHalf}>
            <Text style={styles.inputLabel}>Start time</Text>
            <AutomationTimeControl
              clockIcon={ClockIcon}
              disabled={saving}
              value={draft.lightOnTime}
              onChange={(value) => onDraftChange('lightOnTime', value)}
            />
          </View>

          <View style={styles.timeBlockHalf}>
            <Text style={styles.inputLabel}>End time</Text>
            <AutomationTimeControl
              clockIcon={ClockIcon}
              disabled={saving}
              value={draft.lightOffTime}
              onChange={(value) => onDraftChange('lightOffTime', value)}
            />
          </View>
        </View>
      </View>

      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionIconBubble}>
              <FiltrationIcon size={17} stroke={mobileTheme.colors.success} />
            </View>
            <Text style={styles.sectionHeaderTitle}>Filtration Settings</Text>
          </View>
        </View>
        <View style={styles.filterColumn}>
          <View style={styles.timeBlockHalf}>
            <Text style={styles.inputLabel}>Start time</Text>
            <AutomationTimeControl
              clockIcon={ClockIcon}
              disabled={saving}
              value={draft.filtrationStartTime}
              onChange={(value) => onDraftChange('filtrationStartTime', value)}
            />
          </View>

          <View style={styles.runtimeBlock}>
            <Text style={styles.inputLabel}>Runtime hours</Text>
            <TextInput
              editable={!saving}
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={(value) => onDraftChange('filtrationRuntimeHours', Number(value || 0))}
              placeholder="8"
              placeholderTextColor={mobileTheme.colors.textMuted}
              style={styles.runtimeInput}
              value={String(draft.filtrationRuntimeHours)}
            />
          </View>
        </View>
      </View>

      <View style={styles.editorActions}>
        <Pressable
          disabled={saving}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelButton, pressed && !saving && styles.pressed, saving && styles.disabled]}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={saving}
          onPress={onSave}
          style={({ pressed }) => [styles.saveButton, pressed && !saving && styles.pressed, saving && styles.disabled]}
        >
          <SaveIcon size={15} stroke={mobileTheme.colors.background} />
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Settings'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type TimePeriod = 'AM' | 'PM';

type TimeParts = {
  hour12: number;
  minute: number;
  period: TimePeriod;
};

type AutomationTimeControlProps = {
  clockIcon: ComponentType<any>;
  disabled: boolean;
  trailingAction?: {
    icon: ComponentType<any>;
    disabled?: boolean;
    onPress: () => void;
  };
  value: string;
  onChange: (value: string) => void;
};

function AutomationTimeControl({
  clockIcon: ClockIcon,
  disabled,
  trailingAction,
  value,
  onChange,
}: AutomationTimeControlProps) {
  const TrailingIcon = trailingAction?.icon;
  const timeParts = getTimeParts(value);
  const [pickerField, setPickerField] = useState<TimeField | null>(null);

  const updateTime = (updates: Partial<TimeParts>) => {
    onChange(formatTimePartsForStorage({ ...timeParts, ...updates }));
  };
  const openPicker = (field: TimeField) => {
    if (!disabled) {
      setPickerField(field);
    }
  };
  const closePicker = () => setPickerField(null);
  const selectHour = (hour12: number) => {
    updateTime({ hour12 });
    closePicker();
  };
  const selectMinute = (minute: number) => {
    updateTime({ minute });
    closePicker();
  };
  const selectPeriod = (period: TimePeriod) => {
    updateTime({ period });
    closePicker();
  };

  return (
    <>
      <View style={[styles.feedingTimeControl, disabled && styles.disabled]}>
        <Pressable
          disabled={disabled}
          onPress={() => openPicker('hour')}
          style={({ pressed }) => [styles.timePickerBox, pressed && !disabled && styles.pressed]}
        >
          <Text style={styles.timePickerValue}>{String(timeParts.hour12).padStart(2, '0')}</Text>
        </Pressable>

        <Text style={styles.timeColon}>:</Text>

        <Pressable
          disabled={disabled}
          onPress={() => openPicker('minute')}
          style={({ pressed }) => [styles.timePickerBox, pressed && !disabled && styles.pressed]}
        >
          <Text style={styles.timePickerValue}>{String(timeParts.minute).padStart(2, '0')}</Text>
        </Pressable>

        <Pressable
          disabled={disabled}
          onPress={() => openPicker('period')}
          style={({ pressed }) => [styles.periodBox, pressed && !disabled && styles.pressed]}
        >
          <Text style={styles.periodBoxText}>{timeParts.period}</Text>
        </Pressable>

        {trailingAction ? (
          <Pressable
            disabled={disabled || Boolean(trailingAction.disabled)}
            onPress={trailingAction.onPress}
            style={({ pressed }) => [
              styles.inlineActionButton,
              (disabled || trailingAction.disabled) && styles.disabled,
              pressed && !disabled && !trailingAction.disabled && styles.pressed,
            ]}
          >
            {TrailingIcon ? <TrailingIcon size={15} stroke={mobileTheme.colors.textMuted} /> : null}
          </Pressable>
        ) : (
          <View style={styles.timeControlIcon}>
            <ClockIcon size={15} stroke={mobileTheme.colors.background} />
          </View>
        )}
      </View>

      <TimePickerModal
        field={pickerField}
        value={timeParts}
        onClose={closePicker}
        onSelectHour={selectHour}
        onSelectMinute={selectMinute}
        onSelectPeriod={selectPeriod}
      />
    </>
  );
}

type TimeField = 'hour' | 'minute' | 'period';

type TimePickerModalProps = {
  field: TimeField | null;
  value: TimeParts;
  onClose: () => void;
  onSelectHour: (hour: number) => void;
  onSelectMinute: (minute: number) => void;
  onSelectPeriod: (period: TimePeriod) => void;
};

function TimePickerModal({
  field,
  value,
  onClose,
  onSelectHour,
  onSelectMinute,
  onSelectPeriod,
}: TimePickerModalProps) {
  const CloseIcon = X as ComponentType<any>;

  if (!field) {
    return null;
  }

  const title =
    field === 'hour' ? 'Choose hour' : field === 'minute' ? 'Choose minute' : 'Choose AM/PM';
  const options =
    field === 'hour'
      ? Array.from({ length: 12 }, (_, index) => index + 1)
      : field === 'minute'
        ? Array.from({ length: 60 }, (_, index) => index)
        : (['AM', 'PM'] as const);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.timePickerOverlay}>
        <Pressable style={styles.timePickerBackdrop} onPress={onClose} />
        <View style={styles.timePickerSheet}>
          <View style={styles.timePickerHeader}>
            <Text style={styles.timePickerTitle}>{title}</Text>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <CloseIcon size={16} stroke={mobileTheme.colors.textMuted} />
            </Pressable>
          </View>

          {field === 'period' ? (
            <View style={styles.timePickerToggleRow}>
              {options.map((option) => {
                const isSelected = value.period === option;

                return (
                  <Pressable
                    key={String(option)}
                    onPress={() => onSelectPeriod(option as TimePeriod)}
                    style={({ pressed }) => [
                      styles.timePickerToggle,
                      isSelected && styles.timePickerOptionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.timePickerOptionText,
                        isSelected && styles.timePickerOptionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <WheelPicker
              items={options as number[]}
              selectedItem={field === 'hour' ? value.hour12 : value.minute}
              onSelect={(item) => {
                if (field === 'hour') {
                  onSelectHour(item);
                  return;
                }

                onSelectMinute(item);
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

type WheelPickerProps = {
  items: number[];
  selectedItem: number;
  onSelect: (item: number) => void;
};

function WheelPicker({ items, selectedItem, onSelect }: WheelPickerProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const selectedIndex = Math.max(0, items.indexOf(selectedItem));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: selectedIndex * WHEEL_ITEM_HEIGHT,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);

  return (
    <View style={styles.wheelPickerShell}>
      <ScrollView
        ref={scrollRef}
        decelerationRate="fast"
        onMomentumScrollEnd={({ nativeEvent }) => {
          const nextIndex = clamp(
            Math.round(nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT),
            0,
            items.length - 1
          );
          const nextValue = items[nextIndex];
          if (typeof nextValue === 'number') {
            onSelect(nextValue);
          }
        }}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        snapToAlignment="start"
        contentContainerStyle={styles.wheelPickerContent}
      >
        {items.map((item) => {
          const isSelected = item === selectedItem;

          return (
            <Pressable
              key={String(item)}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [
                styles.wheelPickerItem,
                isSelected && styles.wheelPickerItemActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.timePickerOptionText,
                  isSelected && styles.timePickerOptionTextActive,
                ]}
              >
                {String(item).padStart(2, '0')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View pointerEvents="none" style={styles.wheelPickerFocus} />
    </View>
  );
}

type AutomationInfoTileProps = {
  icon: ComponentType<any>;
  label: string;
  value: string;
  tone?: 'accent' | 'success' | 'warning';
};

function AutomationInfoTile({
  icon: Icon,
  label,
  value,
  tone = 'accent',
}: AutomationInfoTileProps) {
  const color =
    tone === 'success'
      ? mobileTheme.colors.success
      : tone === 'warning'
        ? mobileTheme.colors.warning
        : mobileTheme.colors.accent;

  return (
    <View style={styles.automationTile}>
      <View style={styles.automationTileHeader}>
        <Icon size={16} stroke={color} />
        <Text style={styles.automationTileLabel}>{label}</Text>
      </View>
      <Text style={[styles.automationTileValue, { color }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

type SummaryCellProps = {
  label: string;
  value: string;
  tone?: 'accent' | 'success' | 'warning';
};

function SummaryCell({ label, value, tone = 'accent' }: SummaryCellProps) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          tone === 'success' && styles.successText,
          tone === 'warning' && styles.warningText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

type StatusPillProps = {
  label: string;
  tone: 'success' | 'warning';
};

function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <View style={[styles.statusPill, tone === 'success' ? styles.statusSuccess : styles.statusWarning]}>
      <Text style={[styles.statusText, tone === 'success' ? styles.successText : styles.warningText]}>
        {label}
      </Text>
    </View>
  );
}

type TankChipProps = {
  aquarium: MonitoringAquarium;
  active: boolean;
  onPress: () => void;
};

function TankChip({ aquarium, active, onPress }: TankChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tankChip, active && styles.tankChipActive, pressed && styles.pressed]}
    >
      <View style={[styles.statusDot, aquarium.telemetryState === 'live' && styles.statusDotLive]} />
      <View style={styles.tankChipCopy}>
        <Text style={[styles.tankChipTitle, active && styles.tankChipTitleActive]} numberOfLines={1}>
          {aquarium.name}
        </Text>
        <Text style={styles.tankChipMeta} numberOfLines={1}>
          {aquarium.hasFreshTelemetry ? `${Math.round(aquarium.level)}% level` : 'Waiting for telemetry'}
        </Text>
      </View>
    </Pressable>
  );
}

type ConnectionNoticeProps = {
  message: string;
  realtimeEnabled: boolean;
};

function ConnectionNotice({ message, realtimeEnabled }: ConnectionNoticeProps) {
  const Icon = (realtimeEnabled ? Wifi : WifiOff) as ComponentType<any>;

  return (
    <View style={[styles.connectionNotice, !realtimeEnabled && styles.connectionWarning]}>
      <Icon
        size={16}
        stroke={realtimeEnabled ? mobileTheme.colors.success : mobileTheme.colors.warning}
      />
      <Text style={styles.connectionText}>{message}</Text>
    </View>
  );
}

type MetricRowProps = {
  detail: string;
  label: string;
  tone?: 'accent' | 'warning' | 'danger';
  value: string;
};

function MetricRow({ detail, label, tone = 'accent', value }: MetricRowProps) {
  return (
    <View style={styles.metricRow}>
      <View>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text
          style={[
            styles.metricDetail,
            tone === 'warning' && styles.metricWarning,
            tone === 'danger' && styles.metricDanger,
          ]}
        >
          {detail}
        </Text>
      </View>
      <Text
        style={[
          styles.metricValue,
          tone === 'warning' && styles.metricWarning,
          tone === 'danger' && styles.metricDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function formatCommandType(type: string) {
  if (type === 'feed_now') return 'Feed now';
  if (type === 'set_light_state') return 'Light command';
  if (type === 'set_filter_state') return 'Filter command';
  if (type === 'sync_control') return 'Control sync';
  return type;
}

function getTimeParts(value: string): TimeParts {
  const formatted = formatAutomationTime(value);
  const match = formatted.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);

  if (!match) {
    return { hour12: 8, minute: 0, period: 'AM' };
  }

  return {
    hour12: clamp(Number(match[1]), 1, 12),
    minute: clamp(Number(match[2]), 0, 59),
    period: match[3] as TimePeriod,
  };
}

function formatTimePartsForStorage(parts: TimeParts) {
  const hour =
    parts.period === 'PM'
      ? parts.hour12 === 12
        ? 12
        : parts.hour12 + 12
      : parts.hour12 === 12
        ? 0
        : parts.hour12;

  return `${String(hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function isFiltrationScheduledNow(settings: NonNullable<MonitoringState['automationSettings']>) {
  const timeText = settings.filtrationStartTime;

  if (!timeText || timeText.length !== 5 || timeText.charAt(2) !== ':') {
    return false;
  }

  const startHour = Number(timeText.slice(0, 2));
  const startMinute = Number(timeText.slice(3, 5));
  const runtimeHours = Number(settings.filtrationRuntimeHours);

  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(runtimeHours) ||
    startHour < 0 ||
    startHour > 23 ||
    startMinute < 0 ||
    startMinute > 59 ||
    runtimeHours <= 0
  ) {
    return false;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  const runtimeMinutes = runtimeHours * 60;

  if (runtimeMinutes >= 1440) {
    return true;
  }

  const endMinutes = startMinutes + runtimeMinutes;

  if (endMinutes < 1440) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes - 1440;
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  centerState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mutedText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  refreshButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  refreshLabel: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyPanel: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    color: mobileTheme.colors.textMuted,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  summaryLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  summaryValue: {
    color: mobileTheme.colors.accent,
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
  },
  successText: {
    color: mobileTheme.colors.success,
  },
  warningText: {
    color: mobileTheme.colors.warning,
  },
  connectionNotice: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.successSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  connectionWarning: {
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  connectionText: {
    color: mobileTheme.colors.textMuted,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  tankScroller: {
    gap: 10,
    paddingRight: 2,
  },
  tankChip: {
    width: 178,
    minHeight: 62,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  tankChipActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  tankChipCopy: {
    flex: 1,
    gap: 2,
  },
  tankChipTitle: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  tankChipTitleActive: {
    color: mobileTheme.colors.accent,
  },
  tankChipMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.warning,
  },
  statusDotLive: {
    backgroundColor: mobileTheme.colors.success,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusSuccess: {
    backgroundColor: mobileTheme.colors.successSoft,
  },
  statusWarning: {
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  metricStack: {
    gap: 10,
  },
  metricRow: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricLabel: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  metricDetail: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  metricValue: {
    color: mobileTheme.colors.accent,
    fontSize: 20,
    fontWeight: '800',
  },
  metricWarning: {
    color: mobileTheme.colors.warning,
  },
  metricDanger: {
    color: mobileTheme.colors.danger,
  },
  helperText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  modeButtonActive: {
    backgroundColor: mobileTheme.colors.accent,
    borderColor: mobileTheme.colors.accent,
  },
  modeLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  modeLabelActive: {
    color: mobileTheme.colors.text,
  },
  actionStack: {
    gap: 10,
  },
  automationStack: {
    gap: 12,
  },
  automationBanner: {
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  automationBannerOn: {
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
  },
  automationBannerOff: {
    borderColor: mobileTheme.colors.warningBorder,
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  automationBannerCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  automationBannerText: {
    flex: 1,
    gap: 2,
  },
  automationTitle: {
    color: mobileTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  automationMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  switchTrackOn: {
    backgroundColor: mobileTheme.colors.success,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.text,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: mobileTheme.colors.background,
  },
  automationGrid: {
    gap: 10,
  },
  configureButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  configureButtonText: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  automationTile: {
    minHeight: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 12,
    gap: 8,
  },
  automationTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  automationTileLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  automationTileValue: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
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
    maxHeight: '88%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.background,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 18,
  },
  editorPanel: {
    borderRadius: 0,
    backgroundColor: mobileTheme.colors.background,
    gap: 18,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  editorTitle: {
    color: mobileTheme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  editorSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorError: {
    color: mobileTheme.colors.danger,
    fontSize: 12,
    lineHeight: 17,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sectionBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 14,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionHeaderTitle: {
    color: mobileTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionIconBubble: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBody: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  plusButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: mobileTheme.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  feedTimeRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  filterColumn: {
    flexDirection: 'column',
    gap: 12,
  },
  timeBlock: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  feedingTimeControl: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timePickerBox: {
    minWidth: 64,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: mobileTheme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerValue: {
    color: mobileTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  timeStepperGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  timeStepper: {
    flex: 1,
    minWidth: 72,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: mobileTheme.colors.surface,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeStepButton: {
    width: 24,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  timeStepButtonText: {
    color: mobileTheme.colors.accent,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  timeStepValue: {
    minWidth: 24,
    color: mobileTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  timeColon: {
    color: mobileTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  periodBox: {
    width: 34,
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: mobileTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  periodBoxText: {
    color: mobileTheme.colors.background,
    fontSize: 9,
    fontWeight: '900',
  },
  timeControlIcon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accent,
  },
  inlineActionButton: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  timePickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  timePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mobileTheme.colors.overlay,
  },
  timePickerSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.background,
    overflow: 'hidden',
  },
  timePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  timePickerTitle: {
    color: mobileTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  timePickerOptions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timePickerOption: {
    minWidth: 64,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerOptionActive: {
    backgroundColor: mobileTheme.colors.accent,
    borderColor: mobileTheme.colors.accent,
  },
  timePickerOptionText: {
    color: mobileTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  timePickerOptionTextActive: {
    color: mobileTheme.colors.background,
  },
  timePickerToggleRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 10,
  },
  timePickerToggle: {
    minWidth: 92,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelPickerShell: {
    height: WHEEL_HEIGHT,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    overflow: 'hidden',
  },
  wheelPickerContent: {
    paddingVertical: (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2,
  },
  wheelPickerItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
    borderRadius: 12,
  },
  wheelPickerItemActive: {
    backgroundColor: mobileTheme.colors.surface,
  },
  wheelPickerFocus: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mobileTheme.colors.accent,
    backgroundColor: 'transparent',
  },
  timeBlockHalf: {
    flex: 1,
    gap: 6,
  },
  timeInputShell: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: mobileTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  inputLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  runtimeBlock: {
    flex: 1,
    gap: 6,
  },
  runtimeInput: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    color: mobileTheme.colors.text,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  deleteButton: {
    alignSelf: 'flex-end',
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  saveButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: mobileTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveButtonText: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: mobileTheme.colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  disabled: {
    opacity: 0.7,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});
