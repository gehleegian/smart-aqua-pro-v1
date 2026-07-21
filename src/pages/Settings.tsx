import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Database,
  Cpu,
  Info,
  PencilLine,
  Thermometer,
  Droplets,
  Waves,
  Beaker,
  UserRound,
} from 'lucide-react';
import { auth } from '../firebase';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import ProfileModal from '../components/settings/ProfileModal';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../services/userService';
import type { UserData } from '../types/user';

export default function Settings() {
  const [notifications, setNotifications] = useState({
    enabled: true,
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
              <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                <UserRound className="h-5 w-5 text-cyan-400" />
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
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {profileError}
              </div>
            ) : null}
            {profileSuccess ? (
              <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {profileSuccess}
              </div>
            ) : null}

            {profileLoading ? (
              <p className="text-sm text-slate-400">Loading profile...</p>
            ) : profile ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Full Name</p>
                  <p className="text-sm text-slate-200">{profile.fullName || profile.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
                  <p className="text-sm text-slate-200">{profile.email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Contact Number</p>
                  <p className="text-sm text-slate-200">{profile.contactNumber || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Role</p>
                  <p className="text-sm text-slate-200">{profile.role}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Account Status</p>
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
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Bell className="w-5 h-5 text-amber-400" />
              Notification Preferences
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Notifications Enabled</p>
                  <p className="text-xs text-slate-500">Master switch for all notification types</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setNotifications((prev) => ({
                      ...prev,
                      enabled: !prev.enabled,
                    }))
                  }
                  className={`h-6 w-12 rounded-full transition-all duration-200 ${
                    notifications.enabled ? 'bg-cyan-600' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded-full bg-white transition-all duration-200 ${
                      notifications.enabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div
                className={`rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 ${
                  notifications.enabled ? '' : 'opacity-60'
                }`}
              >
                <div className="mb-3">
                  <p className="text-sm font-medium text-white">Severity</p>
                  <p className="text-xs text-slate-500">Choose which alert levels you want</p>
                </div>
                <div className="space-y-3">
                  {[
                    { key: 'critical', label: 'Critical Alerts', desc: 'Power outage, system failure' },
                    { key: 'warning', label: 'Warning Alerts', desc: 'Parameter out of range' },
                    { key: 'info', label: 'Info Notifications', desc: 'Feeding completed, routine events' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-white">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        disabled={!notifications.enabled}
                        onClick={() =>
                          setNotifications({
                            ...notifications,
                            [item.key]: !notifications[item.key as keyof typeof notifications],
                          })
                        }
                        className={`h-6 w-12 rounded-full transition-all duration-200 ${
                          notifications[item.key as keyof typeof notifications]
                            ? 'bg-cyan-600'
                            : 'bg-slate-600'
                        } ${notifications.enabled ? '' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <div
                          className={`h-5 w-5 rounded-full bg-white transition-all duration-200 ${
                            notifications[item.key as keyof typeof notifications]
                              ? 'translate-x-6'
                              : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={`rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 ${
                  notifications.enabled ? '' : 'opacity-60'
                }`}
              >
                <div className="mb-3">
                  <p className="text-sm font-medium text-white">Advanced Events</p>
                  <p className="text-xs text-slate-500">Extra system events outside the main severity levels</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">Power Outage Alerts</p>
                    <p className="text-xs text-slate-500">Immediate notification on power loss</p>
                  </div>
                  <button
                    type="button"
                    disabled={!notifications.enabled}
                    onClick={() =>
                      setNotifications({
                        ...notifications,
                        powerOutage: !notifications.powerOutage,
                      })
                    }
                    className={`h-6 w-12 rounded-full transition-all duration-200 ${
                      notifications.powerOutage ? 'bg-cyan-600' : 'bg-slate-600'
                    } ${notifications.enabled ? '' : 'cursor-not-allowed opacity-60'}`}
                  >
                    <div
                      className={`h-5 w-5 rounded-full bg-white transition-all duration-200 ${
                        notifications.powerOutage ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
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
                  <div key={item.label} className="flex items-center justify-between py-2">
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
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Info className="w-5 h-5 text-cyan-400" />
              About SmartAqua Pro
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-cyan-500/30 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 p-4">
                <h4 className="mb-1 text-lg font-bold text-white">SmartAqua Pro</h4>
                <p className="text-sm text-slate-400">
                  IoT-Based Intelligent Aquarium Monitoring, Automation, and Management System
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Institution</span>
                  <span className="text-white">Davao del Norte State College</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Department</span>
                  <span className="text-white">Institute of Computing</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Location</span>
                  <span className="text-white">Panabo City, Davao del Norte</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Degree</span>
                  <span className="text-white">BS Information Technology</span>
                </div>
              </div>
              <div className="border-t border-slate-700 pt-3">
                <p className="mb-2 text-xs text-slate-500">Developers:</p>
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
