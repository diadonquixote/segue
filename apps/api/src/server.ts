import { createServer } from 'node:http';
import { createApp } from './app';
import { loadConfig } from './config';
import { buildGeocoder, buildPlacesProvider, buildWeatherProvider } from './providers';
import { claudeUnderstand } from './understand';

const config = loadConfig();
if (process.env.NODE_ENV === 'production' && !config.corsOrigins.some((o) => o === '*' || o.startsWith('https://'))) {
  console.warn('CORS_ORIGINS has no https origin, so browsers on your real site will be blocked. Set it to your web app URL.');
}
const places = buildPlacesProvider(config);
const understand = config.smartAdd ? claudeUnderstand() : undefined;
const server = createServer(createApp({ config, places, weather: buildWeatherProvider(), understand, geocoder: buildGeocoder(config) }));

server.listen(config.port, () => {
  console.log(`Segue API on http://localhost:${config.port} · places: ${places.name} · smart add: ${understand ? 'on' : 'off'}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
