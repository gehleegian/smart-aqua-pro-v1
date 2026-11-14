// Navigation hints only. Callers must resolve restored IDs against authorized data.
export function readPageSelection(scope: string, field: string, fallback = '') {
  try {
    const value = window.sessionStorage.getItem(`smartAquaView:${scope}:${field}`);
    return value !== null && value.length <= 256 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function savePageSelection(scope: string, field: string, value: string) {
  try {
    window.sessionStorage.setItem(`smartAquaView:${scope}:${field}`, value);
  } catch {
    // Storage restrictions must not prevent navigation.
  }
}
