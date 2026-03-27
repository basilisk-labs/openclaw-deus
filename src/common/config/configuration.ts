export interface DeusConfig {
  port: number;
  surreal: {
    url: string;
    namespace: string;
    database: string;
    username: string;
    password: string;
  };
  auth: {
    jwtSecret: string;
    apiKey: string;
    enabled: boolean;
  };
  nightly: {
    cron: string;
    enabled: boolean;
  };
  limits: {
    defaultPageSize: number;
    maxPageSize: number;
    rateLimit: number;
    rateLimitTtl: number;
  };
  extraction: {
    llmEnabled: boolean;
    llmProvider: string;
    llmApiKey: string;
  };
}

export default (): DeusConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  surreal: {
    url: process.env.SURREAL_URL || 'http://127.0.0.1:8000/rpc',
    namespace: process.env.SURREAL_NS || 'deus',
    database: process.env.SURREAL_DB || 'runtime',
    username: process.env.SURREAL_USER || 'root',
    password: process.env.SURREAL_PASS || 'root',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'deus-dev-secret-change-in-production',
    apiKey: process.env.API_KEY || '',
    enabled: process.env.AUTH_ENABLED === 'true',
  },
  nightly: {
    cron: process.env.NIGHTLY_CRON || '0 3 * * *',
    enabled: process.env.NIGHTLY_ENABLED !== 'false',
  },
  limits: {
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
    maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || '100', 10),
    rateLimit: parseInt(process.env.RATE_LIMIT || '100', 10),
    rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
  },
  extraction: {
    llmEnabled: process.env.LLM_ENABLED === 'true',
    llmProvider: process.env.LLM_PROVIDER || 'claude',
    llmApiKey: process.env.LLM_API_KEY || '',
  },
});
