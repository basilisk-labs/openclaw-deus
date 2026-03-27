import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError, NotFoundError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { BeliefEventsService } from '../events/belief-events.service';
import { Belief, BeliefClass, BeliefStatus, DriftEntry } from '../common/types/belief.types';
import { CreateBeliefDto } from './dto/create-belief.dto';
import { UpdateBeliefDto } from './dto/update-belief.dto';
import { BeliefQueryDto } from './dto/belief-query.dto';
import { PaginatedResponse, paginate } from '../common/types/pagination.types';

@Injectable()
export class BeliefsService {
  private readonly logger = new Logger(BeliefsService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly beliefEvents: BeliefEventsService,
  ) {}

  async findAll(query?: BeliefQueryDto): Promise<Result<Belief[], DomainError>> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query?.class) { conditions.push('belief_class = $class'); vars.class = query.class; }
    if (query?.status) { conditions.push('status = $status'); vars.status = query.status; }
    if (query?.scope) { conditions.push('context_scope = $scope'); vars.scope = query.scope; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query?.limit ?? 100;
    const offset = query?.offset ?? 0;
    vars.limit = limit;
    vars.offset = offset;
    return this.db.query<Belief>(`SELECT * FROM belief ${where} ORDER BY belief_id LIMIT $limit START $offset`, vars);
  }

  async findAllPaginated(query?: BeliefQueryDto): Promise<Result<PaginatedResponse<Belief>, DomainError>> {
    const countResult = await this.count();
    if (countResult.isErr()) return err(countResult.error);
    const beliefsResult = await this.findAll(query);
    if (beliefsResult.isErr()) return err(beliefsResult.error);
    return ok(paginate(beliefsResult.value, countResult.value, query?.page ?? 1, query?.limit ?? 20));
  }

  async findById(beliefId: string): Promise<Result<Belief, DomainError>> {
    const result = await this.db.query<Belief>('SELECT * FROM belief WHERE belief_id = $id LIMIT 1', { id: beliefId });
    if (result.isErr()) return err(result.error);
    if (result.value.length === 0) return err(new NotFoundError('Belief', beliefId));
    return ok(result.value[0]);
  }

  async create(dto: CreateBeliefDto): Promise<Result<Belief, DomainError>> {
    const beliefs = await this.findAll();
    const beliefId = this.generateId(beliefs.isOk() ? beliefs.value : [], dto.belief_class === 'axiom' ? 'I' : 'B');
    const now = new Date().toISOString();

    const result = await this.db.create<Belief>('belief', {
      belief_id: beliefId, content: dto.content, confidence: dto.confidence,
      evidence_set: dto.evidence_set, source_type: dto.source_type, belief_class: dto.belief_class,
      decay_mode: dto.decay_mode, confidence_floor: dto.confidence_floor,
      review_threshold: dto.review_threshold, context_scope: dto.context_scope,
      status: 'active' as BeliefStatus, drift_history: [],
      ontological_anchor: dto.ontological_anchor || null, inference_trace: dto.inference_trace || [],
      archivable: dto.archivable ?? true, timestamp_created: now, timestamp_updated: now,
    } as unknown as Belief);

    if (result.isOk()) {
      await this.events.emit('belief.created', { belief_id: beliefId, content: dto.content, confidence: dto.confidence });
      await this.beliefEvents.record(beliefId, 'created', { content: dto.content, confidence: dto.confidence });
    }
    return result;
  }

  async update(beliefId: string, dto: UpdateBeliefDto): Promise<Result<Belief, DomainError>> {
    const existing = await this.findById(beliefId);
    if (existing.isErr()) return err(existing.error);

    const belief = existing.value;
    const updateData: Record<string, unknown> = { ...dto, timestamp_updated: new Date().toISOString() };

    if (dto.confidence !== undefined && dto.confidence !== belief.confidence) {
      const driftEntry: DriftEntry = {
        timestamp: new Date().toISOString(),
        old_confidence: belief.confidence,
        new_confidence: dto.confidence,
        reason: 'manual_update',
      };
      updateData.drift_history = [...(belief.drift_history || []), driftEntry];
    }

    const result = await this.db.update<Belief>(belief.id!, updateData);
    if (result.isOk()) {
      await this.events.emit('belief.updated', { belief_id: beliefId, changes: dto });
      await this.beliefEvents.record(beliefId, 'updated', { changes: dto });
    }
    return result;
  }

  async archive(beliefId: string): Promise<Result<Belief, DomainError>> {
    const result = await this.update(beliefId, { status: 'archived' });
    if (result.isOk()) {
      await this.events.emit('belief.archived', { belief_id: beliefId });
      await this.beliefEvents.record(beliefId, 'archived', {});
    }
    return result;
  }

  async findByClass(beliefClass: BeliefClass): Promise<Result<Belief[], DomainError>> {
    return this.db.query<Belief>('SELECT * FROM belief WHERE belief_class = $class ORDER BY belief_id', { class: beliefClass });
  }

  async findByStatus(status: BeliefStatus): Promise<Result<Belief[], DomainError>> {
    return this.db.query<Belief>('SELECT * FROM belief WHERE status = $status ORDER BY belief_id', { status });
  }

  async count(): Promise<Result<number, DomainError>> {
    const result = await this.db.query<{ count: number }>('SELECT count() AS count FROM belief GROUP ALL');
    if (result.isErr()) return err(result.error);
    return ok(result.value[0]?.count ?? 0);
  }

  generateId(beliefs: Belief[], prefix: string): string {
    const existing = beliefs.filter((b) => b.belief_id.startsWith(prefix))
      .map((b) => parseInt(b.belief_id.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return `${prefix}${next}`;
  }
}
