export function getHealthStatus(level: number, quality: number): 'healthy' | 'warning' {
  if (level < 75 || quality < 80) {
    return 'warning';
  }

  return 'healthy';
}

export function getQualityLabel(quality: number) {
  if (quality >= 90) return 'Excellent';
  if (quality >= 80) return 'Good';
  if (quality >= 70) return 'Fair';
  return 'Poor';
}

export function getLevelLabel(level: number) {
  if (level >= 90) return 'High';
  if (level >= 75) return 'Normal';
  if (level >= 60) return 'Low';
  return 'Critical';
}

export function getTemperatureLabel(temp: number, minTemp: number, maxTemp: number) {
  if (temp < minTemp || temp > maxTemp) {
    return 'Out of Range';
  }

  return 'Normal';
}