// Shared web/mobile command-mailbox discipline. No new RTDB nodes or permissions.
// A device-reported relay state/ack is NOT proof of lamp power or pump flow.
import { COMMAND_ACK_TIMEOUT_MS, getTelemetryFreshness } from './monitoringAssessmentCore.ts';

type Row = Record<string, unknown>;
export type MailboxCommand = Row & {
  commandId: string;
  type: string;
  requestedAt: number;
};
export type CommandTransport = {
  readLatest: () => Promise<unknown>;
  readAck: () => Promise<unknown>;
  readTelemetry: () => Promise<unknown>;
  claim: (expectedId: string | null, command: MailboxCommand) => Promise<boolean>;
  now: () => number;
  pause: () => Promise<void>;
};

function row(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
export function mailboxCommandId(value: unknown): string | null {
  const id = row(value).commandId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function commandOutcome(command: MailboxCommand, acknowledgement: unknown,
  telemetry: unknown, now: number): 'done' | 'failed' | null {
  const ack = row(acknowledgement);
  if (ack.commandId === command.commandId && typeof ack.executedAt === 'number' &&
      Number.isFinite(ack.executedAt) && (ack.status === 'done' || ack.status === 'failed')) return ack.status;
  // Compatibility with older firmware that does not acknowledge commands.
  // Only a NEW, fresh, online relay report can satisfy an idempotent state request.
  // Never infer feeding completion from sensor readings or saved dashboard state.
  const t = row(telemetry);
  if (t.online !== true || getTelemetryFreshness(t, now, { allowClockSkew: true }) !== 'live' ||
      typeof t.updatedAt !== 'number' || t.updatedAt < command.requestedAt) return null;
  if (command.type === 'set_light_state' && (command.state === 'On' || command.state === 'Off') &&
      t.lightState === command.state) return 'done';
  if (command.type === 'set_filter_state' && (command.state === 'Active' || command.state === 'Inactive') &&
      t.filterState === command.state) return 'done';
  return null;
}

export async function publishConfirmedCommand(command: MailboxCommand, io: CommandTransport): Promise<void> {
  // Do not silently replace a recent action that the device has not reported.
  const current = row(await io.readLatest());
  const now = io.now();
  const previous = current as MailboxCommand;
  if (mailboxCommandId(current) && typeof current.requestedAt === 'number' &&
      Number.isFinite(current.requestedAt) && current.requestedAt >= now - COMMAND_ACK_TIMEOUT_MS &&
      current.requestedAt <= now + 5000 &&
      ['feed_now', 'set_light_state', 'set_filter_state'].includes(String(current.type))) {
    const [ack, telemetry] = await Promise.all([io.readAck(), io.readTelemetry()]);
    if (!commandOutcome(previous, ack, telemetry, io.now())) {
      throw new Error('The previous device command is still waiting for a response. Wait for it before sending another.');
    }
  }
  // Compare-and-set prevents simultaneous web/mobile users from both replacing
  // the same slot after their preflight reads. Do NOT automatically queue/replay.
  if (!Number.isFinite(command.requestedAt) || io.now() - command.requestedAt > COMMAND_ACK_TIMEOUT_MS ||
      command.requestedAt > io.now() + 5000) {
    throw new Error('The command expired before it could be sent. Check your connection and send a new command.');
  }
  if (!await io.claim(mailboxCommandId(current), command)) {
    throw new Error('Another command was sent at the same time. Check device status, then try again.');
  }
  // Keep existing feeding UI timing. A subsequent action still cannot replace
  // this feed until its ack arrives or the existing 30-second freshness expires.
  if (command.type !== 'set_light_state' && command.type !== 'set_filter_state') return;

  const deadline = io.now() + COMMAND_ACK_TIMEOUT_MS;
  while (io.now() < deadline) {
    const [latest, ack, telemetry] = await Promise.all([io.readLatest(), io.readAck(), io.readTelemetry()]);
    const outcome = commandOutcome(command, ack, telemetry, io.now());
    if (outcome === 'failed') {
      throw new Error('The device rejected the command. Check controls and send a new command when ready.');
    }
    if (outcome === 'done') return;
    if (mailboxCommandId(latest) !== command.commandId) {
      throw new Error('The command was replaced before the device confirmed it. Check device status before retrying.');
    }
    await io.pause();
  }
  throw new Error('No device confirmation received. The command may have run; check device status before retrying.');
}
