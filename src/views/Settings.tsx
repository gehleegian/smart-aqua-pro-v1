import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Database,
  Cpu,
  Info,
  Mail,
  PencilLine,
  Thermometer,
  Droplets,
  Waves,
  Beaker,
  UserRound,
} from 'lucide-react';
import { auth } from '../firebase';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingState from '../components/ui/LoadingState';
import Toggle from '../components/ui/Toggle';
import ProfileModal from '../components/settings/ProfileModal';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../services/userService';
import type { UserData } from '../types/user';
import StatusMessage from '../components/ui/StatusMessage';

export default function Settings() {
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    critical: true,
    warning: true,
    info: false,
    powerOutage: true,
  });
  const [profile, setProfile] = useState<UserData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setProfileLoading(true);
      setProfileError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setProfile(null);
        return;
      }

      const userProfile = await getCurrentUserProfile(currentUser.uid);

      if (!userProfile) {
        setProfile(null);
        return;
      }

      setProfile(userProfile);
      setFullName(userProfile.fullName || userProfile.name || '');
      setContactNumber(userProfile.contactNumber || '');
    } catch (error) {
      console.error(error);
      setProfileError('Failed to load profile details.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

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

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      setProfileError('');
      setProfileSuccess('');

      const trimmedName = fullName.trim();
      const trimmedContact = contactNumber.trim();

      if (!trimmedName) {
        setProfileError('Full name is required.');
        return;
      }

      const updatedProfile = await updateCurrentUserProfile({
        fullName: trimmedName,
        contactNumber: trimmedContact,
      });

      setProfile(updatedProfile);
      setFullName(updatedProfile.fullName || updatedProfile.name || '');
      setContactNumber(updatedProfile.contactNumber || '');
      setProfileModalOpen(false);
      setProfileSuccess('Profile updated successfully.');
      window.dispatchEvent(new CustomEvent('smartaqua:userProfileUpdated'));
    } catch (error) {
      console.error(error);
      setProfileError('Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                <UserRound className="h-5 w-5 text-teal-200" />
                Profile
              </h3>
              <Button type="button" variant="secondary" size="sm" onClick={openProfileModal}>
                <PencilLine className="h-4 w-4" />
                Edit Profile
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {profileError ? (
              <StatusMessage variant="error">{profileError}</StatusMessage>
            ) : null}
            {profileSuccess ? (
              <StatusMessage variant="success">{profileSuccess}</StatusMessage>
            ) : null}

            {profileLoading ? (
              <LoadingState label="Loading profile..." />
            ) : profile ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Full Name</p>
                  <p className="text-sm text-slate-200">{profile.fullName || profile.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Email</p>
                  <p className="text-sm text-slate-200">{profile.email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Contact Number</p>
                  <p className="text-sm text-slate-200">{profile.contactNumber || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Role</p>
                  <p className="text-sm text-slate-200">{profile.role}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Account Status</p>
                  <p className="text-sm text-slate-200">{profile.accountStatus || 'active'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No profile found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <Bell className="w-5 h-5 text-amber-400" />
              Notification Preferences
              <Badge>Sample data</Badge>
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { key: 'email', label: 'Email Notifications', desc: 'Receive alerts via email' },
                { key: 'push', label: 'Push Notifications', desc: 'Browser push notifications' },
                { key: 'critical', label: 'Critical Alerts', desc: 'Power outage, system failure' },
                { key: 'warning', label: 'Warning Alerts', desc: 'Parameter out of range' },
                { key: 'info', label: 'Info Notifications', desc: 'Feeding completed, routine events' },
                { key: 'powerOutage', label: 'Power Outage Alerts', desc: 'Immediate notification on power loss' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                  <Toggle
                    checked={notifications[item.key as keyof typeof notifications]}
                    label={item.label}
                    onChange={() =>
                      setNotifications({
                        ...notifications,
                        [item.key]: !notifications[item.key as keyof typeof notifications],
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-slate-700 pt-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <Mail className="w-4 h-4 text-slate-400" />
                Email Settings
              </h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="settings-notification-email" className="mb-1 block text-xs text-slate-400">Notification Email</label>
                  <input
                    id="settings-notification-email"
                    type="email"
                    defaultValue="admin@smartaqua.pro"
                    className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300/30"
                  />
                </div>
                <div>
                  <label htmlFor="settings-sms-number" className="mb-1 block text-xs text-slate-400">SMS Number</label>
                  <input
                    id="settings-sms-number"
                    type="tel"
                    defaultValue="+63 900 000 0000"
                    className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300/30"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <Cpu className="w-5 h-5 text-purple-400" />
              System Information
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { icon: Database, label: 'Database', value: 'Firestore / Realtime Database' },
                { icon: Thermometer, label: 'Temperature Sensor', value: 'DS18B20' },
                { icon: Droplets, label: 'Water Level Sensor', value: 'Analog Water Level Sensor' },
                { icon: Waves, label: 'Water Purity Sensor', value: 'TDS Sensor Module' },
                { icon: Beaker, label: 'pH Sensor', value: 'pH-4502C' },
                { icon: Cpu, label: 'Microcontroller', value: 'ESP32' },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-400">{item.label}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{item.value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <Info className="h-5 w-5 text-teal-200" />
              About SmartAqua Pro
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-teal-300/25 bg-gradient-to-br from-teal-500/15 to-sky-600/10 p-4">
                <h4 className="mb-1 text-lg font-bold text-white">SmartAqua Pro</h4>
                <p className="text-sm text-slate-400">
                  IoT-Based Intelligent Aquarium Monitoring, Automation, and Management System
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap justify-between gap-x-4">
                  <span className="text-slate-400">Institution</span>
                  <span className="text-white">Davao del Norte State College</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <span className="text-slate-400">Department</span>
                  <span className="text-white">Institute of Computing</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <span className="text-slate-400">Location</span>
                  <span className="text-white">Panabo City, Davao del Norte</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <span className="text-slate-400">Degree</span>
                  <span className="text-white">BS Information Technology</span>
                </div>
              </div>
              <div className="border-t border-slate-700 pt-3">
                <p className="mb-2 text-xs text-slate-400">Developers:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Dennis Mark L. Jamero',
                    'Wendyl Ziv S. Arellano',
                    'Gian Carlo R. Marin',
                  ].map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-slate-700/50 px-3 py-1 text-xs text-slate-300"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ProfileModal
        open={profileModalOpen}
        profile={profile}
        fullName={fullName}
        contactNumber={contactNumber}
        saving={savingProfile}
        onClose={closeProfileModal}
        onSave={handleSaveProfile}
        onChangeFullName={setFullName}
        onChangeContactNumber={setContactNumber}
      />
    </div>
  );
}
