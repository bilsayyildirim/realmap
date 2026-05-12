import { Client } from '@elastic/elasticsearch';

interface ElasticsearchConfig {
  node: string;
  auth: {
    username: string;
    password: string;
  };
}

export const buildElasticsearchClient = async (
  config: ElasticsearchConfig,
): Promise<Client> => {
  const client = new Client({
    node: config.node,
    auth: {
      username: config.auth.username,
      password: config.auth.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    // Test the connection
    await client.ping();
    console.log('Successfully connected to Elasticsearch');
    return client;
  } catch (error) {
    console.error('Failed to connect to Elasticsearch:', error);
    throw error;
  }
};
