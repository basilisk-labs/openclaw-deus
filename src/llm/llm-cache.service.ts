import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LlmOperationType } from './types/llm.types';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

// TTL per operation type
const CACHE_TTL: Record<LlmOperationType, number> = {
  [LlmOperationType.BELIEF_EXTRACTION]: 24 * 3600_000,    // 24h
  [LlmOperationType.CONTRADICTION]: 1 * 3600_000,          // 1h
  [LlmOperationType.BELIEF_SYNTHESIS]: 4 * 3600_000,       // 4h
  [LlmOperationType.INTROSPECTION]: 2 * 3600_000,          // 2h
  [LlmOperationType.POLICY_REASONING]: 0,                   // never cache
  [LlmOperationType.MEMORY_CONSOLIDATION]: 24 * 3600_000,  // 24h
  // v4 BDI operations
  [LlmOperationType.INTENTION_RECOGNITION]: 0,              // never cache — context-dependent
  [LlmOperationType.KNOWLEDGE_EXTRACTION]: 4 * 3600_000,    // 4h
  [LlmOperationType.DELIBERATION]: 0,                        // never cache
  [LlmOperationType.EPISODE_CREATION]: 24 * 3600_000,       // 24h
  [LlmOperationType.OPERATOR_MODEL_UPDATE]: 2 * 3600_000,   // 2h
  [LlmOperationType.SELF_ASSESSMENT]: 24 * 3600_000,        // 24h
  [LlmOperationType.PROCEDURE_EXTRACTION]: 24 * 3600_000,   // 24h
  [LlmOperationType.DIAGNOSIS]: 1 * 3600_000,               // 1h
};

@Injectable()
export class LlmCacheService {
  private store = new Map<string, CacheEntry>();

  buildKey(operationType: LlmOperationType, content: string): string {
    const hash = createHash('sha256').update(content.slice(0, 4000)).digest('hex').slice(0, 24);
    return `${operationType}:${hash}`;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown, operationType: LlmOperationType): void {
    const ttl = CACHE_TTL[operationType];
    if (ttl === 0) return; // don't cache policy reasoning
    this.store.set(key, { data, expiresAt: Date.now() + ttl });
  }

  invalidateOperation(operationType: LlmOperationType): void {
    const prefix = `${operationType}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  invalidateAll(): void {
    this.store.clear();
  }
}
