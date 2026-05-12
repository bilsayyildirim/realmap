import { Static, Type } from '@sinclair/typebox';

export const ClientConfigSchema = Type.Object({
  NODE_ENV: Type.Union([
    Type.Literal('development'),
    Type.Literal('production'),
    Type.Literal('test'),
  ]),
  API_URL: Type.String(),
  MAP_STYLE_URL: Type.String(),
  MAP_DEFAULT_CENTER: Type.Tuple([Type.Number(), Type.Number()]),
  MAP_DEFAULT_ZOOM: Type.Number(),
});

export type ClientConfig = Static<typeof ClientConfigSchema>;

// Default values for client config (development)
export const defaultConfig: ClientConfig = {
  NODE_ENV: 'development',
  API_URL: 'http://server:3001', // Use Docker service name
  MAP_STYLE_URL: 'https://demotiles.maplibre.org/style.json',
  MAP_DEFAULT_CENTER: [0, 20],
  MAP_DEFAULT_ZOOM: 1.5,
};

// Production config
export const productionConfig: ClientConfig = {
  NODE_ENV: 'production',
  API_URL: 'https://api.realmap.com',
  MAP_STYLE_URL: 'https://tiles.realmap.com/style.json',
  MAP_DEFAULT_CENTER: [0, 20],
  MAP_DEFAULT_ZOOM: 1.5,
};
