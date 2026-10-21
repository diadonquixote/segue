/**
 * A short name for where the user is ("Urdaneta, Makati"), for the location
 * pin. Asked from the API (OpenStreetMap, cached there too) and remembered on
 * the phone by area, so it shows offline and isn't asked twice.
 */
import { useEffect, useState } from 'react';
import type { LatLng } from '@segue/engine';
import { API_URL } from './reroute';
import { getItem, setItem } from './store';

/** About 1 km: plenty for a neighbourhood name, and the exact position stays on the phone. */
export const areaKey = (l: LatLng) => `${l.lat.toFixed(2)},${l.lng.toFixed(2)}`;

let memory: Record<string, string | null> | null = null;

async function cache(): Promise<Record<string, string | null>> {
  memory ??= (await getItem<Record<string, string | null>>('placeNames')) ?? {};
  return memory;
}

export async function placeNameFor(location: LatLng): Promise<string | null | undefined> {
  const key = areaKey(location);
  const known = await cache();
  if (key in known) return known[key];
  const [lat, lng] = key.split(',');
  try {
    const res = await fetch(`${API_URL}/v1/place-name?${new URLSearchParams({ lat: lat!, lng: lng! })}`);
    if (!res.ok) return undefined;
    const { name } = (await res.json()) as { name: string | null };
    known[key] = name ?? null;
    await setItem('placeNames', known);
    return name ?? null;
  } catch {
    return undefined; // offline: try again next time
  }
}

/** The place name for `location`, once known; undefined while unknown. */
export function usePlaceName(location: LatLng | undefined): string | undefined {
  const [name, setName] = useState<string | undefined>();
  const key = location ? areaKey(location) : '';
  useEffect(() => {
    if (!location) return setName(undefined);
    let current = true;
    void placeNameFor(location).then((n) => current && setName(n ?? undefined));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return name;
}
