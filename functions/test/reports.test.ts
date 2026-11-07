// FR21 end to end on the emulators: real ingest rows, maintenance and command
// logs -> weekly report -> Firestore monitoring_reports + PDF and CSV in Storage.
// Run: npm run test:reports
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument } from 'pdf-lib';
import { syncUserAuthorization } from '../src/authorizationSync.js';
import { acceptInvite, claimDevice, createInvite, hashClaimCode, setOrganizationStatus, type OrgActor, type OrgDependencies } from '../src/orgAccess.js';
import { logMaintenance } from '../src/maintenance.js';
import { markUnansweredCommands, recordAck, recordCommand } from '../src/commandLog.js';
import { clearRuleConfigCache } from '../src/ruleEngine.js';
import { ingestTelemetry } from '../src/telemetryIngest.js';
import { MutationError } from '../src/trustedMutations.js';
import { generateReportForMember, generateScheduledReports, type ReportDependencies } from '../src/reports/generate.js';
import { manilaMidnight } from '../src/reports/summary.js';

const PROJECT_ID = 'demo-smartaqua-reports';
const BUCKET = `${PROJECT_ID}.appspot.com`;
const PEPPER = 'emulator-test-pepper';
const MIN = 60_000;
const actor = (uid: string, platformAdmin = false): OrgActor => ({ uid, email: `${uid}@example.test`, emailVerified: true, platformAdmin });
const OWNER_A = actor('owner-a');
const CARE_X = actor('care-x');
const CARE_Y = actor('care-y');
const OWNER_B = actor('owner-b');
const ADMIN = actor('admin-p', true);

let app: App;
let auth: Auth;
let firestore: Firestore;
let database: Database;
let deps: OrgDependencies;
let reportDeps: ReportDependencies;
let bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>;
// Tuesday 2026-11-03 08:00 Asia/Manila.
const T0 = manilaMidnight('2026-11-03') + 8 * 60 * MIN;
// Monday 2026-11-09 07:00 Asia/Manila: when the weekly schedule runs.
const MONDAY_RUN = manilaMidnight('2026-11-09') + 7 * 60 * MIN;
let clockMs = T0 - 20 * 24 * 60 * MIN;
let orgId = '';
let tank1 = '';
let tank2 = '';
let tankB = '';

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MutationError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

const reading = (overrides: Record<string, unknown> = {}) => ({
  temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 85, waterPresent: true, ph: 7.0, phReadingValid: true,
  tdsPpm: 250, tdsReadingValid: true, turbidity: 2, turbidityReadingValid: true, filterState: 'Active',
  equipmentStatus: 'Normal', powerStatus: 'Online', online: true, updatedAt: clockMs, ...overrides,
});

before(async () => {
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${PROJECT_ID}-default-rtdb` }, 'reports-test');
  auth = getAuth(app);
  firestore = getFirestore(app);
  database = getDatabase(app);
  deps = { firestore, database, auth, claimCodePepper: PEPPER, now: () => clockMs };
  bucket = getStorage(app).bucket(BUCKET);
  reportDeps = { firestore, bucket, now: () => clockMs };
  clearRuleConfigCache();

  for (const user of [OWNER_A, CARE_X, CARE_Y, OWNER_B, ADMIN]) {
    await auth.createUser({ uid: user.uid, email: user.email ?? undefined, emailVerified: true, password: 'SmartAqua-Test-123!' });
    await firestore.doc(`users/${user.uid}`).set({ name: user.uid, full_name: user.uid, email: user.email, role: user.platformAdmin ? 'Admin' : 'User' });
    await syncUserAuthorization({ firestore, database }, user.uid, { cascadeAquariums: false });
  }
  const seed = JSON.parse(readFileSync(new URL('../../../scripts/seed/goldfish-draft.json', import.meta.url), 'utf8'));
  const batch = firestore.batch();
  for (const [id, data] of Object.entries(seed.species)) batch.set(firestore.doc(`species/${id}`), data as Record<string, unknown>);
  for (const [id, data] of Object.entries(seed.rules)) batch.set(firestore.doc(`rules/${id}`), data as Record<string, unknown>);
  await batch.commit();
  for (const [id, code] of [['SAQ-AAAA-1111', 'ABCD2345'], ['SAQ-BBBB-2222', 'EFGH6789'], ['SAQ-CCCC-3333', 'JKMN2345']]) {
    await firestore.doc(`device_registry/${id}`).set({
      claimCodeHash: hashClaimCode(PEPPER, id, code), status: 'unclaimed', deviceUid: `esp32-${id}`, orgId: null, aquariumId: null, claimedBy: null, claimedAt: null, createdAt: clockMs,
    });
  }
  const first = await claimDevice(deps, OWNER_A, { deviceId: 'SAQ-AAAA-1111', claimCode: 'ABCD2345', aquariumName: 'Tank 1', orgName: 'Davao Pet Shop' });
  orgId = first.orgId;
  tank1 = first.aquariumId;
  tank2 = (await claimDevice(deps, OWNER_A, { deviceId: 'SAQ-BBBB-2222', claimCode: 'EFGH6789', aquariumName: 'Tank 2' })).aquariumId;
  tankB = (await claimDevice(deps, OWNER_B, { deviceId: 'SAQ-CCCC-3333', claimCode: 'JKMN2345', aquariumName: 'B Tank' })).aquariumId;
  for (const [caretaker, tanks] of [[CARE_X, [tank1]], [CARE_Y, [tank2]]] as const) {
    const invite = await createInvite(deps, OWNER_A, { orgId, email: caretaker.email, aquariumIds: [...tanks] });
    await acceptInvite(deps, caretaker, { token: invite.token });
  }
  for (const id of [tank1, tank2, tankB]) {
    await firestore.doc(`aquariums/${id}`).update({
      species: ['Goldfish'], workingWaterVolumeLiters: 55, fishCount: 2, fishWeightsG: [40, 55], hasFiltrationSystem: true, status: 'active',
      createdAt: new Date(clockMs).toISOString(),
    });
  }

  // Tuesday: 24 readings, one every 5 min. 12 normal, 6 at 25 °C (WARNING), 6 normal; reading 6 has a faulty TDS probe.
  for (let index = 0; index < 24; index += 1) {
    clockMs = T0 + index * 5 * MIN;
    const temperatureC = index >= 12 && index < 18 ? 25 : 22;
    const result = await ingestTelemetry({ firestore, now: () => clockMs }, tank1, reading({ temperatureC, ...(index === 6 ? { tdsReadingValid: false, tdsPpm: 0 } : {}) }));
    assert.equal(result.ingested && result.written, true, `reading ${index} stored`);
    if (index === 14) {
      // The caretaker applies the temperature recommendation and logs it.
      const rec = await firestore.collection('recommendations').where('aquariumId', '==', tank1).where('parameter', '==', 'temperatureC').get();
      assert.equal(rec.size, 1);
      await logMaintenance({ firestore, now: () => clockMs }, CARE_X, {
        aquariumId: tank1, type: 'water_change', waterChangePercent: 20, notes: 'Partial water change to cool the tank', performedAt: clockMs, recommendationId: rec.docs[0].id,
      });
    }
  }
  // Two commands: one acknowledged, one never answered.
  clockMs = T0 + 3 * 60 * MIN;
  await recordCommand({ firestore, now: () => clockMs }, tank1, { commandId: 'cmd-1', type: 'feed_now', requestedAt: clockMs, requestedBy: OWNER_A.uid });
  await recordAck({ firestore, now: () => clockMs }, tank1, { commandId: 'cmd-1', status: 'done', executedAt: clockMs + 2000 });
  await recordCommand({ firestore, now: () => clockMs }, tank1, { commandId: 'cmd-2', type: 'set_light_state', state: 'On', requestedAt: clockMs, requestedBy: CARE_X.uid });
  clockMs += 60_000;
  await markUnansweredCommands({ firestore, now: () => clockMs });
  clockMs = MONDAY_RUN;
});

after(async () => {
  await deleteApp(app);
});

test('REPORT-01 ingest rows carry the per-parameter status the report needs', async () => {
  const rows = await firestore.collection('sensor_readings').where('aquariumId', '==', tank1).orderBy('recordedAtEpoch').get();
  assert.equal(rows.size, 24);
  assert.equal(rows.docs[12].get('parameterStatus.temperatureC'), 'warning');
  assert.equal(rows.docs[6].get('parameterStatus.tdsPpm'), 'unavailable');
  assert.equal(rows.docs[0].get('parameterStatus.device'), undefined);
});

test('REPORT-02 a weekly report for the seeded tank: correct summary, PDF and CSV in Storage, existing document shape', async () => {
  const result = await generateReportForMember(reportDeps, CARE_X, { aquariumId: tank1, reportType: 'weekly', startDate: '2026-11-05' });
  const report = (await firestore.doc(`monitoring_reports/${result.reportId}`).get()).data()!;
  // Existing shape kept...
  for (const field of ['report_id', 'aquarium_id', 'report_type', 'start_date', 'end_date', 'generated_at', 'generated_by', 'summary', 'fileUrl']) {
    assert.ok(field in report, `${field} present`);
  }
  assert.equal(report.report_id, result.reportId);
  assert.equal(report.aquarium_id, tank1);
  assert.equal(report.report_type, 'weekly');
  assert.equal(report.start_date.toMillis(), manilaMidnight('2026-11-02'));
  assert.equal(report.end_date.toMillis(), manilaMidnight('2026-11-09'));
  assert.equal(report.generated_by, CARE_X.uid);
  assert.equal(typeof report.summary, 'string');
  // ...plus orgId, the structured summary and the file paths.
  assert.equal(report.orgId, orgId);
  assert.equal(report.pdfPath, `reports/${orgId}/${tank1}/${result.reportId}.pdf`);
  assert.equal(report.csvPath, `reports/${orgId}/${tank1}/${result.reportId}.csv`);

  const s = report.structured_summary;
  assert.equal(s.period.label, '2026-11-02 to 2026-11-08');
  assert.equal(s.aquarium.orgName, 'Davao Pet Shop');
  const temperature = s.readings.perParameter.temperatureC;
  assert.deepEqual([temperature.valid, temperature.min, temperature.max, temperature.avg], [24, 22, 25, 22.75]);
  assert.deepEqual([s.readings.perParameter.tdsPpm.valid, s.readings.perParameter.tdsPpm.invalid], [23, 1], 'the faulty TDS reading is counted, not averaged');
  assert.equal(s.completeness.expectedSamples, 7 * 24 * 12);
  assert.equal(s.completeness.receivedSamples, 24);
  assert.equal(s.timeInCondition.perParameter.temperatureC.warning, 30 * MIN);
  assert.equal(s.timeInCondition.perParameter.temperatureC.normal, 91 * MIN, '17 rows x 5 min + the last row held 6 min');
  assert.equal(s.timeInCondition.perParameter.tdsPpm.unavailable, 5 * MIN);
  assert.deepEqual(s.alerts.byParameter.temperatureC, { total: 1, warning: 1, critical: 0 });
  assert.equal(s.recommendations.byParameter.temperatureC.applied, 1);
  assert.ok(s.recommendations.generated >= 1);
  assert.equal(s.maintenance.count, 1);
  assert.equal(s.maintenance.items[0].type, 'water_change');
  assert.deepEqual([s.devices.commands.total, s.devices.commands.done, s.devices.commands.noResponse], [2, 1, 1]);
  assert.match(s.thresholds.draftNote, /Draft thresholds/, 'the seeded goldfish thresholds are DRAFT');

  const [pdfBytes] = await bucket.file(report.pdfPath).download();
  const pdf = await PDFDocument.load(pdfBytes);
  assert.ok(pdf.getPageCount() >= 3, `PDF has ${pdf.getPageCount()} pages`);
  assert.match(pdf.getTitle() ?? '', /Tank 1 - 2026-11-02 to 2026-11-08/);
  assert.equal(report.pdfBytes, pdfBytes.length);
  const [csv] = await bucket.file(report.csvPath).download();
  const lines = csv.toString('utf8').trim().split('\n');
  assert.equal(lines.length, 1 + 24);
  assert.equal(lines.filter((line: string) => line.endsWith(',tds')).length, 1);
});

test('REPORT-03 only owners and assigned caretakers can generate; never across orgs; admins are read-only', async () => {
  await rejects(generateReportForMember(reportDeps, CARE_Y, { aquariumId: tank1, reportType: 'daily', startDate: '2026-11-03' }), 'permission-denied');
  await rejects(generateReportForMember(reportDeps, OWNER_B, { aquariumId: tank1, reportType: 'daily', startDate: '2026-11-03' }), 'permission-denied');
  await rejects(generateReportForMember(reportDeps, ADMIN, { aquariumId: tank1, reportType: 'daily', startDate: '2026-11-03' }), 'permission-denied');
  await rejects(generateReportForMember(reportDeps, OWNER_A, { aquariumId: tank1, reportType: 'yearly', startDate: '2026-11-03' }), 'invalid-argument');
  await rejects(generateReportForMember(reportDeps, OWNER_A, { aquariumId: tank1, reportType: 'custom', startDate: '2026-01-01', endDate: '2026-11-01' }), 'invalid-argument');
  await rejects(generateReportForMember(reportDeps, OWNER_A, { aquariumId: tank1, reportType: 'daily', startDate: '2026-12-25' }), 'invalid-argument');
  const daily = await generateReportForMember(reportDeps, OWNER_A, { aquariumId: tank1, reportType: 'daily', startDate: '2026-11-03' });
  assert.match(daily.summary, /^Daily report 2026-11-03: 24 readings/);
});

test('REPORT-04 the weekly schedule reports last week for every active tank, idempotently', async () => {
  const first = await generateScheduledReports(reportDeps, 'weekly');
  assert.equal(first.period, '2026-11-02 to 2026-11-08');
  assert.deepEqual([first.generated, first.failed.length], [3, 0]);
  const id = `${tank1}_weekly_2026-11-02`;
  const before = (await firestore.doc(`monitoring_reports/${id}`).get()).data()!;
  assert.equal(before.generated_by, 'schedule');
  const again = await generateScheduledReports(reportDeps, 'weekly');
  assert.equal(again.generated, 3);
  const scheduled = await firestore.collection('monitoring_reports').where('aquarium_id', '==', tankB).get();
  assert.equal(scheduled.size, 1, 'a retried run overwrites the same report');
  assert.equal(scheduled.docs[0].get('orgId'), `org-${OWNER_B.uid}`);
});

test('REPORT-05 a suspended organization cannot generate and is skipped by the schedule; members get orgStatus for the Storage rules', async () => {
  await setOrganizationStatus(deps, ADMIN, { orgId, status: 'suspended' });
  const member = await firestore.doc(`organizations/${orgId}/members/${CARE_X.uid}`).get();
  assert.equal(member.get('orgStatus'), 'suspended');
  await rejects(generateReportForMember(reportDeps, OWNER_A, { aquariumId: tank1, reportType: 'daily', startDate: '2026-11-03' }), 'failed-precondition');
  const run = await generateScheduledReports(reportDeps, 'monthly');
  assert.equal(run.period, '2026-10');
  assert.deepEqual([run.generated, run.skipped], [1, 2], 'org A tanks skipped while suspended; org B still gets its report');
  await setOrganizationStatus(deps, ADMIN, { orgId, status: 'active' });
  assert.equal((await firestore.doc(`organizations/${orgId}/members/${CARE_X.uid}`).get()).get('orgStatus'), 'active');
});
