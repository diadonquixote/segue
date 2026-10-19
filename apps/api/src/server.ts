import { createServer } from 'node:http';
import { createApp } from './app';
import { loadConfig } from './config';
import { buildPlacesProvider, buildWeatherProvider } from './providers';

const config = loadConfig();
const places = buildPlacesProvider(config);
const server = createServer(createApp({ config, places, weather: buildWeatherProvider() }));

server.listen(config.port, () => {
  console.log(`Segue API on http://localhost:${config.port} · places: ${places.name}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
