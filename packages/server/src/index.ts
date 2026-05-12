import cors from 'cors';
import express from 'express';
import { buildConfig } from './config';
import { buildRouter } from './routes';
import { buildElasticsearchClient } from './services/elasticsearch';

const start = async () => {
  const app = express();
  const config = buildConfig();

  app.use(cors());
  app.use(express.json());

  // Add health check endpoint before any async/await
  app.get('/health', (_, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const client = await buildElasticsearchClient(config.elasticsearch);
  const router = buildRouter(client);

  app.use('/api', router);

  // Listen on 0.0.0.0 for Docker compatibility
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Server is running on port ${config.port}`);
  });
};

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
