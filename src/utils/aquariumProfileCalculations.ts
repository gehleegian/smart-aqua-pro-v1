export type AquariumBioloadCalculation = {
  totalFishBiomassG: number;
  estimatedBioloadGL: number;
};

function isPositiveFiniteNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function calculateAquariumBioload(
  fishWeightsG: readonly number[],
  workingWaterVolumeLiters: number
): AquariumBioloadCalculation | null {
  if (
    fishWeightsG.length === 0 ||
    !isPositiveFiniteNumber(workingWaterVolumeLiters) ||
    fishWeightsG.some((weight) => !isPositiveFiniteNumber(weight))
  ) {
    return null;
  }

  const totalFishBiomassG = fishWeightsG.reduce((total, weight) => total + weight, 0);

  return {
    totalFishBiomassG,
    estimatedBioloadGL: totalFishBiomassG / workingWaterVolumeLiters,
  };
}

export function parseFishWeights(
  fishWeights: readonly string[],
  fishCount: number
): number[] | null {
  if (
    !Number.isInteger(fishCount) ||
    fishCount <= 0 ||
    fishWeights.length !== fishCount
  ) {
    return null;
  }

  const parsedWeights = fishWeights.map(Number);
  return parsedWeights.every(isPositiveFiniteNumber) ? parsedWeights : null;
}

export function readFishWeights(value: unknown, fishCount: number | undefined) {
  if (
    !Array.isArray(value) ||
    !Number.isInteger(fishCount) ||
    !fishCount ||
    fishCount <= 0 ||
    value.length !== fishCount
  ) {
    return undefined;
  }

  const weights = value.filter(
    (weight): weight is number => typeof weight === 'number' && isPositiveFiniteNumber(weight)
  );

  return weights.length === fishCount ? weights : undefined;
}

export function resizeFishWeights(
  currentWeights: readonly string[],
  fishCount: number
) {
  if (!Number.isInteger(fishCount) || fishCount <= 0) {
    return [];
  }

  return Array.from({ length: fishCount }, (_, index) => currentWeights[index] ?? '');
}

export function formatBiomass(value: number | undefined) {
  return value === undefined ? 'Not Configured' : `${formatProfileNumber(value)} g`;
}

export function formatEstimatedBioload(value: number | undefined) {
  return value === undefined ? 'Not Configured' : `${formatProfileNumber(value)} g/L`;
}

function formatProfileNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
