import { useEffect, useRef, useState } from 'react';
import { setItem } from './store';

/** State that is saved to the device whenever it changes (after the first load). */
export function usePersisted<T>(key: string, initial: T, ready: boolean): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (first.current) {
      first.current = false;
      return;
    }
    void setItem(key, value);
  }, [key, value, ready]);
  return [value, setValue];
}

/** Whether the system asks for a dark theme, kept up to date. */
export function useSystemDark(): boolean {
  const query = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)');
  const [dark, setDark] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return dark;
}

/** The current time, ticking every `intervalMs`. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
