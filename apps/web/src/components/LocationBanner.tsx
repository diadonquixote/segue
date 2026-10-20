import type { LocationBannerCopy } from '../lib/locationStatus';

/**
 * Why Segue wants the location (shown just before the browser asks), or how
 * to allow it. Information only: Segue asks and picks up the change by itself.
 */
export function LocationBanner({ banner }: { banner: LocationBannerCopy | null }) {
  if (!banner) return null;
  return (
    <div className={`notice location-banner location-${banner.kind}`} role="status">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.3" fill="currentColor" />
      </svg>
      <p>{banner.text}</p>
    </div>
  );
}
