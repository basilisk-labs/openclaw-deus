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
  llm: {
    enabled: boolean;
    mode: "direct" | "openclaw";
    provider: string;
    apiKey: string;
    model: string;
    fastModel: string;
    balancedModel: string;
    reasoningModel: string;
    maxConcurrency: number;
    fallbackToDirect: boolean;
    gatewayUrl: string;
    gatewayPath: string;
    gatewayApiKey: string;
    gatewayTimeoutMs: number;
  };
}

export default (): DeusConfig => ({
  port: parseInt(process.env.PORT || "3000", 10),
  surreal: {
    url: process.env.SURREAL_URL || "http://127.0.0.1:8000/rpc",
    namespace: process.env.SURREAL_NS || "deus",
    database: process.env.SURREAL_DB || "runtime",
    username: process.env.SURREAL_USER || "root",
    password: process.env.SURREAL_PASS || "root",
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || "deus-dev-secret-change-in-production",
    apiKey: process.env.API_KEY || "",
    enabled: process.env.AUTH_ENABLED === "true",
  },
  nightly: {
    cron: process.env.NIGHTLY_CRON || "0 3 * * *",
    enabled: process.env.NIGHTLY_ENABLED !== "false",
  },
  limits: {
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || "20", 10),
    maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || "100", 10),
    rateLimit: parseInt(process.env.RATE_LIMIT || "100", 10),
    rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || "60", 10),
  },
  extraction: {
    llmEnabled: process.env.LLM_ENABLED === "true",
    llmProvider: process.env.LLM_PROVIDER || "claude",
    llmApiKey: process.env.LLM_API_KEY || "",
  },
  llm: {
    enabled: process.env.LLM_ENABLED === "true",
    mode: process.env.LLM_MODE === "openclaw" ? "openclaw" : "direct",
    provider: process.env.LLM_PROVIDER || "claude",
    apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || "",
    model: process.env.LLM_MODEL || "claude-haiku-4-5-20251001",
    fastModel:
      process.env.LLM_FAST_MODEL ||
      process.env.LLM_MODEL ||
      "claude-haiku-4-5-20251001",
    balancedModel:
      process.env.LLM_BALANCED_MODEL ||
      process.env.LLM_MODEL ||
      "claude-sonnet-4-20250514",
    reasoningModel:
      process.env.LLM_REASONING_MODEL ||
      process.env.LLM_MODEL ||
      "claude-sonnet-4-20250514",
    maxConcurrency: parseInt(process.env.LLM_MAX_CONCURRENCY || "2", 10),
    fallbackToDirect:
      (process.env.LLM_FALLBACK_TO_DIRECT || "true") !== "false",
    gatewayUrl:
      process.env.OPENCLAW_INFERENCE_GATEWAY_URL ||
      process.env.OPENCLAW_GATEWAY_URL ||
      process.env.OPENCLOW_GATEWAY_URL ||
      "",
    gatewayPath:
      process.env.OPENCLAW_INFERENCE_GATEWAY_PATH ||
      process.env.OPENCLAW_GATEWAY_PATH ||
      "/inference/complete",
    gatewayApiKey:
      process.env.OPENCLAW_INFERENCE_GATEWAY_TOKEN ||
      process.env.OPENCLAW_API_KEY ||
      process.env.OPENCLOW_API_KEY ||
      "",
    gatewayTimeoutMs: parseInt(
      process.env.OPENCLAW_INFERENCE_GATEWAY_TIMEOUT_MS ||
        process.env.OPENCLAW_GATEWAY_TIMEOUT_MS ||
        "30000",
      10,
    ),
  },
});
