export interface Config {
  port: number;
  placesProvider: 'osm' | 'google' | 'mock';
  googlePlacesApiKey?: string;
  /** Daily cap on paid Google calls before falling back to OSM. */
  googleDailyBudget: number;
  corsOrigins: string[];
  rerouteRateLimit: number;
  /** "Ask in your own words" via Claude. Needs Anthropic credentials. */
  smartAdd: boolean;
  smartAddRateLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = (env.PLACES_PROVIDER ?? 'osm').toLowerCase();
  if (!['osm', 'google', 'mock'].includes(provider)) {
    throw new Error(`PLACES_PROVIDER must be osm, google or mock (got "${provider}")`);
  }
  if (provider === 'google' && !env.GOOGLE_PLACES_API_KEY) {
    throw new Error('PLACES_PROVIDER=google needs GOOGLE_PLACES_API_KEY');
  }
  return {
    port: Number(env.PORT ?? 8787),
    placesProvider: provider as Config['placesProvider'],
    googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY || undefined,
    googleDailyBudget: Number(env.GOOGLE_DAILY_BUDGET ?? 500),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rerouteRateLimit: Number(env.REROUTE_RATE_LIMIT ?? 60),
    // On with SMART_ADD=on, or automatically when an Anthropic key is set (SMART_ADD=off wins).
    smartAdd: env.SMART_ADD === 'on' || (env.SMART_ADD !== 'off' && !!env.ANTHROPIC_API_KEY),
    smartAddRateLimit: Number(env.SMART_ADD_RATE_LIMIT ?? 40),
  };
}
