import { CalibratedProbability } from './cognitive.types';

export const KNOWLEDGE_KINDS = ['fact', 'inference', 'axiom', 'procedural', 'meta'] as const;
export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number];

export const KNOWLEDGE_STATUSES = ['active', 'uncertain', 'superseded', 'deprecated'] as const;
export type KnowledgeStatus = typeof KNOWLEDGE_STATUSES[number];

export interface Evidence {
  source: string;           // episode_id, 'operator_statement', 'observation', 'inference'
  quality: 'explicit_statement' | 'strong_implication' | 'behavioral_pattern' | 'weak_inference';
  timestamp: string;
  content: string;          // what was actually observed/stated
}

export interface KnowledgeValidity {
  scope: string;            // 'universal', 'project:X', 'session:Y', 'domain:Z'
  expires?: string;         // ISO datetime — some knowledge has natural expiry
  staleness_signal?: string; // what event would make this stale
}

export interface Knowledge {
  id?: string;
  knowledge_id: string;
  kind: KnowledgeKind;
  content: string;
  domain: string;           // 'typescript', 'user_project', 'self', 'operator', 'tooling'
  confidence: CalibratedProbability;
  evidence: Evidence[];
  validity: KnowledgeValidity;
  status: KnowledgeStatus;
  superseded_by?: string;
  embedding?: number[];
  last_reinforcement?: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeGap {
  id?: string;
  description: string;
  domain: string;
  impact: number;           // 0-1, how much this gap affects ability to help
  resolution_strategy: string; // 'ask_operator', 'observe', 'read_config', 'infer'
  blocks_intentions: string[];
  discovered_at: string;
  resolved_by?: string;     // knowledge_id that fills this gap
  status: 'open' | 'resolved' | 'irrelevant';
}

export interface KnowledgeExtractionResult {
  new_knowledge: Array<{
    content: string;
    kind: KnowledgeKind;
    domain: string;
    confidence: number;
    evidence_quality: Evidence['quality'];
    reasoning: string;
  }>;
  updated_knowledge: Array<{
    knowledge_id: string;
    update_type: 'reinforced' | 'revised' | 'contradicted';
    new_confidence?: number;
    reasoning: string;
  }>;
  knowledge_gaps: Array<{
    description: string;
    domain: string;
    impact: number;
    resolution_strategy: string;
  }>;
}
