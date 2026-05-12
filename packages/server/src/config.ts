interface Config {
  port: number;
  elasticsearch: {
    node: string;
    auth: {
      username: string;
      password: string;
    };
  };
}

export const buildConfig = (): Config => {
  return {
    port: parseInt(process.env.PORT || '3001', 10),
    elasticsearch: {
      node: process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200',
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
        password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
      },
    },
  };
};
