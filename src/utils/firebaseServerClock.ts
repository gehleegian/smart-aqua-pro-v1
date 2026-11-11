import { onValue, ref, type Database } from 'firebase/database';

export function readServerClockOffset(database: Database): Promise<number> {
  // .info is SDK-local metadata, not an ordinary server path for get().
  // Its root already contains `connected` before the first server offset is
  // known, so this one-shot read also completes on a newly started client.
  return new Promise((resolve, reject) => {
    onValue(ref(database, '.info'), snapshot => {
      const offset = snapshot.child('serverTimeOffset').val();
      resolve(typeof offset === 'number' && Number.isFinite(offset) ? offset : 0);
    }, reject, { onlyOnce: true });
  });
}
