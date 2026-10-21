/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** OAuth client id (Web application) for Google Calendar; leave unset to hide the feature */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** "true" keeps the ?sky= previews in a production build (for design reviews only) */
  readonly VITE_ENABLE_SKY_PREVIEW?: string;
}
