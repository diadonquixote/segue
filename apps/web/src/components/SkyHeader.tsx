import { useEffect } from 'react';
import { clock, longDate } from '../lib/format';
import { SKY_LOOK } from '../lib/skyRenderer';
import { SKY_COPY, type SkyView } from '../lib/weather';
import { Sky } from './Sky';

export type View = 'today' | 'blocks';

export type LocationStatus =
  | { kind: 'located'; at?: string }
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
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.3" fill="currentColor" />
    </svg>
  );
}

function LocationControl({ location, onLocate }: Pick<Props, 'location' | 'onLocate'>) {
  const located = location.kind === 'located';
  const label = location.kind === 'locating' ? 'Finding you…' : located ? 'Your location' : 'Use my location';
  return (
    <div className="where">
      <button
        type="button"
        className={`where-button${located ? ' on' : ''}`}
        onClick={onLocate}
        disabled={location.kind === 'locating'}
        aria-label={located ? 'Update your location' : undefined}
      >
        <PinIcon />
        {label}
      </button>
      {location.kind === 'located' && location.at && <span className="where-note">Updated {clock(location.at)}</span>}
      {location.kind === 'default' && <span className="where-note">Showing Metro Manila for now.</span>}
      {location.kind === 'denied' && (
        <p className="where-note where-blocked" role="status">
          Location is blocked for Segue. Allow it in your browser's site settings, then tap again.
        </p>
      )}
    </div>
  );
}

export function SkyHeader({ sky, now, view, onView, location, onLocate }: Props) {
  const copy = SKY_COPY[sky.condition];
  const top = SKY_LOOK[sky.condition][sky.isDay ? 'day' : 'night'].sky[0];

  // Tint the phone's status bar to match the sky.
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', top));
  }, [top]);

  return (
    <header className="sky-band">
      <Sky condition={sky.condition} isDay={sky.isDay} />
      <div className="sky-content">
        <div className="top">
          <div className="brand">
            <img className="logo-mark" src="/icon.svg" width="40" height="40" alt="" />
            <div>
              <h1 className="wordmark">Segue</h1>
              <p className="date">{longDate(now)}</p>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            <button type="button" aria-current={view === 'today' ? 'page' : undefined} onClick={() => onView('today')}>
              Today
            </button>
            <button type="button" aria-current={view === 'blocks' ? 'page' : undefined} onClick={() => onView('blocks')}>
              Blocks
            </button>
          </nav>
        </div>

        <div className="weather" aria-live="polite">
          {sky.known ? (
            <>
              <p className="weather-now">
                {sky.temperatureC !== undefined && <span className="temp">{Math.round(sky.temperatureC)}°</span>}
                <span className="condition">
                  {sky.isDay ? copy.day : copy.night}
                  {sky.preview && <span className="preview-tag">Preview</span>}
                </span>
              </p>
              <p className="weather-hint">{copy.hint}</p>
            </>
          ) : (
            <p className="weather-now">
              <span className="condition">Weather isn't available right now</span>
            </p>
          )}
          <LocationControl location={location} onLocate={onLocate} />
        </div>
      </div>
    </header>
  );
}
