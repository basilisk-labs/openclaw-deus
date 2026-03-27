export enum LlmOperationType {
  BELIEF_EXTRACTION = 'belief_extraction',
  CONTRADICTION = 'contradiction',
  BELIEF_SYNTHESIS = 'belief_synthesis',
  INTROSPECTION = 'introspection',
  POLICY_REASONING = 'policy_reasoning',
  MEMORY_CONSOLIDATION = 'memory_consolidation',
  // v4 BDI operations
  INTENTION_RECOGNITION = 'intention_recognition',
  KNOWLEDGE_EXTRACTION = 'knowledge_extraction',
  DELIBERATION = 'deliberation',
  EPISODE_CREATION = 'episode_creation',
  OPERATOR_MODEL_UPDATE = 'operator_model_update',
  SELF_ASSESSMENT = 'self_assessment',
  PROCEDURE_EXTRACTION = 'procedure_extraction',
  DIAGNOSIS = 'diagnosis',
}

export enum LlmPriority {
  CRITICAL = 0,   // user-facing extraction during live interaction
  HIGH = 1,       // contradiction detection during belief creation
  NORMAL = 2,     // nightly belief synthesis, memory consolidation
  LOW = 3,        // introspection, calibration checks
}

export interface LlmCallOptions {
  operationType: LlmOperationType;
  priority: LlmPriority;
  maxTokens: number;
  systemPrompt: string;
  userMessage: string;
  tools: LlmToolDefinition[];
  forceTool?: string;
  cacheKey?: string;
  cacheTtlMs?: number;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmCallResult<T = unknown> {
  data: T;
  usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number };
  latencyMs: number;
  cached: boolean;
  operationType: LlmOperationType;
}

export interface TokenBudget {
  daily_input_limit: number;
  daily_output_limit: number;
  monthly_input_limit: number;
  monthly_output_limit: number;
}

export interface TokenUsage {
  day_key: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  call_count: number;
  by_operation: Record<string, { input: number; output: number; calls: number }>;
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  daily_input_limit: 500_000,
  daily_output_limit: 100_000,
  monthly_input_limit: 10_000_000,
  monthly_output_limit: 2_000_000,
};
