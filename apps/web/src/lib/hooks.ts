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

/** The current time, ticking every `intervalMs`. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
