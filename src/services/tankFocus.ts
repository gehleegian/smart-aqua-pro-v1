// Which tank a page should open on: set by a notification deep link
// (/?tank=<id>) or by "Edit schedule" on the Automation page, read once by the
// Dashboard / Monitoring controllers. Only a hint: the pages still show only
// the tanks the member may see.
const KEY = 'smartAquaFocusTank';

export function requestTankFocus(aquariumId: string) {
  try {
    window.sessionStorage.setItem(KEY, aquariumId);
  } catch {
    // Storage unavailable (private mode): the page opens on its default tank.
  }
}

export function consumeTankFocus() {
  try {
    const value = window.sessionStorage.getItem(KEY) ?? '';
    window.sessionStorage.removeItem(KEY);
    return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : '';
  } catch {
    return '';
  }
}

/** Reads and strips ?tank= from the address bar (notification click). */
export function captureTankFromUrl() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const tank = url.searchParams.get('tank') ?? '';
  if (!tank) return '';
  url.searchParams.delete('tank');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  if (/^[A-Za-z0-9_-]{1,128}$/.test(tank)) requestTankFocus(tank);
  return tank;
}
