// FR21 monitoring report PDF. pdfkit draws everything as vectors (text, tables
// and the line charts), so there is no browser or image library in the function.
// Fonts: the built-in Helvetica family (no font files to ship).
import PDFDocument from 'pdfkit';
import { PARAMETER_LABELS, type WaterParameter } from '../shared/monitoringAssessmentCore.js';
import {
  formatDuration,
  manilaDateTime,
  percentOf,
  REPORT_STATUS_PARAMETERS,
  REPORT_WATER_PARAMETERS,
  type ConditionTimes,
  type ReadingRow,
  type StructuredSummary,
} from './summary.js';

const BRAND = '#0e7490';
const INK = '#0f172a';
const MUTED = '#475569';
const RULE = '#cbd5e1';
const BAND = '#dcfce7';
const BAND_EDGE = '#16a34a';
const LINE = '#1d4ed8';
const WARN_FILL = '#fef3c7';
const MARGIN = 48;
/** Footer area kept free on every page for the page number. */
const FOOTER_SPACE = 36;
const MAX_CHART_POINTS = 600;


export type ReportPdfInput = {
  summary: StructuredSummary;
  readings: ReadingRow[];
  generatedAt: number;
  generatedByLabel: string;
  reportId: string;
};

function fmt(value: number | null | undefined, places = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return Number(value.toFixed(places)).toString();
}

function parameterName(parameter: string) {
  return PARAMETER_LABELS[parameter as keyof typeof PARAMETER_LABELS]?.label ?? parameter;
}

/** Renders the report and resolves with the PDF bytes. */
export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const { summary } = input;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `SmartAqua Pro monitoring report - ${summary.aquarium.name} - ${summary.period.label}`,
      Author: 'SmartAqua Pro',
      Subject: `${summary.period.type} monitoring report`,
      Creator: 'SmartAqua Pro Cloud Functions',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - MARGIN - FOOTER_SPACE;
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };
  const heading = (title: string) => {
    ensure(48);
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND).text(title, MARGIN, doc.y, { width });
    const y = doc.y + 2;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(0.6).strokeColor(RULE).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
  };
  const para = (value: string, options: { color?: string; size?: number; bold?: boolean } = {}) => {
    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size ?? 9.5).fillColor(options.color ?? INK);
    ensure(doc.heightOfString(value, { width }) + 4);
    doc.text(value, MARGIN, doc.y, { width });
  };

  /** A simple table: header row + rows, fixed column widths (fractions of the page width). */
  const table = (columns: { label: string; width: number; align?: 'left' | 'right' }[], rows: string[][]) => {
    const widths = columns.map((column) => column.width * width);
    const drawRow = (cells: string[], bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
      const height = Math.max(...cells.map((cell, index) => doc.heightOfString(cell, { width: widths[index] - 6 }))) + 6;
      if (doc.y + height > bottom()) {
        doc.addPage();
        if (!bold) drawRow(columns.map((column) => column.label), true);
      }
      const y = doc.y;
      if (bold) doc.rect(MARGIN, y, width, height).fill('#f1f5f9');
      let x = MARGIN;
      cells.forEach((cell, index) => {
        doc.fillColor(bold ? MUTED : INK).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
          .text(cell, x + 3, y + 3, { width: widths[index] - 6, align: columns[index].align ?? 'left' });
        x += widths[index];
      });
      doc.moveTo(MARGIN, y + height).lineTo(MARGIN + width, y + height).lineWidth(0.4).strokeColor(RULE).stroke();
      doc.x = MARGIN;
      doc.y = y + height;
    };
    drawRow(columns.map((column) => column.label), true);
    for (const row of rows) drawRow(row, false);
    doc.moveDown(0.4);
  };

  // ---- Header -------------------------------------------------------------
  doc.rect(0, 0, doc.page.width, 92).fill(BRAND);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('SmartAqua Pro', MARGIN, 24);
  doc.font('Helvetica').fontSize(11).text('Aquarium monitoring report', MARGIN, 52);
  doc.fontSize(9).text(`Report ${input.reportId}`, MARGIN, 68);
  doc.fillColor(INK);
  doc.y = 110;
  const typeLabel = summary.period.type.charAt(0).toUpperCase() + summary.period.type.slice(1);
  const facts: [string, string][] = [
    ['Aquarium', summary.aquarium.name],
    ['Organization', summary.aquarium.orgName ?? '-'],
    ['Period', `${typeLabel}: ${summary.period.label} (${manilaDateTime(summary.period.start)} to ${manilaDateTime(summary.period.end)}, Asia/Manila)`],
    ['Generated', `${manilaDateTime(input.generatedAt)} Asia/Manila, by ${input.generatedByLabel}`],
  ];
  if (summary.period.effectiveEnd < summary.period.end) {
    facts.push(['Note', `The period has not ended yet: figures cover up to ${manilaDateTime(summary.period.effectiveEnd)}.`]);
  }
  for (const [label, value] of facts) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(MUTED).text(label, MARGIN, y, { width: 90 });
    doc.font('Helvetica').fillColor(INK).text(value, MARGIN + 90, y, { width: width - 90 });
    doc.moveDown(0.2);
  }

  if (summary.thresholds.draftNote) {
    doc.moveDown(0.5);
    const text = summary.thresholds.draftNote;
    doc.font('Helvetica-Bold').fontSize(9.5);
    const height = doc.heightOfString(`DRAFT THRESHOLDS. ${text}`, { width: width - 16 }) + 12;
    const y = doc.y;
    doc.rect(MARGIN, y, width, height).fill(WARN_FILL);
    doc.fillColor('#92400e').text(`DRAFT THRESHOLDS. `, MARGIN + 8, y + 6, { width: width - 16, continued: true })
      .font('Helvetica').text(text);
    doc.y = y + height;
  }

  // ---- Recommendations vs action (shown first: the prescriptive evidence) ---
  const rec = summary.recommendations;
  heading('Recommendations and what was done');
  {
    const boxes: [string, number | string][] = [
      ['Generated', rec.generated], ['Applied', rec.applied], ['Dismissed', rec.dismissed], ['Still pending', rec.pending],
      ['Acted on', rec.actedOnPct === null ? '-' : `${rec.actedOnPct}%`],
    ];
    const boxWidth = width / boxes.length;
    const y = doc.y;
    boxes.forEach(([label, value], index) => {
      const x = MARGIN + index * boxWidth;
      doc.rect(x + 2, y, boxWidth - 4, 50).lineWidth(0.8).strokeColor(BRAND).stroke();
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(String(value), x + 2, y + 8, { width: boxWidth - 4, align: 'center' });
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, x + 2, y + 32, { width: boxWidth - 4, align: 'center' });
    });
    doc.x = MARGIN;
    doc.y = y + 58;
    para(`Every recommendation comes from a predefined IF-THEN rule (rule ID shown). Closed automatically when the condition cleared: ${rec.autoResolved}. Replaced by a more severe recommendation: ${rec.superseded}.`, { color: MUTED, size: 8.5 });
    if (rec.items.length > 0) {
      doc.moveDown(0.3);
      table(
        [{ label: 'Created', width: 0.17 }, { label: 'Parameter', width: 0.14 }, { label: 'Severity', width: 0.11 }, { label: 'Recommendation', width: 0.34 }, { label: 'Rule', width: 0.12 }, { label: 'Status', width: 0.12 }],
        rec.items.map((item) => [manilaDateTime(item.createdAt), parameterName(item.parameter), item.severity.toUpperCase(), item.title, item.ruleId ?? '-', item.status]),
      );
    }
  }

  // ---- Readings ------------------------------------------------------------
  heading('Readings (valid readings only)');
  table(
    [{ label: 'Parameter', width: 0.2 }, { label: 'Min', width: 0.1, align: 'right' }, { label: 'Max', width: 0.1, align: 'right' }, { label: 'Average', width: 0.12, align: 'right' }, { label: 'Valid', width: 0.12, align: 'right' }, { label: 'Invalid', width: 0.12, align: 'right' }, { label: 'Missing', width: 0.12, align: 'right' }, { label: 'Unvalidated', width: 0.12, align: 'right' }],
    REPORT_WATER_PARAMETERS.map((parameter) => {
      const stats = summary.readings.perParameter[parameter];
      const unit = stats.unit ? ` (${stats.unit})` : '';
      return [`${stats.label}${unit}`, fmt(stats.min), fmt(stats.max), fmt(stats.avg), String(stats.valid), String(stats.invalid), String(stats.missing), String(stats.unvalidated)];
    }),
  );
  para('Invalid = the sensor reported a fault or an impossible value; it is treated as a sensor problem, never as a water condition. Unvalidated = a stored row from before validation existed; excluded from the figures.', { color: MUTED, size: 8.5 });

  // ---- Data completeness ---------------------------------------------------
  const completeness = summary.completeness;
  heading('Data completeness');
  table(
    [{ label: 'Measure', width: 0.5 }, { label: 'Value', width: 0.5 }],
    [
      ['History samples expected (one per 5 min)', String(completeness.expectedSamples)],
      ['5-minute slots with a reading', String(completeness.receivedSamples)],
      ['Completeness', completeness.completenessPct === null ? '-' : `${completeness.completenessPct}%`],
      ['Time with no data', formatDuration(completeness.noDataMs)],
      ['Device offline (offline alerts)', `${formatDuration(completeness.offlineMs)} in ${completeness.offlineEvents} event(s)`],
    ],
  );

  // ---- Time in condition ---------------------------------------------------
  heading('Time in condition');
  const span = summary.period.effectiveEnd - summary.period.start;
  const timeCell = (times: ConditionTimes, key: keyof ConditionTimes) => `${formatDuration(times[key])} (${percentOf(times[key], span)}%)`;
  {
    // A stacked bar with labels, so the meaning never depends on colour alone.
    const overall = summary.timeInCondition.overall;
    const segments: [keyof ConditionTimes, string][] = [['normal', '#16a34a'], ['warning', '#d97706'], ['critical', '#dc2626'], ['unavailable', '#64748b'], ['notRecorded', '#94a3b8'], ['noData', '#e2e8f0']];
    ensure(40);
    const y = doc.y;
    let x = MARGIN;
    for (const [key, color] of segments) {
      const segmentWidth = span > 0 ? (overall[key] / span) * width : 0;
      if (segmentWidth <= 0) continue;
      doc.rect(x, y, segmentWidth, 14).fill(color);
      x += segmentWidth;
    }
    doc.rect(MARGIN, y, width, 14).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.y = y + 20;
    doc.x = MARGIN;
    para(`Overall: NORMAL ${timeCell(overall, 'normal')} | WARNING ${timeCell(overall, 'warning')} | CRITICAL ${timeCell(overall, 'critical')} | Sensor fault ${timeCell(overall, 'unavailable')} | No data ${timeCell(overall, 'noData')}`, { size: 8.5 });
    doc.moveDown(0.3);
  }
  table(
    [{ label: 'Parameter', width: 0.16 }, { label: 'NORMAL', width: 0.14 }, { label: 'WARNING', width: 0.14 }, { label: 'CRITICAL', width: 0.14 }, { label: 'Fault / unavail.', width: 0.14 }, { label: 'Not monitored', width: 0.14 }, { label: 'Not recorded', width: 0.14 }],
    REPORT_STATUS_PARAMETERS.map((parameter) => {
      const times = summary.timeInCondition.perParameter[parameter];
      return [parameterName(parameter), timeCell(times, 'normal'), timeCell(times, 'warning'), timeCell(times, 'critical'), timeCell(times, 'unavailable'), timeCell(times, 'notMonitored'), timeCell(times, 'notRecorded')];
    }),
  );
  para('Each history sample stands for the time until the next sample, at most 6 minutes. "Not recorded" covers samples stored before the per-parameter status was saved.', { color: MUTED, size: 8.5 });

  // ---- Alerts ----------------------------------------------------------------
  const alerts = summary.alerts;
  heading('Alerts');
  para(`${alerts.total} alert(s) raised: ${alerts.bySeverity.critical ?? 0} CRITICAL, ${alerts.bySeverity.warning ?? 0} WARNING. Resolved: ${alerts.resolved}. Still open: ${alerts.stillOpen}. Average time to resolve: ${alerts.avgResolveMs === null ? '-' : formatDuration(alerts.avgResolveMs)}.`);
  if (alerts.longestOpen) {
    const longest = alerts.longestOpen;
    para(`Longest open: ${longest.type ?? parameterName(longest.parameter)} (${longest.severity.toUpperCase()}), ${formatDuration(longest.durationMs)}${longest.stillOpen ? ' and still open' : ''}, since ${manilaDateTime(longest.triggeredAt)}.`);
  }
  const alertRows = Object.entries(alerts.byParameter).sort((a, b) => b[1].total - a[1].total);
  if (alertRows.length > 0) {
    doc.moveDown(0.3);
    table(
      [{ label: 'Parameter / event', width: 0.4 }, { label: 'Total', width: 0.2, align: 'right' }, { label: 'WARNING', width: 0.2, align: 'right' }, { label: 'CRITICAL', width: 0.2, align: 'right' }],
      alertRows.map(([parameter, counts]) => [parameterName(parameter), String(counts.total), String(counts.warning), String(counts.critical)]),
    );
  }

  // ---- Charts --------------------------------------------------------------
  heading('Readings over time');
  para('Valid readings only. The shaded band is the configured normal range; a dashed edge marks each limit.', { color: MUTED, size: 8.5 });
  for (const parameter of REPORT_WATER_PARAMETERS) drawChart(doc, parameter, input.readings, summary, { width, ensure });

  // ---- Maintenance ---------------------------------------------------------
  heading('Maintenance log');
  if (summary.maintenance.items.length === 0) para('No maintenance was logged in this period.', { color: MUTED });
  else {
    table(
      [{ label: 'When', width: 0.18 }, { label: 'Type', width: 0.14 }, { label: 'By', width: 0.2 }, { label: 'Water change', width: 0.12, align: 'right' }, { label: 'Notes', width: 0.36 }],
      summary.maintenance.items.map((item) => [manilaDateTime(item.performedAt), item.type, item.by ?? '-', item.waterChangePercent === null ? '-' : `${item.waterChangePercent}%`, `${item.notes ?? ''}${item.recommendationId ? `${item.notes ? ' ' : ''}(for a recommendation)` : ''}` || '-']),
    );
  }
  const cleaning = summary.maintenance.nextCleaning;
  para(cleaning.nextCleaningDue === null
    ? `Next cleaning: not scheduled (${cleaning.reason ?? 'unavailable'}).`
    : `Next cleaning: ${manilaDateTime(cleaning.nextCleaningDue)}${cleaning.due ? ' (DUE)' : ''}; reason: ${cleaning.reason ?? '-'}${cleaning.intervalDays ? `; interval ${cleaning.intervalDays} days` : ''}.`);

  // ---- Device activity -----------------------------------------------------
  const devices = summary.devices;
  heading('Device activity');
  para(`Commands: ${devices.commands.total} sent. Done ${devices.commands.done}, failed ${devices.commands.failed}, no response ${devices.commands.noResponse}, waiting ${devices.commands.pending}.`);
  const types = Object.entries(devices.commands.byType);
  if (types.length > 0) para(`By type: ${types.map(([type, count]) => `${type} ${count}`).join(', ')}.`, { size: 8.5, color: MUTED });
  para(`Power interruptions: ${devices.powerInterruptions.count}, total ${formatDuration(devices.powerInterruptions.totalMs)}.`);
  for (const item of devices.powerInterruptions.items.slice(0, 20)) {
    para(`  ${manilaDateTime(item.start)} to ${item.end === null ? 'still interrupted' : manilaDateTime(item.end)}`, { size: 8.5 });
  }

  // ---- Thresholds and rules -------------------------------------------------
  const thresholds = summary.thresholds;
  heading('Thresholds and rules in force');
  para(`Species profile: ${thresholds.speciesId ?? 'none'}. Threshold status: ${thresholds.status.toUpperCase()}.${thresholds.overridden.length ? ` Overridden for this tank: ${thresholds.overridden.map(parameterName).join(', ')}.` : ''}${thresholds.missing.length ? ` Missing (not evaluated): ${thresholds.missing.map(parameterName).join(', ')}.` : ''}`);
  table(
    [{ label: 'Parameter', width: 0.4 }, { label: 'Normal min', width: 0.3, align: 'right' }, { label: 'Normal max', width: 0.3, align: 'right' }],
    Object.entries(thresholds.values).map(([parameter, range]) => [`${parameterName(parameter)}${range.unit ? ` (${range.unit})` : ''}`, fmt(range.min), fmt(range.max)]),
  );
  para(`${thresholds.rules.total} rule(s): ${thresholds.rules.approved} approved, ${thresholds.rules.draft} draft.`);
  if (thresholds.rules.list.length > 0) {
    table(
      [{ label: 'Rule', width: 0.24 }, { label: 'Parameter', width: 0.16 }, { label: 'Severity', width: 0.12 }, { label: 'Title', width: 0.34 }, { label: 'Status', width: 0.14 }],
      thresholds.rules.list.map((rule) => [rule.ruleId, parameterName(rule.parameter), rule.severity.toUpperCase(), rule.title, `${rule.status}${rule.enabled ? '' : ' (off)'}`]),
    );
  }

  // ---- Page numbers ---------------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const y = doc.page.height - MARGIN - 12;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(`SmartAqua Pro | ${summary.aquarium.name} | ${summary.period.label}`, MARGIN, y, { width: width / 2, lineBreak: false });
    doc.text(`Page ${index + 1} of ${range.count}`, MARGIN + width / 2, y, { width: width / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

function drawChart(
  doc: PDFKit.PDFDocument,
  parameter: WaterParameter,
  readings: ReadingRow[],
  summary: StructuredSummary,
  layout: { width: number; ensure: (height: number) => void }
) {
  const height = 120;
  layout.ensure(height + 34);
  const label = PARAMETER_LABELS[parameter];
  const top = doc.y + 4;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`${label.label}${label.unit ? ` (${label.unit})` : ''}`, MARGIN, top);
  const plotTop = top + 14;
  const left = MARGIN + 34;
  const plotWidth = layout.width - 34;
  const { start } = summary.period;
  const end = summary.period.effectiveEnd > start ? summary.period.effectiveEnd : summary.period.end;
  let points = readings
    .filter((row) => row.validity?.[parameter] === 'valid' && row.values[parameter] !== undefined && row.at >= start && row.at < end)
    .map((row) => ({ at: row.at, value: row.values[parameter] as number }));
  if (points.length > MAX_CHART_POINTS) {
    const step = Math.ceil(points.length / MAX_CHART_POINTS);
    points = points.filter((_, index) => index % step === 0);
  }
  const range = summary.thresholds.values[parameter];
  const candidates = [...points.map((point) => point.value), range?.min, range?.max].filter((value): value is number => typeof value === 'number');
  doc.rect(left, plotTop, plotWidth, height).lineWidth(0.5).strokeColor(RULE).stroke();
  if (candidates.length === 0) {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('No valid readings and no configured range in this period.', left + 8, plotTop + height / 2 - 5);
    doc.x = MARGIN;
    doc.y = plotTop + height + 18;
    return;
  }
  let low = Math.min(...candidates);
  let high = Math.max(...candidates);
  if (high - low < 1e-9) { low -= 1; high += 1; }
  const pad = (high - low) * 0.08;
  low -= pad;
  high += pad;
  const y = (value: number) => plotTop + height - ((value - low) / (high - low)) * height;
  const x = (at: number) => left + ((at - start) / (end - start)) * plotWidth;

  if (range && (range.min !== null || range.max !== null)) {
    const bandTop = y(range.max ?? high);
    const bandBottom = y(range.min ?? low);
    doc.rect(left, bandTop, plotWidth, bandBottom - bandTop).fill(BAND);
    doc.lineWidth(0.6).strokeColor(BAND_EDGE).dash(3, { space: 2 });
    if (range.max !== null) doc.moveTo(left, y(range.max)).lineTo(left + plotWidth, y(range.max)).stroke();
    if (range.min !== null) doc.moveTo(left, y(range.min)).lineTo(left + plotWidth, y(range.min)).stroke();
    doc.undash();
    doc.font('Helvetica').fontSize(7).fillColor(BAND_EDGE).text('normal range', left + plotWidth - 60, bandTop + 2, { width: 56, align: 'right', lineBreak: false });
  }
  doc.font('Helvetica').fontSize(7).fillColor(MUTED);
  for (const value of [low + pad, (low + high) / 2, high - pad]) {
    doc.text(fmt(value, 1), MARGIN, y(value) - 3, { width: 30, align: 'right', lineBreak: false });
  }
  doc.text(manilaDateTime(start), left, plotTop + height + 3, { width: 120, lineBreak: false });
  doc.text(manilaDateTime(end), left + plotWidth - 120, plotTop + height + 3, { width: 120, align: 'right', lineBreak: false });

  if (points.length === 0) {
    doc.fontSize(8.5).text('No valid readings in this period.', left + 8, plotTop + 6, { lineBreak: false });
  } else {
    doc.lineWidth(1).strokeColor(LINE);
    let previous: { at: number; value: number } | null = null;
    for (const point of points) {
      // A gap longer than 30 min is left as a gap instead of drawing across it.
      if (!previous || point.at - previous.at > 30 * 60_000) doc.moveTo(x(point.at), y(point.value));
      else doc.lineTo(x(point.at), y(point.value));
      previous = point;
    }
    doc.stroke();
    if (points.length < 3) for (const point of points) doc.circle(x(point.at), y(point.value), 1.6).fill(LINE);
  }
  doc.x = MARGIN;
  doc.y = plotTop + height + 18;
}
