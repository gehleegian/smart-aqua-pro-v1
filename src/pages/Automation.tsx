import { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Fish, Sun, Wind, Zap, Settings, AlertTriangle } from 'lucide-react';

const feedingSchedules = [
  { id: 1, tank: 'Tropical Tank A', time: '8:00 AM', amount: '5g', enabled: true },
  { id: 2, tank: 'Tropical Tank A', time: '6:00 PM', amount: '5g', enabled: true },
  { id: 3, tank: 'Goldfish Tank B', time: '9:00 AM', amount: '3g', enabled: true },
  { id: 4, tank: 'Cichlid Tank C', time: '7:30 AM', amount: '4g', enabled: false },
  { id: 5, tank: 'Breeding Tank D', time: '8:00 AM', amount: '6g', enabled: true },
  { id: 6, tank: 'Breeding Tank D', time: '12:00 PM', amount: '4g', enabled: true },
  { id: 7, tank: 'Breeding Tank D', time: '6:00 PM', amount: '6g', enabled: true },
];

const lightingConfig = [
  { tank: 'Tropical Tank A', onTime: '6:00 AM', offTime: '10:00 PM', brightness: 80, status: 'on' },
  { tank: 'Goldfish Tank B', onTime: '7:00 AM', offTime: '9:00 PM', brightness: 60, status: 'on' },
  { tank: 'Cichlid Tank C', onTime: '6:00 AM', offTime: '10:00 PM', brightness: 90, status: 'off' },
  { tank: 'Breeding Tank D', onTime: '6:00 AM', offTime: '11:00 PM', brightness: 100, status: 'on' },
];

const filterConfig = [
  { tank: 'Tropical Tank A', runtime: '8 hrs/day', speed: 'Medium', active: true },
  { tank: 'Goldfish Tank B', runtime: '6 hrs/day', speed: 'Low', active: true },
  { tank: 'Cichlid Tank C', runtime: '10 hrs/day', speed: 'High', active: true },
  { tank: 'Breeding Tank D', runtime: '12 hrs/day', speed: 'High', active: true },
];

const automationRules = [
  { id: 1, condition: 'IF Temperature > 28°C', action: 'Turn on cooling fan', enabled: true },
  { id: 2, condition: 'IF Water Level < 70%', action: 'Trigger water refill alert', enabled: true },
  { id: 3, condition: 'IF Water Purity (TDS Level) < 80%', action: 'Increase filter runtime by 2hrs', enabled: true },
  { id: 4, condition: 'IF pH < 6.5 OR pH > 7.8', action: 'Send alert notification', enabled: true },
  { id: 6, condition: 'IF Power outage detected', action: 'Send SMS/Email alert', enabled: true },
];

const bioloadProfiles = [
  {
    level: 'High',
    color: 'red',
    description: 'Large/messy fish species (e.g., Goldfish, Cichlids, Plecos)',
    examples: ['Goldfish', 'Oscar', 'Pleco', 'Flowerhorn'],
    feedingFreq: '3x daily',
    filterSpeed: 'High',
    waterChange: 'Weekly (30%)',
    monitoring: 'Every 15 min',
  },
  {
    level: 'Medium',
    color: 'amber',
    description: 'Moderate waste-producing community fish',
    examples: ['Guppies', 'Mollies', 'Platies', 'Swordtails'],
    feedingFreq: '2x daily',
    filterSpeed: 'Medium',
    waterChange: 'Bi-weekly (25%)',
    monitoring: 'Every 30 min',
  },
  {
    level: 'Low',
    color: 'emerald',
    description: 'Small, clean species (e.g., Tetras, Shrimps)',
    examples: ['Neon Tetra', 'Cherry Shrimp', 'Betta', 'Corydoras'],
    feedingFreq: '1-2x daily',
    filterSpeed: 'Low',
    waterChange: 'Monthly (20%)',
    monitoring: 'Every 60 min',
  },
];

export default function Automation() {
  const [feedingEnabled, setFeedingEnabled] = useState<Record<number, boolean>>(
    Object.fromEntries(feedingSchedules.map((s) => [s.id, s.enabled]))
  );
  const [rulesEnabled, setRulesEnabled] = useState<Record<number, boolean>>(
    Object.fromEntries(automationRules.map((r) => [r.id, r.enabled]))
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Fish className="w-5 h-5 text-cyan-400" />
            Feeding Schedule
          </h3>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Tank</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Time</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Amount</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Toggle</th>
                </tr>
              </thead>
              <tbody>
                {feedingSchedules.map((schedule) => (
                  <tr key={schedule.id} className="border-b border-slate-700/50">
                    <td className="py-3 px-4 text-sm text-white">{schedule.tank}</td>
                    <td className="py-3 px-4 text-sm text-slate-300">{schedule.time}</td>
                    <td className="py-3 px-4 text-sm text-slate-300">{schedule.amount}</td>
                    <td className="py-3 px-4">
                      <Badge variant={feedingEnabled[schedule.id] ? 'success' : 'default'}>
                        {feedingEnabled[schedule.id] ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setFeedingEnabled({ ...feedingEnabled, [schedule.id]: !feedingEnabled[schedule.id] })}
                        className={`w-12 h-6 rounded-full transition-all duration-200 ${feedingEnabled[schedule.id] ? 'bg-cyan-600' : 'bg-slate-600'}`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full transition-all duration-200 ${feedingEnabled[schedule.id] ? 'translate-x-6' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-400" />
              Lighting Control
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lightingConfig.map((light) => (
                <div key={light.tank} className="bg-slate-700/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{light.tank}</span>
                    <Badge variant={light.status === 'on' ? 'success' : 'default'}>
                      {light.status === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>ON: {light.onTime}</span>
                    <span>OFF: {light.offTime}</span>
                    <span>Brightness: {light.brightness}%</span>
                  </div>
                  <div className="mt-2 w-full bg-slate-600 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${light.brightness}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Wind className="w-5 h-5 text-blue-400" />
              Filtration Control
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filterConfig.map((filter) => (
                <div key={filter.tank} className="bg-slate-700/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{filter.tank}</span>
                    <Badge variant={filter.active ? 'success' : 'default'}>
                      {filter.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Runtime: {filter.runtime}</span>
                    <span>Speed: {filter.speed}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Rule-Based Automation
          </h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {automationRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-slate-600 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-cyan-400">{rule.condition}</p>
                    <p className="text-xs text-slate-400">→ {rule.action}</p>
                  </div>
                </div>
                <button
                  onClick={() => setRulesEnabled({ ...rulesEnabled, [rule.id]: !rulesEnabled[rule.id] })}
                  className={`w-12 h-6 rounded-full transition-all duration-200 ${rulesEnabled[rule.id] ? 'bg-cyan-600' : 'bg-slate-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-all duration-200 ${rulesEnabled[rule.id] ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Bioload-Based Fish Classification
          </h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bioloadProfiles.map((profile) => (
              <div key={profile.level} className={`border rounded-xl p-5 ${
                profile.color === 'red' ? 'border-red-500/30 bg-red-500/5' :
                profile.color === 'amber' ? 'border-amber-500/30 bg-amber-500/5' :
                'border-emerald-500/30 bg-emerald-500/5'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={profile.color === 'red' ? 'danger' : profile.color === 'amber' ? 'warning' : 'success'}>
                    {profile.level} Bioload
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mb-3">{profile.description}</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-slate-500">Example Species:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.examples.map((fish) => (
                        <span key={fish} className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">{fish}</span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Feeding</p>
                      <p className="text-white font-medium">{profile.feedingFreq}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Filter Speed</p>
                      <p className="text-white font-medium">{profile.filterSpeed}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Water Change</p>
                      <p className="text-white font-medium">{profile.waterChange}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Monitoring</p>
                      <p className="text-white font-medium">{profile.monitoring}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
