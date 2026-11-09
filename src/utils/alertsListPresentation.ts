import type { AquariumAlert } from '../types/alerts';

export const INITIAL_VISIBLE_ALERTS = 5;

const alertDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Presentation-only filter over loaded alerts; never queries or changes them. */
export function filterAlertsByDate(alerts: AquariumAlert[], date: string) {
  if (!date) return alerts;
  return alerts.filter((alert) => {
    const timestamp = new Date(alert.lastDetectedAt);
    if (!Number.isFinite(timestamp.getTime())) return false;
    const parts = alertDateFormat.formatToParts(timestamp);
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}` === date;
  });
}
