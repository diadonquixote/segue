import { useEffect } from 'react';
import '../landing.css';

const CONTACT_EMAIL = 'pdyntechnology@gmail.com';
const UPDATED = 'October 22, 2026';

/** The privacy policy, at /privacy. Written to match what the code does; change both together. */
export function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy policy · Segue';
    return () => {
      document.title = 'Segue';
    };
  }, []);

  return (
    <div className="landing pp">
      <header className="pp-top">
        <a href="/" aria-label="Segue home">
          <picture>
            <source srcSet="/wordmark-light.svg" media="(prefers-color-scheme: dark)" />
            <img src="/wordmark.svg" alt="Segue" className="pp-mark" />
          </picture>
        </a>
        <a className="pp-back" href="/">
          Back to Segue
        </a>
      </header>

      <main className="pp-main">
        <p className="lp-eyebrow">Privacy policy</p>
        <h1>How Segue handles your information</h1>
        <p className="pp-meta">Last updated {UPDATED}. Segue is made by PDYN Technologies.</p>

        <section aria-labelledby="pp-short">
          <h2 id="pp-short">The short version</h2>
          <ul>
            <li>Your plans, routines, saved places and Google details are kept on your own device, not in a Segue account.</li>
            <li>When you re-route, Segue&apos;s server gets what it needs to plan your day, answers, and does not save it.</li>
            <li>We never sell your information, show ads, or use your calendar for anything except planning your day.</li>
          </ul>
        </section>

        <section aria-labelledby="pp-device">
          <h2 id="pp-device">What stays on your device</h2>
          <p>
            Segue keeps these in your browser&apos;s storage on this device only: your blocks and routines, today&apos;s plan, settings, saved places,
            places you have been, places found on your last connection (so planning works offline), and, if you sign up with Google, your name, email
            address, profile photo and today&apos;s calendar events (title, time and place).
          </p>
          <p>
            Your Google access token is never saved. It lives in memory while the page is open and goes only to Google. Clearing it is one tap:
            Settings, then sign out or <em>Start over</em>.
          </p>
        </section>

        <section aria-labelledby="pp-server">
          <h2 id="pp-server">What Segue&apos;s server sees</h2>
          <p>The server plans, looks things up for you, and forgets. Specifically:</p>
          <ul>
            <li>
              <strong>When you re-route:</strong> your blocks (titles, lengths, priorities), the time and your exact position, your saved places, and
              today&apos;s calendar events as fixed blocks, with their titles, times and place names, so the plan can work around them.
            </li>
            <li>
              <strong>To show the sky and name where you are:</strong> your position rounded to about 1 km.
            </li>
            <li>
              <strong>If you tap &ldquo;Let Segue read it&rdquo;:</strong> the note you typed (up to 500 characters) and your local time.
            </li>
          </ul>
          <p>
            None of this is saved by Segue. The server&apos;s own log records only the kind of request, the result and how long it took, never the
            contents. It briefly holds, in memory only, the places it found near an area (up to 24 hours, to avoid repeat lookups) and a count of requests
            per address (up to an hour, to stop abuse).
          </p>
          <p>
            The companies that host Segue (currently Vercel for the web app and Render for the server) may keep ordinary technical logs, such as your IP
            address and the web address requested, under their own policies. For the sky and place name, that address includes your position rounded to
            about 1 km.
          </p>
        </section>

        <section aria-labelledby="pp-google">
          <h2 id="pp-google">Google sign-in and Calendar</h2>
          <p>Signing up with Google asks for these permissions, and no others:</p>
          <ul>
            <li>
              <strong>Name, email address and profile photo</strong> (openid, email, profile): to greet you and show who is signed in.
            </li>
            <li>
              <strong>See your calendar events</strong> (<code>calendar.events.readonly</code>): so today&apos;s meetings become fixed parts of your
              plan.
            </li>
            <li>
              <strong>See which calendars you have switched on</strong> (<code>calendar.calendarlist.readonly</code>): so every calendar you use is
              included, not only your main one. It is optional; without it Segue reads your main calendar.
            </li>
          </ul>
          <p>
            Segue only reads. It never changes, adds or deletes anything in your calendar. Your Google data is used only to plan your day, is not used
            for advertising, is not sold, and is not used to train AI models. A person at Segue does not read it.
          </p>
          <p>
            Segue&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p>
            You can disconnect at any time in Segue&apos;s Settings, or remove Segue&apos;s access at{' '}
            <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
          </p>
        </section>

        <section aria-labelledby="pp-others">
          <h2 id="pp-others">Other services involved</h2>
          <p>To do its job, Segue&apos;s server (or your browser) contacts these services. Each receives only what is listed.</p>
          <ul>
            <li>
              <strong>OpenStreetMap</strong> (Overpass, for nearby places): the position you are planning from. <strong>Nominatim</strong>, for place
              names: your position rounded to about 1 km. When Google Places is switched on, the same search area goes to Google Places instead.
            </li>
            <li>
              <strong>Open-Meteo</strong>, for weather: your position rounded to about 1 km. If Open-Meteo is unavailable, the same rounded position goes to{' '}
              <strong>MET Norway</strong> instead. Weather data from{' '}
              <a href="https://api.met.no/doc/License" target="_blank" rel="noopener noreferrer">MET Norway</a>, licensed CC BY 4.0.
            </li>
            <li>
              <strong>Anthropic</strong>, only for &ldquo;Let Segue read it&rdquo;: your note and local time, to turn it into blocks.
            </li>
            <li>
              <strong>Google</strong>: sign-in, your profile, your calendar, and fonts. Your browser asks Google Fonts for the typeface, which shares your
              IP address with Google.
            </li>
          </ul>
        </section>

        <section aria-labelledby="pp-choices">
          <h2 id="pp-choices">Your choices</h2>
          <ul>
            <li>
              <strong>Delete everything on this device:</strong> Settings, <em>Start over</em>, <em>Yes, clear everything</em>.
            </li>
            <li>
              <strong>Stop sharing your location:</strong> turn it off for Segue in your browser or phone settings. Segue still works if you add
              places yourself.
            </li>
            <li>
              <strong>Ask us anything,</strong> or ask what we hold about you (very little, since it lives on your device): email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </li>
          </ul>
        </section>

        <section aria-labelledby="pp-changes">
          <h2 id="pp-changes">Changes</h2>
          <p>If we change this page in a way that matters, we will update the date above and say so in the app.</p>
        </section>
      </main>

      <footer className="pp-foot">
        <p>© {new Date().getFullYear()} Segue · PDYN Technologies</p>
      </footer>
    </div>
  );
}
