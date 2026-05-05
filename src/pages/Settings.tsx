import { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Thermometer, Droplets, Waves, Beaker, Cloud, Bell, Mail, Monitor, Cpu, Wifi, Database, Info } from 'lucide-react';

const thresholds = [
  { label: 'Temperature Min', icon: Thermometer, value: 24, unit: '°C', color: 'text-orange-400' },
  { label: 'Temperature Max', icon: Thermometer, value: 28, unit: '°C', color: 'text-orange-400' },
  { label: 'Water Level Min', icon: Droplets, value: 70, unit: '%', color: 'text-blue-400' },
  { label: 'Water Quality Min', icon: Waves, value: 80, unit: '%', color: 'text-emerald-400' },
  { label: 'pH Min', icon: Beaker, value: 6.5, unit: '', color: 'text-purple-400' },
  { label: 'pH Max', icon: Beaker, value: 7.8, unit: '', color: 'text-purple-400' },
  { label: 'Turbidity Max', icon: Cloud, value: 25, unit: 'NTU', color: 'text-amber-400' },
];

export default function Settings() {
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    critical: true,
    warning: true,
    info: false,
    powerOutage: true,
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-cyan-400" />
              Threshold Configuration
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {thresholds.map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${t.color}`} />
                      <span className="text-sm text-slate-300">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        defaultValue={t.value}
                        className="w-20 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <span className="text-xs text-slate-500 w-8">{t.unit}</span>
                    </div>
                  </div>
                );
              })}
              <button className="w-full mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all">
                Save Thresholds
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              Notification Preferences
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
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifications({ ...notifications, [item.key]: !notifications[item.key as keyof typeof notifications] })}
                    className={`w-12 h-6 rounded-full transition-all duration-200 ${notifications[item.key as keyof typeof notifications] ? 'bg-cyan-600' : 'bg-slate-600'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-all duration-200 ${notifications[item.key as keyof typeof notifications] ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-slate-700">
              <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                Email Settings
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Notification Email</label>
                  <input type="email" defaultValue="admin@smartaqua.pro" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">SMS Number</label>
                  <input type="tel" defaultValue="+63 900 000 0000" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              System Information
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { icon: Wifi, label: 'IoT Protocol', value: 'MQTT' },
                { icon: Thermometer, label: 'Temperature Sensor', value: 'DS18B20' },
                { icon: Droplets, label: 'Water Level Sensor', value: 'Ultrasonic HC-SR04' },
                { icon: Waves, label: 'Water Quality Sensor', value: 'TDS Sensor Module' },
                { icon: Beaker, label: 'pH Sensor', value: 'pH-4502C' },
                { icon: Cloud, label: 'Turbidity Sensor', value: 'TSW-30' },
                { icon: Cpu, label: 'Microcontroller', value: 'ESP32' },
                { icon: Database, label: 'Database', value: 'Firebase / MySQL' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-400">{item.label}</span>
                    </div>
                    <span className="text-sm text-white font-medium">{item.value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Info className="w-5 h-5 text-cyan-400" />
              About SmartAqua Pro
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 rounded-lg p-4">
                <h4 className="text-lg font-bold text-white mb-1">SmartAqua Pro</h4>
                <p className="text-sm text-slate-400">IoT-Based Intelligent Aquarium Monitoring, Automation, and Management System</p>
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
              <div className="pt-3 border-t border-slate-700">
                <p className="text-xs text-slate-500 mb-2">Developers:</p>
                <div className="flex flex-wrap gap-2">
                  {['Dennis Mark L. Jamero', 'Wendyl Ziv S. Arellano', 'Gian Carlo R. Marin'].map((name) => (
                    <span key={name} className="px-3 py-1 bg-slate-700/50 rounded-full text-xs text-slate-300">{name}</span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}