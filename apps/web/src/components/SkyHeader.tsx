import { useEffect, useMemo } from 'react';
import { longDate } from '../lib/format';
import { toneAt } from '../lib/skyRenderer';
import { skyWords, type SkyView } from '../lib/weather';
import { DEFAULT_PLACE_NAME } from '../lib/seed';
import { Sky, sceneFor } from './Sky';

export type View = 'today' | 'plan' | 'routines';

export type LocationStatus =
  | { kind: 'located'; at?: string; name?: string }
  | { kind: 'default' }
  | { kind: 'denied' }
  | { kind: 'locating' };

interface Props {
  sky: SkyView;
  now: Date;
  view: View;
  onView: (v: View) => void;
  location: LocationStatus;
  onLocate: () => void;
  onSettings: () => void;
  tempUnit: 'C' | 'F';
  /** first-run setup hides the tabs */
  showNav?: boolean;
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.3" fill="currentColor" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const temp = (c: number, unit: 'C' | 'F') => `${Math.round(unit === 'F' ? (c * 9) / 5 + 32 : c)}°`;

export function SkyHeader({ sky, now, view, onView, location, onLocate, onSettings, tempUnit, showNav = true }: Props) {
  // A new scene object only when something the renderer draws has changed.
  const scene = useMemo(
    () => sceneFor(sky),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sky.condition, sky.sun?.elevation, sky.sun?.morning, sky.sun?.progress, sky.moon?.cycle, sky.moonPath, sky.southern],
  );
  const top = toneAt(scene.condition, scene.elevation, scene.morning).sky[0];

  // Tint the phone's status bar to match the sky.
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', top));
  }, [top]);

  const where =
    location.kind === 'located'
      ? (location.name ?? 'Your location')
      : location.kind === 'locating'
        ? 'Finding you…'
        : `Showing ${DEFAULT_PLACE_NAME}. Tap to use your location.`;

  return (
    <header className="sky-band">
      <Sky scene={scene} />
      <div className="sky-content">
        <div className="top">
          <div className="brand">
            <h1 className="wordmark">
              <img src="/wordmark-light.svg" alt="Segue" />
            </h1>
            <p className="date">{longDate(now)}</p>
          </div>
          {showNav && (
            <div className="top-actions">
              <nav className="tabs" aria-label="Sections">
                <button type="button" aria-current={view === 'today' ? 'page' : undefined} onClick={() => onView('today')}>
                  Today
                </button>
                <button type="button" aria-current={view === 'plan' ? 'page' : undefined} onClick={() => onView('plan')}>
                  Plan
                </button>
                <button type="button" aria-current={view === 'routines' ? 'page' : undefined} onClick={() => onView('routines')}>
                  Routines
                </button>
              </nav>
              <button type="button" className="gear" aria-label="Settings" onClick={onSettings}>
                <GearIcon />
              </button>
            </div>
          )}
        </div>

        <div className="weather-line" aria-live="polite">
          <span className="weather-now">
            {sky.known ? (
              <>
                {sky.temperatureC !== undefined && <span className="temp">{temp(sky.temperatureC, tempUnit)}</span>}
                <span className="condition">
                  {skyWords(sky)}
                  {sky.details?.feelsLikeC !== undefined &&
                    (sky.temperatureC === undefined || Math.abs(sky.details.feelsLikeC - sky.temperatureC) >= 2) && (
                      <span className="feels"> · feels {temp(sky.details.feelsLikeC, tempUnit)}</span>
                    )}
                </span>
                {sky.preview && <span className="preview-tag">Preview</span>}
              </>
            ) : (
              <span className="condition">No weather right now</span>
            )}
          </span>
          <button
            type="button"
            className={`where-button${location.kind === 'located' ? ' on' : location.kind === 'locating' ? '' : ' stand-in'}`}
            onClick={onLocate}
            disabled={location.kind === 'locating'}
            aria-label={location.kind === 'located' ? `Update your location${location.name ? `, now ${location.name}` : ''}` : undefined}
            title={location.kind === 'denied' ? "Location is blocked. Allow it in your browser's site settings." : undefined}
          >
            <PinIcon />
            {where}
          </button>
        </div>
      </div>
    </header>
  );
}
