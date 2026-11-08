import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getApp } from 'firebase/app';
import { auth, db } from '../firebase';

// FR15 web push (Sprint 4; docs/notifications.md). The permission prompt is
// only ever shown from a user action ("Turn on alerts"), never on page load.
// Each browser's FCM token is stored at users/{uid}/fcmTokens/{sha256(token)[:40]};
// the functions delete tokens FCM reports as invalid.
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';
const USING_EMULATORS = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
const SW_URL = '/firebase-messaging-sw.js';

export type PushAvailability =
  | { available: true }
  | { available: false; reason: 'unsupported' | 'ios-not-installed' | 'not-configured' | 'emulator' | 'denied' };

export function isIos() {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone() {
  return typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export async function pushAvailability(): Promise<PushAvailability> {
  if (USING_EMULATORS) return { available: false, reason: 'emulator' };
  if (isIos() && !isStandalone()) return { available: false, reason: 'ios-not-installed' };
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window) || !(await isSupported().catch(() => false))) {
    return { available: false, reason: 'unsupported' };
  }
  if (!VAPID_KEY) return { available: false, reason: 'not-configured' };
  if (Notification.permission === 'denied') return { available: false, reason: 'denied' };
  return { available: true };
}

async function tokenId(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function platform(): 'web' | 'ios-pwa' | 'android' {
  if (isIos()) return 'ios-pwa';
  return /Android/i.test(navigator.userAgent) ? 'android' : 'web';
}

/** "Chrome on macOS": enough to recognise a device, nothing more. */
export function userAgentSummary(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

async function registration() {
  return navigator.serviceWorker.register(SW_URL, { scope: '/' });
}

async function saveToken(token: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  const ref = doc(db, 'users', uid, 'fcmTokens', await tokenId(token));
  const existing = await getDoc(ref);
  const now = Date.now();
  await setDoc(ref, {
    token,
    platform: platform(),
    userAgent: userAgentSummary().slice(0, 120),
    createdAt: existing.exists() && typeof existing.get('createdAt') === 'number' ? existing.get('createdAt') : now,
    lastSeenAt: now,
  });
}

/** Call ONLY from a click handler: asks for permission, registers, stores the token. */
export async function enablePush() {
  const availability = await pushAvailability();
  if (!availability.available) throw new Error(`Push is not available here (${availability.reason}).`);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in the browser settings.');
  const token = await getToken(getMessaging(getApp()), { vapidKey: VAPID_KEY, serviceWorkerRegistration: await registration() });
  if (!token) throw new Error('This browser did not give a push token.');
  await saveToken(token);
  return token;
}

/** On app start: if alerts were already turned on here, refresh lastSeenAt (and the token if it rotated). */
export async function refreshPushToken() {
  if (!(await pushAvailability()).available || Notification.permission !== 'granted') return;
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!existing) return;
  const token = await getToken(getMessaging(getApp()), { vapidKey: VAPID_KEY, serviceWorkerRegistration: existing });
  if (token) await saveToken(token);
}

export async function disablePush() {
  const uid = auth.currentUser?.uid;
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!uid || !existing) return;
  const messaging = getMessaging(getApp());
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: existing }).catch(() => '');
  if (token) await deleteDoc(doc(db, 'users', uid, 'fcmTokens', await tokenId(token)));
  await deleteToken(messaging).catch(() => undefined);
}

export function pushEnabledHere() {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
}
