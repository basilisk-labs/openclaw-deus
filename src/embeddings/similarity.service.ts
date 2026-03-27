import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EmbeddingsService } from './embeddings.service';
import { SimilarityProvider } from '../cognitive/similarity.provider';
import { SimilarityMatch } from '../common/types/embeddings.types';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';

@Injectable()
export class SimilarityService {
  private readonly logger = new Logger(SimilarityService.name);

  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly db: SurrealService,
    private readonly sim: SimilarityProvider,
    private readonly config: CognitiveConfigService,
  ) {}

  /** Find K nearest beliefs by embedding — uses MTREE vector index */
  async findSimilarBeliefs(content: string, k = 10, threshold = 0.5): Promise<Result<SimilarityMatch[], DomainError>> {
    const queryEmb = await this.embeddings.embed(content);
    if (queryEmb.isErr()) return err(queryEmb.error);

    // Try MTREE vector search first
    const mtreeResult = await this.db.query<{ belief_id: string; score: number }>(
      `SELECT belief_id, vector::similarity::cosine(embedding, $emb) AS score
       FROM belief_embedding
       WHERE embedding <|${k},COSINE|> $emb
       ORDER BY score DESC LIMIT $k`,
      { emb: queryEmb.value, k },
    );

    if (mtreeResult.isOk() && mtreeResult.value.length > 0) {
      return ok(mtreeResult.value
        .filter(m => m.score >= threshold)
        .map(m => ({ id: m.belief_id, belief_id: m.belief_id, score: m.score })));
    }

    // Fallback: brute force (MTREE may not be available on all SurrealDB versions)
    this.logger.warn('MTREE search unavailable, falling back to brute force');
    const allEmbeddings = await this.db.query<{ belief_id: string; embedding: number[] }>(
      'SELECT belief_id, embedding FROM belief_embedding',
    );
    if (allEmbeddings.isErr()) return err(allEmbeddings.error);

    return ok(allEmbeddings.value
      .map(item => ({ id: item.belief_id, belief_id: item.belief_id, score: this.sim.cosine(queryEmb.value, item.embedding || []) }))
      .filter(m => m.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k));
  }

  /** Find similar memories by embedding — uses MTREE vector index */
  async findSimilarMemories(content: string, k = 10, threshold = 0.4): Promise<Result<SimilarityMatch[], DomainError>> {
    const queryEmb = await this.embeddings.embed(content);
    if (queryEmb.isErr()) return err(queryEmb.error);

    // Try MTREE
    const mtreeResult = await this.db.query<{ id: string; score: number }>(
      `SELECT id, vector::similarity::cosine(embedding, $emb) AS score
       FROM activity_log
       WHERE embedding <|${k},COSINE|> $emb
       ORDER BY score DESC LIMIT $k`,
      { emb: queryEmb.value, k },
    );

    if (mtreeResult.isOk() && mtreeResult.value.length > 0) {
      return ok(mtreeResult.value
        .filter(m => m.score >= threshold)
        .map(m => ({ id: String(m.id), belief_id: String(m.id), score: m.score })));
    }

    // Fallback
    const allLogs = await this.db.query<{ id: string; embedding: number[] }>(
      'SELECT id, embedding FROM activity_log WHERE embedding IS NOT NONE LIMIT $limit',
      { limit: this.config.get('query.embeddings_fallback_limit') },
    );
    if (allLogs.isErr()) return err(allLogs.error);

    return ok(allLogs.value
      .filter(item => item.embedding)
      .map(item => ({ id: String(item.id), belief_id: String(item.id), score: this.sim.cosine(queryEmb.value, item.embedding) }))
      .filter(m => m.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k));
  }

  /** Find similar knowledge — uses MTREE vector index */
  async findSimilarKnowledge(content: string, k = 10, threshold = 0.6): Promise<Result<SimilarityMatch[], DomainError>> {
    const queryEmb = await this.embeddings.embed(content);
    if (queryEmb.isErr()) return err(queryEmb.error);

    const mtreeResult = await this.db.query<{ knowledge_id: string; score: number }>(
      `SELECT knowledge_id, vector::similarity::cosine(embedding, $emb) AS score
       FROM knowledge
       WHERE embedding <|${k},COSINE|> $emb AND status = 'active'
       ORDER BY score DESC LIMIT $k`,
      { emb: queryEmb.value, k },
    );

    if (mtreeResult.isOk() && mtreeResult.value.length > 0) {
      return ok(mtreeResult.value
        .filter(m => m.score >= threshold)
        .map(m => ({ id: m.knowledge_id, belief_id: m.knowledge_id, score: m.score })));
    }

    return ok([]);
  }

  /** Agglomerative clustering using cosine similarity */
  cluster(items: Array<{ id: string; embedding: number[] }>, threshold = 0.6): Array<{ centroid: number[]; members: string[] }> {
    if (items.length === 0) return [];
    const clusters: Array<{ members: string[]; embeddings: number[][] }> = items.map(item => ({
      members: [item.id], embeddings: [item.embedding],
    }));
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          let maxSim = -1;
          for (const va of clusters[i].embeddings) for (const vb of clusters[j].embeddings) {
            const s = this.sim.cosine(va, vb); if (s > maxSim) maxSim = s;
          }
          if (maxSim >= threshold) {
            clusters[i].members.push(...clusters[j].members);
            clusters[i].embeddings.push(...clusters[j].embeddings);
            clusters.splice(j, 1); merged = true; break outer;
          }
        }
      }
    }
    return clusters.map(c => {
      const dim = c.embeddings[0]?.length || 0;
      const centroid = new Array(dim).fill(0);
      for (const v of c.embeddings) for (let i = 0; i < dim; i++) centroid[i] += v[i];
      return { centroid: centroid.map(v => v / c.embeddings.length), members: c.members };
    });
  }
}
