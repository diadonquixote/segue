import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng } from '@segue/engine';
import { getItem, setItem } from './store';
import { moonProgress, sunState } from './sunTimes';
import { fetchCurrentWeather, needsRefresh, previewMoment, skyPreview, skyToShow, skyUtcOffset, type SavedSky, type SkyView } from './weather';

/** After a failed check, wait this long before asking again. */
const RETRY_MS = 5 * 60_000;

/**
 * Current sky for `location`: the saved one first (instant, works offline),
 * refreshed from the API when it's old or the user has moved.
 */
/** `yours` is false when `location` is a stand-in (Manila) because the user's own isn't known. */
export function useSky(location: LatLng, now: Date, { yours = true } = {}): SkyView {
  const [saved, setSaved] = useState<SavedSky | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const lastTry = useRef<{ at: number; key: string } | null>(null);
  const preview = useMemo(() => skyPreview(window.location.search), []);

  useEffect(() => {
    void getItem<SavedSky>('sky').then((s) => {
      setSaved(s);
      setLoaded(true);
    });
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !online || !needsRefresh(saved, location, now)) return;
    const key = `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`;
    const t = Date.now();
    if (lastTry.current && lastTry.current.key === key && t - lastTry.current.at < RETRY_MS) return;
    lastTry.current = { at: t, key };
    // Not cancelled on re-render: the same request stays useful unless a newer one replaced it.
    void fetchCurrentWeather(location).then((weather) => {
      if (!weather || lastTry.current?.key !== key) return;
      const next: SavedSky = { weather, location, fetchedAt: new Date().toISOString() };
      setSaved(next);
      void setItem('sky', next);
    });
  }, [loaded, online, saved, location, now]);

  // The time of day comes from the clock on every tick, never from the saved weather.
  // A preview can move the sky somewhere else (&lat=&lng=) and to another time (&time=).
  const where = preview?.place ?? location;
  const offset = skyUtcOffset({ saved, location: where, yours: yours && !preview?.place, deviceOffset: -now.getTimezoneOffset() });
  const at = preview?.minutes !== undefined ? previewMoment(now, preview.minutes, offset) : now;
  const sun = sunState(at.getTime(), where.lat, where.lng, offset);
  const view: SkyView = {
    ...skyToShow(saved, now, sun, at),
    moonPath: moonProgress(at.getTime(), sun.times.solarNoon),
    southern: where.lat < 0,
    utcOffsetMinutes: offset,
    notYours: !yours,
  };
  // A preview keeps the real temperature but uses its own details, so precautions follow the preview.
  if (!preview) return view;
  return { ...view, condition: preview.condition, details: preview.details, known: true, preview: true, notYours: false };
}
