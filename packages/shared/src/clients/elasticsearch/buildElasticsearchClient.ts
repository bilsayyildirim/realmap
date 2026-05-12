import { Client } from '@elastic/elasticsearch';
import { ElasticsearchConfig } from '../../config';

async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildElasticsearchClient(
  config: ElasticsearchConfig,
): Promise<Client> {
  const client = new Client({
    node: config.node,
    auth: config.auth,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
    maxRetries: config.connection.retryAttempts,
    requestTimeout: config.connection.requestTimeout,
    sniffOnStart: true,
  });

  // Test the connection with retries
  for (let attempt = 1; attempt <= config.connection.retryAttempts; attempt++) {
    try {
      await client.ping();
      console.log('Successfully connected to Elasticsearch');
      return client;
    } catch (error) {
      if (attempt === config.connection.retryAttempts) {
        console.error(
          'Failed to connect to Elasticsearch after multiple attempts:',
          error,
        );
        throw error;
      }
      console.warn(
        `Connection attempt ${attempt} failed, retrying in ${config.connection.retryDelay}ms...`,
      );
      await waitFor(config.connection.retryDelay);
    }
  }

  throw new Error('Failed to connect to Elasticsearch');
}
