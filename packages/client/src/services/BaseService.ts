import { config } from '../config';

export class BaseService {
  protected readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.API_URL;
  }

  public async fetch<T>(
    endpoint: string,
    options: RequestInit & { params?: Record<string, any> } = {},
  ): Promise<T> {
    const { params, ...fetchOptions } = options;
    const apiEndpoint = endpoint.startsWith('/api')
      ? endpoint
      : `/api${endpoint}`;
    const url = new URL(`${this.baseUrl}${apiEndpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      ...fetchOptions,
    };

    try {
      const response = await fetch(url.toString(), defaultOptions);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error);
      throw error;
    }
  }
}
