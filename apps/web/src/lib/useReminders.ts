/**
 * Turns nudges into system notifications while Segue is open or in the
 * background. True push (with the app fully closed) needs a push server,
 * which arrives with accounts; until then this covers the common case.
 */
import { useEffect, useRef } from 'react';
import type { Nudge } from './nudges';

/** Only look this far ahead, so timers stay few and plans can still change. */
const HORIZON_MS = 3 * 60 * 60_000;

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function askNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

async function show(n: Nudge) {
  const options: NotificationOptions = { body: n.body, tag: n.id, icon: '/icon-192.png', badge: '/icon-192.png' };
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (reg) await reg.showNotification(n.title, options);
  else new Notification(n.title, options);
}

export function useReminders(nudges: Nudge[], enabled: boolean) {
  const fired = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !notificationsSupported() || Notification.permission !== 'granted') return;
    const now = Date.now();
    const timers = nudges
      .filter((n) => !fired.current.has(n.id) && n.at - now < HORIZON_MS)
      .map((n) =>
        setTimeout(() => {
          if (fired.current.has(n.id)) return;
          fired.current.add(n.id);
          // When Segue is on screen the in-app banner already says it.
          if (document.visibilityState === 'visible') return;
          void show(n).catch(() => {});
        }, Math.max(0, n.at - now)),
      );
    return () => timers.forEach(clearTimeout);
  }, [nudges, enabled]);
}
