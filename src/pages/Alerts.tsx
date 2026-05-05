import { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { AlertTriangle, AlertCircle, Info, CheckCircle, Zap, Thermometer, Droplets, Waves, Bell,  } from 'lucide-react';

const alertData = [
  { id: 1, type: 'critical', category: 'power', message: 'Power outage detected - all systems running on backup', tank: 'All Tanks', time: '2 min ago', resolved: false },
  { id: 2, type: 'critical', category: 'water_level', message: 'Water level critically low at 65%', tank: 'Breeding Tank D', time: '15 min ago', resolved: false },
  { id: 3, type: 'warning', category: 'temperature', message: 'Temperature above safe range (28.5°C)', tank: 'Tropical Tank A', time: '1 hr ago', resolved: false },
  { id: 4, type: 'warning', category: 'water_quality', message: 'Water quality dropping below 80%', tank: 'Breeding Tank D', time: '2 hrs ago', resolved: false },
  { id: 5, type: 'info', category: 'feeding', message: 'Scheduled feeding completed successfully', tank: 'Goldfish Tank B', time: '3 hrs ago', resolved: true },
  { id: 6, type: 'warning', category: 'turbidity', message: 'Turbidity levels rising (28 NTU)', tank: 'Breeding Tank D', time: '4 hrs ago', resolved: false },
  { id: 7, type: 'info', category: 'system', message: 'Filtration cycle completed', tank: 'Cichlid Tank C', time: '5 hrs ago', resolved: true },
  { id: 8, type: 'critical', category: 'power', message: 'Power fluctuation detected', tank: 'All Tanks', time: '6 hrs ago', resolved: true },
  { id: 9, type: 'warning', category: 'temperature', message: 'Temperature below safe range (23°C)', tank: 'Goldfish Tank B', time: '8 hrs ago', resolved: true },
  { id: 10, type: 'info', category: 'system', message: 'System health check passed', tank: 'All Tanks', time: '12 hrs ago', resolved: true },
];

const typeIcons: Record<string, any> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const categoryIcons: Record<string, any> = {
  power: Zap,
  temperature: Thermometer,
  water_level: Droplets,
  water_quality: Waves,
  turbidity: Waves,
  feeding: Bell,
  system: CheckCircle,
};

export default function Alerts() {
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedAlert, setSelectedAlert] = useState<number | null>(null);

  const filtered = alertData.filter((alert) => {
    if (selectedType !== 'all' && alert.type !== selectedType) return false;
    if (selectedStatus === 'active' && alert.resolved) return false;
    if (selectedStatus === 'resolved' && !alert.resolved) return false;
    return true;
  });

  const criticalCount = alertData.filter((a) => a.type === 'critical' && !a.resolved).length;
  const warningCount = alertData.filter((a) => a.type === 'warning' && !a.resolved).length;
  const resolvedCount = alertData.filter((a) => a.resolved).length;
  const totalCount = alertData.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{criticalCount}</p>
              <p className="text-xs text-slate-400">Critical</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{warningCount}</p>
              <p className="text-xs text-slate-400">Warnings</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{resolvedCount}</p>
              <p className="text-xs text-slate-400">Resolved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-500/20 flex items-center justify-center">
              <Bell className="w-6 h-6 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalCount}</p>
              <p className="text-xs text-slate-400">Total Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {['all', 'critical', 'warning', 'info'].map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                  selectedType === type
                    ? type === 'critical' ? 'bg-red-600 text-white' :
                      type === 'warning' ? 'bg-amber-600 text-white' :
                      type === 'info' ? 'bg-cyan-600 text-white' :
                      'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {type === 'all' ? 'All Types' : type}
              </button>
            ))}
            <div className="flex items-center gap-2 ml-auto">
              {['all', 'active', 'resolved'].map((status) => (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                    selectedStatus === status ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((alert) => {
              const TypeIcon = typeIcons[alert.type];
              const CatIcon = categoryIcons[alert.category];
              return (
                <Card key={alert.id}>
                  <CardContent
                    className="p-4 cursor-pointer hover:bg-slate-700/30 transition-all"
                    onClick={() => setSelectedAlert(selectedAlert === alert.id ? null : alert.id)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        alert.type === 'critical' ? 'bg-red-500/20' :
                        alert.type === 'warning' ? 'bg-amber-500/20' :
                        'bg-cyan-500/20'
                      }`}>
                        <TypeIcon className={`w-5 h-5 ${
                          alert.type === 'critical' ? 'text-red-400' :
                          alert.type === 'warning' ? 'text-amber-400' :
                          'text-cyan-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-white">{alert.message}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant={alert.resolved ? 'success' : alert.type === 'critical' ? 'danger' : alert.type === 'warning' ? 'warning' : 'info'}>
                              {alert.resolved ? 'Resolved' : alert.type}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><CatIcon className="w-3 h-3" />{alert.category.replace('_', ' ')}</span>
                          <span>•</span>
                          <span>{alert.tank}</span>
                          <span>•</span>
                          <span>{alert.time}</span>
                        </div>
                      </div>
                    </div>
                    {selectedAlert === alert.id && (
                      <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
                        <div className="text-sm text-slate-400">
                          <p>Alert ID: #{alert.id}</p>
                          <p>Category: {alert.category.replace('_', ' ')}</p>
                          <p>Affected: {alert.tank}</p>
                        </div>
                        {!alert.resolved && (
                          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all">
                            Mark as Resolved
                          </button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-slate-400">No alerts found matching your filters.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">Alert Distribution</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Power', count: alertData.filter((a) => a.category === 'power').length, color: 'bg-yellow-500' },
                  { label: 'Temperature', count: alertData.filter((a) => a.category === 'temperature').length, color: 'bg-orange-500' },
                  { label: 'Water Level', count: alertData.filter((a) => a.category === 'water_level').length, color: 'bg-blue-500' },
                  { label: 'Water Quality', count: alertData.filter((a) => a.category === 'water_quality').length, color: 'bg-emerald-500' },
                  { label: 'System', count: alertData.filter((a) => a.category === 'system').length, color: 'bg-slate-500' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-700 rounded-full h-2">
                        <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${(item.count / totalCount) * 100}%` }} />
                      </div>
                      <span className="text-sm text-white w-6 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">Power Outage Log</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alertData.filter((a) => a.category === 'power').map((alert) => (
                  <div key={alert.id} className="flex items-start gap-3 bg-slate-700/30 rounded-lg p-3">
                    <Zap className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-slate-300">{alert.message}</p>
                      <p className="text-xs text-slate-500">{alert.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}