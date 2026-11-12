// Extend the deployed source, not the broader unreleased repository rules.
export function addTdsProfileValidation(source) {
  const baseline = source.replace(/\r\n/g, '\n');
  if (/minTdsPpm|maxTdsPpm|validTdsPpmRange/.test(baseline)) {
    throw new Error('TDS_RULES_ALREADY_PRESENT_REVIEW_REQUIRED');
  }
  const fields = /    function userAquariumUpdateFields\(\) \{[\s\S]*?\n    \}/;
  const block = baseline.match(fields)?.[0];
  const anchor = "        'minQuality',\n";
  if (!block || block.split(anchor).length !== 2) throw new Error('UPDATE_FIELDS_ANCHOR_CHANGED');
  const updatedBlock = block.replace(anchor, `${anchor}        'minTdsPpm',\n        'maxTdsPpm',\n`);
  const validatorAnchor = '    function validAquariumFieldValues(changed) {';
  const checkAnchor = "        && (!changed.hasAny(['minQuality']) || request.resource.data.minQuality is number)";
  const validator = `    function validTdsPpmRange(data) {
      return !data.keys().hasAny(['minTdsPpm', 'maxTdsPpm'])
        || (data.keys().hasAll(['minTdsPpm', 'maxTdsPpm'])
          && data.minTdsPpm is number
          && data.maxTdsPpm is number
          && data.minTdsPpm >= 0
          && data.minTdsPpm < data.maxTdsPpm
          // Reject infinity/NaN without imposing a water-quality upper limit.
          && data.maxTdsPpm - data.maxTdsPpm == 0);
    }

`;
  const check = "\n        && (!changed.hasAny(['minTdsPpm', 'maxTdsPpm']) || validTdsPpmRange(request.resource.data))";
  if (baseline.split(validatorAnchor).length !== 2 || baseline.split(checkAnchor).length !== 2)
    throw new Error('VALIDATION_ANCHOR_CHANGED');
  const candidate = baseline.replace(block, updatedBlock)
    .replace(validatorAnchor, validator + validatorAnchor)
    .replace(checkAnchor, checkAnchor + check);
  // Removing precisely the three insertions must recover every original byte
  // (apart from line endings). No access rule or existing validator changes.
  const restored = candidate.replace(updatedBlock, block)
    .replace(validator + validatorAnchor, validatorAnchor)
    .replace(checkAnchor + check, checkAnchor);
  if (restored !== baseline) throw new Error('UNRELATED_RULE_CHANGE');
  return candidate;
}
