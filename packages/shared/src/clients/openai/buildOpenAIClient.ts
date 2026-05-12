// @ts-ignore - OpenAI SDK
import OpenAI from 'openai';

/**
 * Builds an OpenAI client using environment variables
 * Uses REALMAP_OPENAI_API_KEY from environment
 */
export function buildOpenAIClient(): any {
  const apiKey = process.env.REALMAP_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'REALMAP_OPENAI_API_KEY environment variable is required. ' +
      'Set it in your .env file or docker-compose configuration.'
    );
  }

  return new OpenAI({
    apiKey,
    // Optional: configure timeout, retries, etc.
    timeout: 120000, // 2 minutes
    maxRetries: 3,
  });
}

