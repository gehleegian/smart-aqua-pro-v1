import { useEffect, useState } from 'react';
import {
  Bell,
  Beaker,
  Cpu,
  Database,
  Droplets,
  Info,
  LogOut,
  Mail,
  PencilLine,
  Thermometer,
  Waves,
} from 'lucide-react-native';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import SectionCard from '../components/common/SectionCard';
import { auth } from '../services/firebase';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../services/userService';
import { mobileTheme } from '../theme';
import type { UserData } from '@smartaqua/shared';

const PencilLineIcon = PencilLine as any;
const MailIcon = Mail as any;
const LogOutIcon = LogOut as any;

type NotificationState = {
  enabled: boolean;
  email: boolean;
  push: boolean;
  critical: boolean;
  warning: boolean;
  info: boolean;
  powerOutage: boolean;
};

type SettingsScreenProps = {
  signingOut?: boolean;
  onSignOut: () => Promise<void>;
};

export default function SettingsScreen({ signingOut = false, onSignOut }: SettingsScreenProps) {
  const [profile, setProfile] = useState<UserData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [notifications, setNotifications] = useState<NotificationState>({
    enabled: true,
    email: true,
    push: true,
    critical: true,
    warning: true,
    info: false,
    powerOutage: true,
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setProfileLoading(true);
        setProfileError('');

        const currentUser = auth.currentUser ? await getCurrentUserProfile(auth.currentUser.uid) : null;

        setProfile(currentUser);
        setFullName(currentUser?.fullName || currentUser?.name || '');
        setContactNumber(currentUser?.contactNumber || '');
      } catch (error) {
        console.error(error);
        setProfileError('Failed to load profile details.');
      } finally {
        setProfileLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const openProfileModal = () => {
    setProfileError('');
    setProfileSuccess('');
    setFullName(profile?.fullName || profile?.name || '');
    setContactNumber(profile?.contactNumber || '');
    setProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setProfileError('');
  };

  const saveProfile = async () => {
    try {
      setSavingProfile(true);
      setProfileError('');
      setProfileSuccess('');

      const trimmedName = fullName.trim();

      if (!trimmedName) {
        setProfileError('Full name is required.');
        return;
      }

      const updatedProfile = await updateCurrentUserProfile({
        fullName: trimmedName,
        contactNumber: contactNumber.trim(),
      });

      setProfile(updatedProfile);
      setProfileModalOpen(false);
      setProfileSuccess('Profile updated successfully.');
    } catch (error) {
      console.error(error);
      setProfileError('Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {profileError ? (
          <View style={styles.alert}>
            <Text style={styles.alertText}>{profileError}</Text>
          </View>
        ) : null}

        {profileSuccess ? (
          <View style={styles.success}>
            <Text style={styles.successText}>{profileSuccess}</Text>
          </View>
        ) : null}

        <SectionCard
          title="Profile"
          subtitle="Manage your SmartAqua account details from the mobile app."
          action={
            <Pressable onPress={openProfileModal} style={styles.sectionAction}>
              <PencilLineIcon size={14} color={mobileTheme.colors.text} />
              <Text style={styles.sectionActionText}>Edit Profile</Text>
            </Pressable>
          }
        >
          {profileLoading ? (
            <Text style={styles.bodyText}>Loading profile...</Text>
          ) : profile ? (
            <View style={styles.profileGrid}>
              {[
                ['Full Name', profile.fullName || profile.name],
                ['Email', profile.email],
                ['Contact Number', profile.contactNumber || 'Not set'],
                ['Role', profile.role],
                ['Account Status', profile.accountStatus || 'active'],
              ].map(([label, value]) => (
                <View key={label} style={styles.profileField}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <Text style={styles.fieldValue}>{value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.bodyText}>No profile found.</Text>
          )}
        </SectionCard>

        <SectionCard title="Notification Preferences" subtitle="These toggles control local alert preferences.">
          <View style={styles.toggleStack}>
            <View style={styles.masterToggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>Notifications Enabled</Text>
                <Text style={styles.toggleDesc}>Master switch for all notification types</Text>
              </View>
              <Switch
                value={notifications.enabled}
                onValueChange={() =>
                  setNotifications((current) => ({
                    ...current,
                    enabled: !current.enabled,
                  }))
                }
                thumbColor={mobileTheme.colors.text}
                trackColor={{
                  false: mobileTheme.colors.surfaceAlt,
                  true: mobileTheme.colors.accent,
                }}
              />
            </View>

            <View style={[styles.preferenceGroup, !notifications.enabled && styles.groupDisabled]}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>Severity</Text>
                <Text style={styles.groupSubtitle}>Choose which alert levels you want</Text>
              </View>

              <View style={styles.toggleList}>
                {[
                  { key: 'critical', label: 'Critical Alerts', desc: 'Power outage, system failure' },
                  { key: 'warning', label: 'Warning Alerts', desc: 'Parameter out of range' },
                  { key: 'info', label: 'Info Notifications', desc: 'Feeding completed, routine events' },
                ].map((item) => (
                  <View key={item.key} style={styles.toggleRow}>
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleLabel}>{item.label}</Text>
                      <Text style={styles.toggleDesc}>{item.desc}</Text>
                    </View>
                    <Switch
                      disabled={!notifications.enabled}
                      value={notifications[item.key as keyof NotificationState]}
                      onValueChange={() =>
                        setNotifications((current) => ({
                          ...current,
                          [item.key]: !current[item.key as keyof NotificationState],
                        }))
                      }
                      thumbColor={mobileTheme.colors.text}
                      trackColor={{
                        false: mobileTheme.colors.surfaceAlt,
                        true: mobileTheme.colors.accent,
                      }}
                    />
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.preferenceGroup, !notifications.enabled && styles.groupDisabled]}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>Advanced Events</Text>
                <Text style={styles.groupSubtitle}>Extra system events outside the main severity levels</Text>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleLabel}>Power Outage Alerts</Text>
                  <Text style={styles.toggleDesc}>Immediate notification on power loss</Text>
                </View>
                <Switch
                  disabled={!notifications.enabled}
                  value={notifications.powerOutage}
                  onValueChange={() =>
                    setNotifications((current) => ({
                      ...current,
                      powerOutage: !current.powerOutage,
                    }))
                  }
                  thumbColor={mobileTheme.colors.text}
                  trackColor={{
                    false: mobileTheme.colors.surfaceAlt,
                    true: mobileTheme.colors.accent,
                  }}
                />
              </View>
            </View>
          </View>

          <View style={styles.emailBlock}>
            <View style={styles.emailHeader}>
              <MailIcon size={16} color={mobileTheme.colors.textMuted} />
              <Text style={styles.emailTitle}>Email Settings</Text>
            </View>
            <TextInput
              defaultValue="admin@smartaqua.pro"
              placeholder="Notification email"
              placeholderTextColor={mobileTheme.colors.textMuted}
              style={styles.input}
            />
            <TextInput
              defaultValue="+63 900 000 0000"
              placeholder="SMS number"
              placeholderTextColor={mobileTheme.colors.textMuted}
              style={styles.input}
            />
          </View>
        </SectionCard>

        <SectionCard title="System Information" subtitle="Reference hardware and services used by the system.">
          <View style={styles.infoList}>
            {[
              { icon: Database, label: 'Database', value: 'Firestore / Realtime Database' },
              { icon: Thermometer, label: 'Temperature Sensor', value: 'DS18B20' },
              { icon: Droplets, label: 'Water Level Sensor', value: 'Analog Water Level Sensor' },
              { icon: Waves, label: 'Water Purity Sensor', value: 'TDS Sensor Module' },
              { icon: Beaker, label: 'pH Sensor', value: 'pH-4502C' },
              { icon: Cpu, label: 'Microcontroller', value: 'ESP32' },
            ].map((item) => {
              const Icon = item.icon as any;

              return (
              <View key={item.label} style={styles.infoRow}>
                  <View style={styles.infoLeft}>
                    <Icon size={16} color={mobileTheme.colors.textMuted} />
                    <Text style={styles.infoLabel}>{item.label}</Text>
                  </View>
                  <Text style={styles.infoValue}>{item.value}</Text>
                </View>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard title="About SmartAqua Pro" subtitle="Project and deployment details.">
          <View style={styles.aboutBox}>
            <Text style={styles.aboutTitle}>SmartAqua Pro</Text>
            <Text style={styles.aboutBody}>
              IoT-Based Intelligent Aquarium Monitoring, Automation, and Management System
            </Text>
          </View>
          <View style={styles.aboutList}>
            {[
              ['Institution', 'Davao del Norte State College'],
              ['Department', 'Institute of Computing'],
              ['Location', 'Panabo City, Davao del Norte'],
              ['Degree', 'BS Information Technology'],
            ].map(([label, value]) => (
              <View key={label} style={styles.aboutRow}>
                <Text style={styles.aboutKey}>{label}</Text>
                <Text style={styles.aboutValue}>{value}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title="Account" subtitle="Sign out from this mobile device.">
          <Pressable
            disabled={signingOut}
            onPress={() => void onSignOut()}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && !signingOut && styles.pressed,
              signingOut && styles.disabled,
            ]}
          >
            <LogOutIcon size={16} color={mobileTheme.colors.danger} />
            <Text style={styles.signOutText}>{signingOut ? 'Signing out...' : 'Sign Out'}</Text>
          </Pressable>
        </SectionCard>
      </ScrollView>

      <Modal transparent visible={profileModalOpen} animationType="fade" onRequestClose={closeProfileModal}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeProfileModal} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalSubtitle}>Update your account details.</Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Full Name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={mobileTheme.colors.textMuted}
                style={styles.modalInput}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Contact Number</Text>
              <TextInput
                value={contactNumber}
                onChangeText={setContactNumber}
                placeholder="Enter your contact number"
                placeholderTextColor={mobileTheme.colors.textMuted}
                style={styles.modalInput}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={closeProfileModal} style={styles.modalGhostButton}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void saveProfile()} style={styles.modalPrimaryButton}>
                <Text style={styles.modalPrimaryText}>
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 24,
  },
  alert: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
    padding: 12,
  },
  alertText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
  },
  success: {
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
  bodyText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  sectionActionText: {
    color: mobileTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  profileGrid: {
    gap: 12,
  },
  profileField: {
    gap: 4,
  },
  fieldLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  fieldValue: {
    color: mobileTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  toggleList: {
    gap: 12,
  },
  toggleStack: {
    gap: 12,
  },
  masterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  preferenceGroup: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 14,
    gap: 12,
  },
  groupDisabled: {
    opacity: 0.6,
  },
  groupHeader: {
    gap: 2,
  },
  groupTitle: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  groupSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleDesc: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  emailBlock: {
    marginTop: 6,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.colors.border,
    paddingTop: 14,
  },
  emailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emailTitle: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    color: mobileTheme.colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  infoList: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  infoLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  infoValue: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  aboutBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 14,
    gap: 6,
  },
  aboutTitle: {
    color: mobileTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  aboutBody: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  aboutIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aboutList: {
    gap: 8,
    marginTop: 12,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  aboutKey: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  aboutValue: {
    color: mobileTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  signOutButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  signOutText: {
    color: mobileTheme.colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.7,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mobileTheme.colors.overlay,
  },
  modalSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.background,
    padding: 18,
    gap: 12,
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
  modalField: {
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
});
