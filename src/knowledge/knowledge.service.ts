import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError, NotFoundError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SimilarityProvider } from '../cognitive/similarity.provider';
import { Knowledge, KnowledgeKind, KnowledgeStatus, Evidence } from '../common/types/knowledge.types';
import { calibrated, EvidenceQuality } from '../common/types/cognitive.types';
import { BayesianUpdaterService } from '../cognitive/bayesian-updater.service';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private nextId = 1;

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly embeddings: EmbeddingsService,
    private readonly similarityProvider: SimilarityProvider,
    private readonly bayesian: BayesianUpdaterService,
  ) {}

  async create(data: {
    kind: KnowledgeKind;
    content: string;
    domain: string;
    confidence: number;
    evidence: Evidence[];
    scope?: string;
  }): Promise<Result<Knowledge, DomainError>> {
    const knowledgeId = `K${String(this.nextId++).padStart(3, '0')}`;
    const now = new Date().toISOString();

    // Compute embedding for semantic search
    const embResult = await this.embeddings.embed(data.content);
    const embedding = embResult.isOk() ? embResult.value : undefined;

    const knowledge: Record<string, unknown> = {
      knowledge_id: knowledgeId,
      kind: data.kind,
      content: data.content,
      domain: data.domain,
      confidence: calibrated(data.confidence, data.kind === 'axiom' ? 0.01 : 0.15),
      evidence: data.evidence,
      validity: { scope: data.scope || 'universal' },
      status: 'active',
      embedding,
      last_reinforcement: now,
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.create<Knowledge>('knowledge', knowledge as unknown as Knowledge);
    if (result.isOk()) {
      await this.events.emit('knowledge.updated', { knowledge_id: knowledgeId, action: 'created', content: data.content });
    }
    return result;
  }

  async findById(knowledgeId: string): Promise<Result<Knowledge, DomainError>> {
    const result = await this.db.query<Knowledge>('SELECT * FROM knowledge WHERE knowledge_id = $id LIMIT 1', { id: knowledgeId });
    if (result.isErr()) return err(result.error);
    if (result.value.length === 0) return err(new NotFoundError('Knowledge', knowledgeId));
    return ok(result.value[0]);
  }

  async findAll(filters?: { kind?: KnowledgeKind; domain?: string; status?: KnowledgeStatus }): Promise<Result<Knowledge[], DomainError>> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};
    if (filters?.kind) { conditions.push('kind = $kind'); vars.kind = filters.kind; }
    if (filters?.domain) { conditions.push('domain = $domain'); vars.domain = filters.domain; }
    if (filters?.status) { conditions.push('status = $status'); vars.status = filters.status; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.query<Knowledge>(`SELECT * FROM knowledge ${where} ORDER BY knowledge_id LIMIT 200`, vars);
  }

  async reinforce(knowledgeId: string, newEvidence: Evidence): Promise<Result<Knowledge, DomainError>> {
    const existing = await this.findById(knowledgeId);
    if (existing.isErr()) return err(existing.error);

    const k = existing.value;
    const evidence = [...(k.evidence || []), newEvidence];
    const conf = k.confidence as unknown as Record<string, unknown>;
    const currentPoint = (conf.point as number) ?? (typeof k.confidence === 'number' ? k.confidence : 0.5);
    const quality = (newEvidence.quality || 'strong_implication') as EvidenceQuality;

    // Bayesian evidence-weighted update: stronger evidence → bigger boost, diminishing returns
    const updated = this.bayesian.updateWithEvidence(currentPoint, quality, evidence.length);

    const result = await this.db.update<Knowledge>(k.id!, {
      evidence,
      confidence: updated,
      last_reinforcement: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>);

    // Knowledge → Belief promotion: when evidence accumulates, create review candidate
    if (evidence.length >= 3 && updated.point >= 0.7) {
      await this.promoteToBeliefCandidate(k, evidence.length, updated.point);
    }

    return result;
  }

  /**
   * When knowledge is reinforced enough, create a review_candidate for belief promotion.
   * Closes the knowledge → belief learning loop.
   */
  private async promoteToBeliefCandidate(knowledge: Knowledge, evidenceCount: number, confidence: number): Promise<void> {
    // Check if already promoted
    const existing = await this.db.query<any>(
      `SELECT * FROM review_candidate WHERE content = $content AND status IN ['pending', 'promoted'] LIMIT 1`,
      { content: knowledge.content },
    );
    if (existing.isOk() && existing.value.length > 0) {
      // Bump recurrence
      const candidate = existing.value[0];
      await this.db.update(candidate.id, {
        recurrence: (candidate.recurrence || 1) + 1,
        confidence_proposal: confidence,
        updated_at: new Date().toISOString(),
      });
      return;
    }

    await this.db.create('review_candidate', {
      content: knowledge.content,
      confidence_proposal: confidence,
      recurrence: evidenceCount,
      source: `knowledge:${knowledge.knowledge_id}`,
      category: knowledge.domain,
      prefix: knowledge.kind === 'fact' ? 'F' : knowledge.kind === 'procedural' ? 'P' : 'O',
      human_review_needed: 'no',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>);

    this.logger.log(`Knowledge ${knowledge.knowledge_id} promoted to belief candidate (evidence=${evidenceCount}, conf=${confidence})`);
  }

  async supersede(oldKnowledgeId: string, newKnowledgeId: string): Promise<Result<void, DomainError>> {
    const old = await this.findById(oldKnowledgeId);
    if (old.isErr()) return err(old.error);

    await this.db.update(old.value.id!, {
      status: 'superseded',
      superseded_by: newKnowledgeId,
      updated_at: new Date().toISOString(),
    });
    return ok(undefined);
  }

  async findSimilar(content: string, threshold = 0.7): Promise<Result<Knowledge[], DomainError>> {
    const embResult = await this.embeddings.embed(content);
    if (embResult.isErr()) return ok([]); // graceful degradation

    const queryEmb = embResult.value;

    // Try HNSW vector search in SurrealDB first (O(log n) vs O(n) brute force)
    const vectorResult = await this.db.query<Knowledge>(
      `SELECT *, vector::similarity::cosine(embedding, $vec) AS score
       FROM knowledge
       WHERE embedding IS NOT NONE AND status = 'active'
       ORDER BY score DESC LIMIT 20`,
      { vec: queryEmb },
    );

    if (vectorResult.isOk() && vectorResult.value.length > 0) {
      return ok(vectorResult.value.filter((k: any) => (k.score ?? 0) >= threshold));
    }

    // Fallback: brute force cosine in application code
    const all = await this.findAll({ status: 'active' });
    if (all.isErr()) return err(all.error);

    return ok(all.value.filter((k) => {
      if (!k.embedding) return false;
      const sim = this.similarityProvider.cosine(queryEmb, k.embedding);
      return sim >= threshold;
    }));
  }

  async count(): Promise<Result<number, DomainError>> {
    const result = await this.db.query<{ count: number }>('SELECT count() AS count FROM knowledge GROUP ALL');
    if (result.isErr()) return err(result.error);
    return ok(result.value[0]?.count ?? 0);
  }
}
