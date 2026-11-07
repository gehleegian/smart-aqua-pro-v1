// Every Cloud Function runs in the same region as the project's Firestore and
// Realtime Database (asia-southeast1). 2nd-gen database triggers must live in
// their database's region, and callables are kept next to the data. Web and
// mobile clients call this region through *_FUNCTIONS_REGION (default below).
export const FUNCTIONS_REGION = 'asia-southeast1';

// Realtime Database triggers must run in the database's region. The Database
// emulator only delivers RTDB events to us-central1 functions (firebase-tools
// hardcodes it), so under the emulator, and only there, the three RTDB
// triggers use us-central1. FUNCTIONS_EMULATOR is set by the emulator during
// discovery and never during `firebase deploy`, so deployed triggers always
// run in asia-southeast1.
export const RTDB_TRIGGER_REGION = process.env.FUNCTIONS_EMULATOR === 'true' ? 'us-central1' : FUNCTIONS_REGION;
