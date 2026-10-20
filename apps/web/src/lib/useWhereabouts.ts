/**
 * Finds and follows the user's position on its own: no button to press.
 * Asks on first open (after a short explanation), watches with low power while
 * the tab is on screen, stops when it's hidden, and picks up by itself when the
 * user allows location in the browser. The last fix is saved on the phone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@segue/engine';
import {
  EXPLAIN_FIRST_MS,
  deviceZone,
  fixWorthKeeping,
  locationPermission,
  onPermissionChange,
  skySource,
  watchLocation,
  watchPlan,
  type Fix,
  type LocationPermission,
  type SkySource,
} from './location';
import { getItem, setItem } from './store';

export interface Whereabouts {
  /** 'unknown' until the browser has answered */
  permission: LocationPermission | 'unknown';
  /** the last real position, from this session or saved */
  fix?: Fix;
  /** a position arrived in this session */
  live: boolean;
  /** the explanation is showing and the browser is about to ask (or is asking) */
  asking: boolean;
  /** the position couldn't be found for now (no signal, GPS off), though it's allowed */
  unavailable: boolean;
  source: SkySource;
  /**
   * Nothing saved yet and the first position is on its way (or the browser hasn't answered):
   * show no weather rather than a stand-in's, so another city's sky is never shown as the user's.
   */
  waiting: boolean;
  /** a fresh position from somewhere else in the app, e.g. a re-route */
  remember: (location: LatLng) => void;
}

const visibleNow = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** `legacy` is a position saved by older versions in settings, used once if nothing else is saved. */
export function useWhereabouts(ready: boolean, legacy?: { location?: LatLng; at?: string }): Whereabouts {
  const [permission, setPermission] = useState<LocationPermission | 'unknown'>('unknown');
  const [fix, setFix] = useState<Fix | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const [asking, setAsking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [visible, setVisible] = useState(visibleNow);
  const fixRef = useRef<Fix | undefined>(undefined);
  // Turned down in this session: a later "prompt" from the browser doesn't mean "ask again".
  const refused = useRef(false);
  const fromBrowser = useCallback((p: LocationPermission) => setPermission(refused.current && p === 'prompt' ? 'denied' : p), []);
  const zone = deviceZone();

  const keep = useCallback((next: Fix) => {
    setLive(true);
    setUnavailable(false);
    if (!fixWorthKeeping(fixRef.current, next)) return;
    fixRef.current = next;
    setFix(next);
    void setItem('fix', next);
  }, []);

  // The saved fix first, so the sky is right straight away and offline.
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const saved = await getItem<Fix>('fix');
      const old = !saved && legacy?.location && legacy.at ? { location: legacy.location, at: legacy.at } : undefined;
      const first = saved ?? old;
      if (first && !fixRef.current) {
        fixRef.current = first;
        setFix(first);
        if (old) void setItem('fix', old);
      }
      setLoaded(true);
      fromBrowser(await locationPermission());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Pick up a change the user makes in the browser's site settings, without a reload.
  // A change there is the user's own choice, so it always counts.
  useEffect(
    () =>
      onPermissionChange((p) => {
        refused.current = false;
        setPermission(p);
      }),
    [],
  );

  // Pause when the tab is hidden; check the permission again when it comes back.
  useEffect(() => {
    const on = () => {
      const v = visibleNow();
      setVisible(v);
      if (v) void locationPermission().then(fromBrowser);
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [fromBrowser]);

  const plan = loaded ? watchPlan(permission, visible) : 'idle';
  useEffect(() => {
    if (plan === 'idle') {
      setAsking(false);
      return;
    }
    let stop = () => {};
    const start = () => {
      stop = watchLocation(
        (f) => {
          setAsking(false);
          refused.current = false;
          setPermission('granted');
          keep(f);
        },
        (reason) => {
          setAsking(false);
          if (reason === 'denied') {
            refused.current = true;
            setPermission('denied');
          }
          else setUnavailable(true);
        },
      );
    };
    // Say why first, then let the browser ask.
    if (plan === 'explain-then-watch') {
      setAsking(true);
      const t = setTimeout(start, EXPLAIN_FIRST_MS);
      return () => {
        clearTimeout(t);
        stop();
      };
    }
    start();
    return () => stop();
  }, [plan, keep]);

  const remember = useCallback(
    (location: LatLng) => {
      const z = deviceZone();
      keep({ location, at: new Date().toISOString(), ...(z && { zone: z }) });
      setPermission('granted');
    },
    [keep],
  );

  const waiting = !fix && (permission === 'unknown' || asking || (permission === 'granted' && !live && !unavailable));
  return { permission, fix, live, asking, unavailable, waiting, source: skySource({ fix, live, zone }), remember };
}
