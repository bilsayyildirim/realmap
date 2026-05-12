import {
  ClientConfig,
  defaultConfig,
  productionConfig,
} from '@realmap/shared/client';

// Check if we're running in Docker
const isDocker = window.location.hostname === 'client';

// Export singleton instance
export const config: ClientConfig = import.meta.env.PROD
  ? productionConfig
  : {
      ...defaultConfig,
      // Override API_URL for local development
      API_URL: isDocker ? 'http://server:3001' : 'http://localhost:3001',
    };
