import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// FR19: command_logs are written only by Cloud Functions from the RTDB latest
// command and acknowledgement; members of the tank read them.
export type CommandLogStatus = 'pending' | 'done' | 'failed' | 'no_response';
export type CommandLogEntry = {
  id: string;
  type: string;
  state: string | null;
  status: CommandLogStatus;
  source: 'app' | 'schedule';
  requestedByName: string;
  requestedAt: number;
  executedAt: number | null;
  error: string | null;
  lateAck: boolean;
};

export function subscribeToCommandLog(aquariumId: string, onChange: (entries: CommandLogEntry[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(
    query(collection(db, 'command_logs'), where('aquariumId', '==', aquariumId), orderBy('requestedAt', 'desc'), limit(30)),
    (snapshot) => onChange(snapshot.docs.map((doc) => {
      const data = doc.data();
      const status = data.status;
      return {
        id: doc.id,
        type: String(data.type ?? ''),
        state: typeof data.state === 'string' ? data.state : null,
        status: status === 'done' || status === 'failed' || status === 'no_response' ? status : 'pending',
        source: data.source === 'schedule' ? 'schedule' : 'app',
        requestedByName: String(data.requestedBy?.displayName ?? data.requestedBy?.uid ?? 'Unknown'),
        requestedAt: Number(data.requestedAt ?? 0),
        executedAt: typeof data.executedAt === 'number' ? data.executedAt : null,
        error: typeof data.error === 'string' ? data.error : null,
        lateAck: data.lateAck === true,
      };
    })),
    (error) => {
      console.error(error);
      onError?.(error);
    }
  );
}

export function commandLabel(type: string, state: string | null) {
  switch (type) {
    case 'feed_now': return 'Feed now';
    case 'set_light_state': return `Light ${state === 'On' ? 'on' : state === 'Off' ? 'off' : ''}`.trim();
    case 'set_filter_state': return `Filter ${state === 'Active' ? 'on' : state === 'Inactive' ? 'off' : ''}`.trim();
    case 'sync_control': return 'Schedule sync';
    default: return type;
  }
}

/** A timeout is an unknown outcome, not proof that the device failed to act. */
export const NO_RESPONSE_EXPLANATION =
  'The device did not confirm this command within 30 seconds. Check its connection and firmware version before retrying; this does not mean the command failed.';
