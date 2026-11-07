// FR18 automation schedules (Sprint 4). The schedule is stored in the existing
// control contract (RTDB devices/{id}/control: feedingTimes, lightOnTime,
// lightOffTime, filtrationStartTime, filtrationRuntimeHours, mode). The DEVICE
// runs it locally on NTP time (docs/firmware-changes.md §11). All times are
// wall-clock times in Asia/Manila (UTC+8, no daylight saving).
export const SCHEDULE_TIME_ZONE = 'Asia/Manila';
export const MIN_FEEDING_GAP_MINUTES = 30;
const MANILA_OFFSET_MINUTES = 8 * 60;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ScheduleInput = {
  feedingTimes: string[];
  lightOnTime?: string;
  lightOffTime?: string;
  filtrationStartTime: string;
  filtrationRuntimeHours: number;
};

export function minutesOf(time: string) {
  const match = HHMM.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function hhmm(minutes: number) {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

/** Returns the problems with a schedule, in plain words (empty when valid). */
export function validateSchedule(input: ScheduleInput): string[] {
  const errors: string[] = [];
  const feeding = input.feedingTimes.map((time) => time.trim()).filter(Boolean);
  if (feeding.length === 0) errors.push('Add at least one feeding time.');
  if (feeding.length > 8) errors.push('At most 8 feeding times a day.');
  const minutes = feeding.map(minutesOf);
  if (minutes.some((value) => value === null)) errors.push('Feeding times must be HH:mm (24-hour).');
  const sorted = minutes.filter((value): value is number => value !== null).sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index += 1) {
    const next = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + 1440;
    if (sorted.length > 1 && next - sorted[index] < MIN_FEEDING_GAP_MINUTES) {
      errors.push(`Feeding times ${hhmm(sorted[index])} and ${hhmm(next)} are less than ${MIN_FEEDING_GAP_MINUTES} minutes apart.`);
      break;
    }
  }
  const lightOn = input.lightOnTime ? minutesOf(input.lightOnTime) : null;
  const lightOff = input.lightOffTime ? minutesOf(input.lightOffTime) : null;
  if ((input.lightOnTime && lightOn === null) || (input.lightOffTime && lightOff === null)) errors.push('Light times must be HH:mm (24-hour).');
  if (Boolean(input.lightOnTime) !== Boolean(input.lightOffTime)) errors.push('Set both the light on and light off time, or neither.');
  if (lightOn !== null && lightOn === lightOff) errors.push('Light on and off cannot be the same time.');
  if (minutesOf(input.filtrationStartTime) === null) errors.push('Filter start must be HH:mm (24-hour).');
  const runtime = Number(input.filtrationRuntimeHours);
  if (!Number.isFinite(runtime) || runtime < 1 || runtime > 24) errors.push('Filter runtime must be 1–24 hours.');
  return errors;
}

export type ScheduledEvent = { kind: 'feed' | 'light_on' | 'light_off' | 'filter_on' | 'filter_off'; time: string; at: number };

const LABEL: Record<ScheduledEvent['kind'], string> = {
  feed: 'Feed', light_on: 'Light on', light_off: 'Light off', filter_on: 'Filter on', filter_off: 'Filter off',
};

/** Next occurrence (epoch ms) of a Manila wall-clock time at or after `now`. */
function nextAt(time: string, now: number) {
  const minutes = minutesOf(time);
  if (minutes === null) return null;
  const manilaNow = now + MANILA_OFFSET_MINUTES * 60_000;
  const dayStart = manilaNow - (manilaNow % 86_400_000);
  let at = dayStart + minutes * 60_000 - MANILA_OFFSET_MINUTES * 60_000;
  if (at < now) at += 86_400_000;
  return at;
}

/** Upcoming events, soonest first, within the next 24 hours. */
export function upcomingEvents(input: ScheduleInput, now: number): ScheduledEvent[] {
  const events: ScheduledEvent[] = [];
  const push = (kind: ScheduledEvent['kind'], time: string | undefined) => {
    const at = time ? nextAt(time, now) : null;
    if (at !== null && time) events.push({ kind, time, at });
  };
  input.feedingTimes.forEach((time) => push('feed', time));
  push('light_on', input.lightOnTime);
  push('light_off', input.lightOffTime);
  const start = minutesOf(input.filtrationStartTime);
  if (start !== null && Number(input.filtrationRuntimeHours) >= 1 && Number(input.filtrationRuntimeHours) < 24) {
    push('filter_on', input.filtrationStartTime);
    push('filter_off', hhmm(start + Math.round(Number(input.filtrationRuntimeHours) * 60)));
  }
  return events.sort((a, b) => a.at - b.at);
}

/** "Next scheduled: Feed at 18:00, Light off at 20:00" (the next feed and the next light change). */
export function nextScheduledText(input: ScheduleInput, now: number) {
  const events = upcomingEvents(input, now);
  const picks = [events.find((event) => event.kind === 'feed'), events.find((event) => event.kind === 'light_on' || event.kind === 'light_off')]
    .filter((event): event is ScheduledEvent => Boolean(event))
    .sort((a, b) => a.at - b.at);
  return picks.length ? `Next scheduled: ${picks.map((event) => `${LABEL[event.kind]} at ${event.time}`).join(', ')}` : '';
}
