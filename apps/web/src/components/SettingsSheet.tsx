import { useState, type ReactNode } from 'react';
import type { TravelMode } from '@segue/engine';
import { clock } from '../lib/format';
import { MODE_LABEL, type FavoritePlace, type Settings } from '../lib/model';
import { notificationsSupported } from '../lib/useReminders';
import { Segmented, Sheet } from './Sheet';
import type { LocationStatus } from './SkyHeader';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  location: LocationStatus;
  onLocate: () => void;
  favorites: FavoritePlace[];
  onRemoveFavorite: (id: string) => void;
  onToggleReminders: (on: boolean) => void;
  calendar: ReactNode;
  /** who's signed in with Google, or a way to sign up */
  account?: ReactNode;
  onStartOver: () => void;
  onClose: () => void;
}

export function SettingsSheet(props: Props) {
  const { settings, location } = props;
  const [confirming, setConfirming] = useState(false);
  const blocked = notificationsSupported() && Notification.permission === 'denied';

  return (
    <Sheet title="Settings" onClose={props.onClose}>
      <div className="form settings">
        {props.account}
        <section className="settings-group">
          <h3 className="section-title">Your day</h3>
          <label className="field">
            <span>Day ends around</span>
            <input type="time" value={settings.endOfDay} onChange={(e) => e.target.value && props.onChange({ endOfDay: e.target.value })} />
          </label>
          <label className="field">
            <span>Getting around</span>
            <select value={settings.mode} onChange={(e) => props.onChange({ mode: e.target.value as TravelMode })}>
              {(Object.keys(MODE_LABEL) as TravelMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="settings-group">
          <h3 className="section-title">Location</h3>
          <p className="muted small">
            {location.kind === 'located'
              ? `Using your location${location.at ? `, updated ${clock(location.at)}` : ''}.`
              : location.kind === 'denied'
                ? "Location is blocked for Segue. Allow it in your browser's site settings, then tap below."
                : 'Segue plans from Metro Manila until it knows where you are.'}
          </p>
          <button type="button" className="ghost" onClick={props.onLocate} disabled={location.kind === 'locating'}>
            {location.kind === 'locating' ? 'Finding you…' : location.kind === 'located' ? 'Update my location' : 'Use my location'}
          </button>
        </section>

        <section className="settings-group">
          <h3 className="section-title">Reminders</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={!!settings.reminders}
              disabled={!notificationsSupported() || blocked}
              onChange={(e) => props.onToggleReminders(e.target.checked)}
            />
            <span>
              Tell me when to leave, when something runs over, and when rain affects an outdoor plan
              <span className="muted small block">
                {!notificationsSupported()
                  ? "This browser can't show notifications. You'll still see reminders in the app."
                  : blocked
                    ? "Notifications are blocked for Segue. Allow them in your browser's site settings."
                    : 'Works while Segue is open or in the background.'}
              </span>
            </span>
          </label>
        </section>

        <Segmented
          label="Temperature"
          value={settings.tempUnit ?? 'C'}
          onChange={(tempUnit) => props.onChange({ tempUnit })}
          options={[
            { value: 'C', label: '°C' },
            { value: 'F', label: '°F' },
          ]}
        />

        <section className="settings-group">
          <h3 className="section-title">My spots</h3>
          {props.favorites.length === 0 ? (
            <p className="muted small">Save a place from any plan item and Segue will prefer it whenever it fits.</p>
          ) : (
            <ul className="spots">
              {props.favorites.map((f) => (
                <li key={f.id}>
                  <span>
                    {f.name}
                    {f.address && <span className="muted small block">{f.address}</span>}
                  </span>
                  <button type="button" className="text-button" onClick={() => props.onRemoveFavorite(f.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {props.calendar}

        <section className="settings-group">
          <h3 className="section-title">Start over</h3>
          {confirming ? (
            <div className="row-actions">
              <button type="button" className="danger" onClick={props.onStartOver}>
                Yes, clear everything
              </button>
              <button type="button" className="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="text-button" onClick={() => setConfirming(true)}>
              Clear my plans and settings on this device
            </button>
          )}
        </section>
      </div>
    </Sheet>
  );
}
