import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { OperatorModel, SessionState } from '../common/types/operator-model.types';

const DEFAULT_MODEL: Omit<OperatorModel, 'id' | 'updated_at'> = {
  expertise: [],
  communication: {
    preferred_detail_level: 'standard',
    preferred_format: 'structured',
    tolerance_for_questions: 'medium',
    evidence: [],
  },
  session: {
    cognitive_load: 'medium',
    engagement: 'active',
    frustration_signals: 0,
    interaction_count: 0,
  },
  patterns: {
    prefers_autonomous_work: false,
    review_style: 'results_only',
  },
  trust: {
    operator_trust_in_agent: 0.7,
    agent_trust_in_operator: 1.0,
    evidence: [],
  },
};

@Injectable()
export class OperatorModelService {
  private readonly logger = new Logger(OperatorModelService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
  ) {}

  async getModel(): Promise<Result<OperatorModel, DomainError>> {
    const result = await this.db.query<OperatorModel>('SELECT * FROM operator_model LIMIT 1');
    if (result.isErr()) return err(result.error);

    if (result.value.length === 0) {
      // Initialize with defaults
      return this.db.create<OperatorModel>('operator_model', {
        ...DEFAULT_MODEL,
        updated_at: new Date().toISOString(),
      } as unknown as OperatorModel);
    }

    return ok(result.value[0]);
  }

  async updateSession(sessionUpdate: Partial<SessionState>): Promise<Result<OperatorModel, DomainError>> {
    const model = await this.getModel();
    if (model.isErr()) return err(model.error);

    const current = model.value;
    const newSession = { ...current.session, ...sessionUpdate };

    return this.db.update<OperatorModel>(current.id!, {
      session: newSession,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>);
  }

  async updateTrust(overrideOccurred: boolean): Promise<Result<void, DomainError>> {
    const model = await this.getModel();
    if (model.isErr()) return err(model.error);

    const trust = model.value.trust;
    // If operator overrides agent decisions, their trust in agent decreases slightly
    if (overrideOccurred) {
      trust.operator_trust_in_agent = Math.max(0.1, trust.operator_trust_in_agent - 0.02);
    } else {
      // Successful interaction builds trust slowly
      trust.operator_trust_in_agent = Math.min(1.0, trust.operator_trust_in_agent + 0.005);
    }

    await this.db.update(model.value.id!, {
      trust,
      updated_at: new Date().toISOString(),
    });

    return ok(undefined);
  }

  async addExpertise(domain: string, level: 'novice' | 'competent' | 'expert', evidence: string): Promise<Result<void, DomainError>> {
    const model = await this.getModel();
    if (model.isErr()) return err(model.error);

    const expertise = [...model.value.expertise];
    const existing = expertise.find((e) => e.domain === domain);
    if (existing) {
      existing.level = level;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
      existing.evidence.push(evidence);
    } else {
      expertise.push({ domain, level, confidence: 0.6, evidence: [evidence] });
    }

    await this.db.update(model.value.id!, { expertise, updated_at: new Date().toISOString() });
    await this.events.emit('operator_model.updated', { domain, level });
    return ok(undefined);
  }
}
