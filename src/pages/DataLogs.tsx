import { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Download, FileText, Thermometer, Droplets, Waves, Calendar } from 'lucide-react';

const temperatureData = [
  { time: '6 AM', value: 25.0 },
  { time: '8 AM', value: 25.5 },
  { time: '10 AM', value: 26.0 },
  { time: '12 PM', value: 26.4 },
  { time: '2 PM', value: 26.8 },
  { time: '4 PM', value: 26.2 },
  { time: '6 PM', value: 25.8 },
  { time: '8 PM', value: 25.5 },
  { time: '10 PM', value: 25.2 },
  { time: '12 AM', value: 25.0 },
];

const waterLevelData = [
  { time: '6 AM', value: 88 },
  { time: '8 AM', value: 87 },
  { time: '10 AM', value: 86 },
  { time: '12 PM', value: 85 },
  { time: '2 PM', value: 85 },
  { time: '4 PM', value: 84 },
  { time: '6 PM', value: 85 },
  { time: '8 PM', value: 85 },
  { time: '10 PM', value: 84 },
  { time: '12 AM', value: 84 },
];

const waterQualityData = [
  { day: 'Mon', value: 88 },
  { day: 'Tue', value: 90 },
  { day: 'Wed', value: 89 },
  { day: 'Thu', value: 91 },
  { day: 'Fri', value: 92 },
  { day: 'Sat', value: 93 },
  { day: 'Sun', value: 92 },
];

const logEntries = [
  { id: 1, date: '2026-01-15', time: '10:30 AM', tank: 'Tropical Tank A', temp: 26.4, level: 85, quality: 92, ph: 7.2, status: 'normal' },
  { id: 2, date: '2026-01-15', time: '10:00 AM', tank: 'Goldfish Tank B', temp: 22.1, level: 78, quality: 88, ph: 7.0, status: 'normal' },
  { id: 3, date: '2026-01-15', time: '09:30 AM', tank: 'Cichlid Tank C', temp: 25.8, level: 92, quality: 95, ph: 7.5, status: 'normal' },
  { id: 4, date: '2026-01-15', time: '09:00 AM', tank: 'Breeding Tank D', temp: 27.2, level: 70, quality: 76, ph: 6.8, status: 'warning' },
  { id: 5, date: '2026-01-14', time: '10:30 AM', tank: 'Tropical Tank A', temp: 26.0, level: 87, quality: 90, ph: 7.1, status: 'normal' },
  { id: 6, date: '2026-01-14', time: '10:00 AM', tank: 'Goldfish Tank B', temp: 21.8, level: 80, quality: 86, ph: 7.0, status: 'normal' },
  { id: 7, date: '2026-01-14', time: '09:30 AM', tank: 'Cichlid Tank C', temp: 25.5, level: 93, quality: 94, ph: 7.4, status: 'normal' },
  { id: 8, date: '2026-01-14', time: '09:00 AM', tank: 'Breeding Tank D', temp: 27.8, level: 68, quality: 72, ph: 6.6, status: 'critical' },
];

const eventCounts = [
  { label: 'Feeding Events', count: 28, icon: '🍽️' },
  { label: 'Filter Cycles', count: 14, icon: '🔄' },
  { label: 'Alerts Triggered', count: 6, icon: '⚠️' },
  { label: 'Water Changes', count: 2, icon: '💧' },
];

function LineChart({ data, color, label, unit }: { data: { time: string; value: number }[]; color: string; label: string; unit: string }) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;
  const chartWidth = 400;
  const chartHeight = 120;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * chartWidth;
    const y = chartHeight - ((d.value - min) / range) * (chartHeight - 20) - 10;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-sm text-white font-medium">{min}{unit} - {max}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32">
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * chartWidth;
          const y = chartHeight - ((d.value - min) / range) * (chartHeight - 20) - 10;
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        {data.map((d, i) => (
          <span key={i}>{d.time}</span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, color }: { data: { day: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-3 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-white font-medium">{d.value}%</span>
          <div
            className="w-full rounded-t-md transition-all"
            style={{ height: `${(d.value / max) * 100}%`, backgroundColor: color, minHeight: '8px' }}
          />
          <span className="text-xs text-slate-500">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

export default function DataLogs() {
  const [timePeriod, setTimePeriod] = useState('24h');
  const [selectedTank, setSelectedTank] = useState('all');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {['24h', '7d', '30d', '90d'].map((period) => (
            <button
              key={period}
              onClick={() => setTimePeriod(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timePeriod === period ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
        <select
          value={selectedTank}
          onChange={(e) => setSelectedTank(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Aquariums</option>
          <option value="tropical">Tropical Tank A</option>
          <option value="goldfish">Goldfish Tank B</option>
          <option value="cichlid">Cichlid Tank C</option>
          <option value="breeding">Breeding Tank D</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-orange-400" />
              Temperature History
            </h3>
          </CardHeader>
          <CardContent>
            <LineChart data={temperatureData} color="#f97316" label="Temperature" unit="°C" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Droplets className="w-5 h-5 text-blue-400" />
              Water Level History
            </h3>
          </CardHeader>
          <CardContent>
            <LineChart data={waterLevelData} color="#3b82f6" label="Water Level" unit="%" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Waves className="w-5 h-5 text-emerald-400" />
              Water Quality (Weekly)
            </h3>
          </CardHeader>
          <CardContent>
            <BarChart data={waterQualityData} color="#10b981" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              Events Summary
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {eventCounts.map((event) => (
                <div key={event.label} className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">
                    <span className="mr-2">{event.icon}</span>
                    {event.label}
                  </span>
                  <span className="text-sm font-semibold text-white">{event.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Quick Export</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700/50 hover:bg-cyan-600/20 border border-slate-600 hover:border-cyan-500/50 rounded-lg text-sm text-slate-300 hover:text-cyan-400 transition-all">
                <Download className="w-4 h-4" />
                Export as CSV
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700/50 hover:bg-cyan-600/20 border border-slate-600 hover:border-cyan-500/50 rounded-lg text-sm text-slate-300 hover:text-cyan-400 transition-all">
                <FileText className="w-4 h-4" />
                Generate Report
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Historical Data Log</h3>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Time</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Tank</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Temp (°C)</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Level (%)</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Quality (%)</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">pH</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {logEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-700/50">
                    <td className="py-3 px-4 text-sm text-slate-300">{entry.date}</td>
                    <td className="py-3 px-4 text-sm text-slate-300">{entry.time}</td>
                    <td className="py-3 px-4 text-sm text-white font-medium">{entry.tank}</td>
                    <td className="py-3 px-4 text-sm text-white">{entry.temp}</td>
                    <td className="py-3 px-4 text-sm text-white">{entry.level}</td>
                    <td className="py-3 px-4 text-sm text-white">{entry.quality}</td>
                    <td className="py-3 px-4 text-sm text-white">{entry.ph}</td>
                    <td className="py-3 px-4">
                      <Badge variant={entry.status === 'normal' ? 'success' : entry.status === 'warning' ? 'warning' : 'danger'}>
                        {entry.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}