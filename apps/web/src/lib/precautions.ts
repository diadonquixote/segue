/**
 * Weather precautions: "Bring an umbrella", "Wear sunscreen", "Drive safely".
 * Pure, so every rule is testable. Thresholds:
 * - Heat uses the feels-like temperature with PAGASA's heat index levels:
 *   33–41 °C extreme caution, 42 °C and up danger.
 * - UV uses the WHO scale: 6–7 high, 8–10 very high, 11+ extreme.
 * - Rain is "likely" from a 50% chance in an hour within the next 12 hours.
 */
import type { TravelMode } from '@segue/engine';
import { clock } from './format';
import type { CurrentWeather, SkyView } from './weather';

export type PrecautionKind = 'storm' | 'flood' | 'drive' | 'fog' | 'umbrella' | 'heat' | 'sun' | 'wind' | 'cold';

export interface Precaution {
  kind: PrecautionKind;
  level: 'danger' | 'warn' | 'info';
  /** what to do, in a few words: also used inside other reminders */
  title: string;
  /** why, and how */
  body: string;
}

const HEAT_CAUTION = 33;
const HEAT_DANGER = 42;
const UV_HIGH = 6;
const UV_VERY_HIGH = 8;
const UV_EXTREME = 11;
const RAIN_LIKELY = 50;
const GUSTY = 50;
const CHILLY = 12;

const ORDER = { danger: 0, warn: 1, info: 2 } as const;
const MAX_SHOWN = 4;

const round = (n: number) => Math.round(n);
/** The hour on the clock where the sky is (not the device's). */
const localHour = (ms: number, offsetMin: number) => new Date(ms + offsetMin * 60_000).getUTCHours();
const isDaytimeHour = (h: number) => h >= 7 && h < 18;

/** The warmest daytime hour coming up (or now), as feels-like °C. */
function peakFeels(w: CurrentWeather, now: Date, offsetMin: number): { c: number; at?: string } | null {
  const candidates: { c: number; at?: string }[] = [];
  if (w.feelsLikeC !== undefined && isDaytimeHour(localHour(now.getTime(), offsetMin))) candidates.push({ c: w.feelsLikeC });
  for (const h of w.upcoming ?? []) {
    if (h.feelsLikeC !== undefined && isDaytimeHour(localHour(Date.parse(h.time), offsetMin)) && Date.parse(h.time) >= now.getTime() - 3_600_000) {
      candidates.push({ c: h.feelsLikeC, at: h.time });
    }
  }
  return candidates.reduce<{ c: number; at?: string } | null>((best, x) => (!best || x.c > best.c ? x : best), null);
}

/** The highest UV now or in the coming hours. */
function peakUv(w: CurrentWeather, now: Date): { uv: number; at?: string } | null {
  const candidates: { uv: number; at?: string }[] = [];
  if (w.uvIndex !== undefined) candidates.push({ uv: w.uvIndex });
  for (const h of w.upcoming ?? []) {
    if (h.uvIndex !== undefined && Date.parse(h.time) >= now.getTime() - 3_600_000) candidates.push({ uv: h.uvIndex, at: h.time });
  }
  return candidates.reduce<{ uv: number; at?: string } | null>((best, x) => (!best || x.uv > best.uv ? x : best), null);
}

const DRIVE_COPY: Record<TravelMode, string> = {
  drive: 'Roads are slippery and harder to see. Slow down, keep a longer gap and turn your headlights on.',
  local: 'Rides are slower in heavy rain. Leave early, and hold on in jeeps and trikes on wet roads.',
  transit: 'Trains and buses run slower and get crowded. Leave early and watch your step on wet platforms.',
  walk: 'Watch your step on wet roads, and stay on paths you can see the bottom of.',
};

export function precautionsFor(sky: SkyView, ctx: { now: Date; mode: TravelMode }): Precaution[] {
  // A stand-in sky (Manila while the user's location is unknown) isn't their weather to act on.
  if (!sky.known || sky.notYours) return [];
  const offsetMin = sky.utcOffsetMinutes ?? sky.details?.utcOffsetMinutes ?? -ctx.now.getTimezoneOffset();
  const { now, mode } = ctx;
  const w: CurrentWeather = sky.details ?? { condition: sky.condition, isDay: sky.isDay, temperatureC: sky.temperatureC, observedAt: now.toISOString() };
  const out: Precaution[] = [];
  const wetNow = w.condition === 'rain' || w.condition === 'heavy-rain' || w.condition === 'storm';
  const heavy = w.condition === 'heavy-rain' || w.condition === 'storm';

  if (w.condition === 'storm') {
    out.push({
      kind: 'storm',
      level: 'danger',
      title: 'Stay safe in the storm',
      body: "There's a thunderstorm nearby. Stay indoors when you can, and if you're out, keep away from open fields, tall trees and metal poles.",
    });
  }

  if (heavy) {
    out.push({
      kind: 'drive',
      level: 'warn',
      title: mode === 'walk' ? 'Walk carefully' : mode === 'drive' ? 'Drive safely' : 'Ride safely',
      body: DRIVE_COPY[mode],
    });
    out.push({
      kind: 'flood',
      level: 'warn',
      title: 'Avoid flooded streets',
      body: "Don't walk or drive through floodwater. It can hide open drains and carry disease.",
    });
  } else if (w.condition === 'rain' && mode === 'drive') {
    out.push({ kind: 'drive', level: 'info', title: 'Drive safely', body: 'Wet roads: drive a little slower and keep more distance.' });
  }

  if (w.condition === 'fog') {
    out.push({
      kind: 'fog',
      level: 'warn',
      title: mode === 'drive' ? 'Drive slowly in the fog' : 'Take care in the fog',
      body:
        mode === 'drive'
          ? "It's hard to see far. Use low-beam headlights, slow down and leave a long gap."
          : "It's hard to see far, and drivers can't see you well either. Allow extra time and cross roads with care.",
    });
  }

  // Umbrella: raining now, or likely later today.
  const rainLater = (w.upcoming ?? []).find((h) => h.rainChance >= RAIN_LIKELY && Date.parse(h.time) > now.getTime());
  if (wetNow) {
    out.push({ kind: 'umbrella', level: heavy ? 'warn' : 'info', title: 'Bring an umbrella', body: "It's raining where you are. A raincoat helps on a jeep or trike." });
  } else if (rainLater) {
    out.push({
      kind: 'umbrella',
      level: 'info',
      title: 'Bring an umbrella',
      body: `Rain is likely from ${clock(rainLater.time)} (${round(rainLater.rainChance)}% chance).`,
    });
  }

  // Heat, by how hot it feels.
  const feels = peakFeels(w, now, offsetMin);
  const feelsNow = w.feelsLikeC;
  if (feelsNow !== undefined && feelsNow >= HEAT_DANGER) {
    out.push({
      kind: 'heat',
      level: 'danger',
      title: 'Dangerous heat: stay cool',
      body: `It feels like ${round(feelsNow)}°. Stay in the shade from 10 AM to 4 PM, drink water often, and rest if you feel dizzy or sick.`,
    });
  } else if (feels && feels.c >= HEAT_CAUTION) {
    const when = feels.at && Date.parse(feels.at) > now.getTime() + 3_600_000 ? ` around ${clock(feels.at)}` : '';
    out.push({
      kind: 'heat',
      level: feels.c >= HEAT_DANGER ? 'danger' : 'warn',
      title: 'Drink water, find shade',
      body: `It will feel like ${round(feels.c)}°${when}. Bring water, wear light clothes, and take breaks in the shade.`,
    });
  }

  // Sun, by UV.
  const uv = peakUv(w, now);
  if (uv && uv.uv >= UV_HIGH && !heavy) {
    const strength = uv.uv >= UV_EXTREME ? 'extreme' : uv.uv >= UV_VERY_HIGH ? 'very high' : 'high';
    const when = uv.at && Date.parse(uv.at) > now.getTime() + 3_600_000 ? ` around ${clock(uv.at)}` : '';
    out.push({
      kind: 'sun',
      level: uv.uv >= UV_VERY_HIGH ? 'warn' : 'info',
      title: 'Wear sunscreen',
      body: `UV will be ${strength} (${round(uv.uv)})${when}. Use SPF 30 or higher, and bring a hat or sunglasses.`,
    });
  }

  if (w.gustKmh !== undefined && w.gustKmh >= GUSTY) {
    out.push({
      kind: 'wind',
      level: 'warn',
      title: 'Watch for strong winds',
      body: `Gusts up to ${round(w.gustKmh)} km/h. Hold on to umbrellas, and stay clear of trees, signs and loose roofing.`,
    });
  }

  if (feelsNow !== undefined && feelsNow <= CHILLY) {
    out.push({ kind: 'cold', level: 'info', title: 'Bring a jacket', body: `It feels like ${round(feelsNow)}° outside.` });
  }

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]).slice(0, MAX_SHOWN);
}
