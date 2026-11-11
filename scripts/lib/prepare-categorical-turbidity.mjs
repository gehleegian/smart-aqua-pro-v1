// Pure preparation only: no Firebase connection, writes, approval or deployment.
export const CATEGORICAL_TURBIDITY_RULE_IDS = Object.freeze([
  'turbidity_warning', 'turbidity_warning_filter_off', 'turbidity_warning_filter_on',
]);

export function prepareCategoricalTurbidity(rules) {
  if (!Array.isArray(rules)) throw new Error('A rule array is required.');
  return CATEGORICAL_TURBIDITY_RULE_IDS.map(id => {
    const matches = rules.filter(rule => (rule.id ?? rule.ruleId) === id);
    if (matches.length !== 1) throw new Error('Expected exactly one rule: ' + id);
    const before = structuredClone(matches[0]);
    if (before.parameter !== 'turbidity' || before.severity !== 'warning')
      throw new Error('Unexpected rule parameter/severity: ' + id);
    const condition = before.condition;
    const numeric = condition?.op === 'gt' && condition?.ref === 'max' &&
      Object.keys(condition).every(key => key === 'op' || key === 'ref');
    const categorical = condition?.op === 'eq' && condition?.value === 'Cloudy' &&
      Object.keys(condition).every(key => key === 'op' || key === 'value');
    if (!numeric && !categorical) throw new Error('Unexpected condition; review manually: ' + id);
    if (categorical) return { id, changed: false, before, after: structuredClone(before) };
    const after = {
      ...structuredClone(before),
      condition: { op: 'eq', value: 'Cloudy' },
      // The audited save workflow also invalidates approval on content changes.
      status: 'draft', approvedBy: null, approvedAt: null,
    };
    return { id, changed: true, before, after };
  });
}
