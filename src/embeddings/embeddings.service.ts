import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

/**
 * EmbeddingsService: Text embedding with three-tier caching (memory, SurrealDB, API).
 *
 * Computes vector embeddings for semantic similarity. Uses OpenAI's embedding model
 * when available, falls back to a deterministic hash-based pseudo-embedding otherwise.
 * All embeddings are cached at two levels to minimize API calls.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private memoryCache = new Map<string, number[]>();
  private openaiApiKey: string | null;

  constructor(private readonly db: SurrealService) {
    // Embeddings use OpenAI API (Anthropic doesn't have embeddings yet)
    this.openaiApiKey = process.env.OPENAI_API_KEY || null;
  }

  /**
   * Embed a single text string into a vector. Checks L1 memory cache, then L2
   * SurrealDB cache, then falls back to API call (or deterministic hash fallback).
   *
   * @param text - Text to embed (truncated to 8000 chars for API)
   * @returns Vector embedding of dimension 1536
   */
  async embed(text: string): Promise<Result<number[], DomainError>> {
    const hash = this.hashContent(text);

    // L1: memory cache
    const cached = this.memoryCache.get(hash);
    if (cached) return ok(cached);

    // L2: SurrealDB cache
    const dbCached = await this.db.query<{ embedding: number[] }>(
      'SELECT embedding FROM belief_embedding WHERE content_hash = $hash LIMIT 1',
      { hash },
    );
    if (dbCached.isOk() && dbCached.value.length > 0 && dbCached.value[0].embedding) {
      this.memoryCache.set(hash, dbCached.value[0].embedding);
      return ok(dbCached.value[0].embedding);
    }

    // L3: compute via API
    if (!this.openaiApiKey) {
      // Fallback: simple bag-of-words hash embedding (very naive but works without API)
      return ok(this.fallbackEmbedding(text));
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text.slice(0, 8000),
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Embedding API error: ${response.status}`);
        return ok(this.fallbackEmbedding(text));
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      const embedding = data.data[0].embedding;

      // Cache in memory + DB
      this.memoryCache.set(hash, embedding);
      await this.db.create('belief_embedding', {
        belief_id: hash,
        embedding,
        content_hash: hash,
      } as Record<string, unknown>);

      return ok(embedding);
    } catch (error) {
      this.logger.warn(`Embedding failed, using fallback: ${error}`);
      return ok(this.fallbackEmbedding(text));
    }
  }

  /**
   * Embed multiple texts sequentially. Each text goes through the same
   * three-tier cache as embed(). Fails fast on first error.
   *
   * @param texts - Array of text strings to embed
   * @returns Array of vector embeddings, one per input text
   */
  async embedBatch(texts: string[]): Promise<Result<number[][], DomainError>> {
    const results: number[][] = [];
    for (const text of texts) {
      const r = await this.embed(text);
      if (r.isErr()) return err(r.error);
      results.push(r.value);
    }
    return ok(results);
  }

  /** Store embedding linked to a belief */
  async storeBeliefEmbedding(beliefId: string, content: string): Promise<Result<void, DomainError>> {
    const embedding = await this.embed(content);
    if (embedding.isErr()) return err(embedding.error);

    await this.db.create('belief_embedding', {
      belief_id: beliefId,
      embedding: embedding.value,
      content_hash: this.hashContent(content),
    } as Record<string, unknown>);

    return ok(undefined);
  }

  /** Fallback: deterministic pseudo-embedding from text hash. NOT semantic but consistent. */
  private fallbackEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const embedding = new Array(EMBEDDING_DIM).fill(0);
    for (const word of words) {
      const hash = createHash('md5').update(word).digest();
      for (let i = 0; i < Math.min(hash.length, EMBEDDING_DIM); i++) {
        embedding[i % EMBEDDING_DIM] += (hash[i] - 128) / 128;
      }
    }
    // Normalize
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
    return embedding.map(v => v / norm);
  }

  private hashContent(text: string): string {
    return createHash('sha256').update(text.slice(0, 2000)).digest('hex').slice(0, 32);
  }
}
