import { Injectable, Logger, Optional } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { WorldModel } from '../common/types/world-model.types';
import { BeliefsService } from '../beliefs/beliefs.service';
import { MemoryService } from '../memory/memory.service';
import { IntentionService } from '../intention/intention.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeGapService } from '../knowledge/services/knowledge-gap.service';
import { OperatorModelService } from '../operator-model/operator-model.service';
import { EpisodeService } from '../experience/episode.service';
import { TemporalCognitionService } from '../cognitive/temporal-cognition.service';
import { ConceptSpaceService } from '../kernel/space/concept-space.service';

@Injectable()
export class WorldModelService {
  private readonly logger = new Logger(WorldModelService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly memory: MemoryService,
    private readonly intentions: IntentionService,
    private readonly knowledge: KnowledgeService,
    private readonly gaps: KnowledgeGapService,
    private readonly operatorModel: OperatorModelService,
    private readonly episodes: EpisodeService,
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
    private readonly temporal: TemporalCognitionService,
    @Optional() private readonly conceptSpace?: ConceptSpaceService,
  ) {}

  // Single SurrealQL query to gather ALL world model data (replaces 8+ service calls)
  private static readonly WORLD_MODEL_QUERY = `
    LET $beliefs = (SELECT count() AS c, math::mean(confidence) AS avg FROM belief WHERE status = 'active' GROUP ALL);
    LET $axioms = (SELECT belief_id AS id, content, confidence FROM belief WHERE string::starts_with(belief_id, 'I') AND status = 'active');
    LET $knowledge_count = (SELECT count() AS c FROM knowledge WHERE status = 'active' GROUP ALL);
    LET $k_axioms = (SELECT knowledge_id AS id, content FROM knowledge WHERE kind = 'axiom' AND status = 'active');
    LET $intentions = (SELECT * FROM intention WHERE status IN ['recognized', 'adopted', 'active', 'suspended'] ORDER BY priority DESC LIMIT 20);
    LET $gaps_open = (SELECT * FROM knowledge_gap WHERE status = 'open' ORDER BY impact DESC);
    LET $gaps_high = (SELECT * FROM knowledge_gap WHERE status = 'open' AND impact >= 0.7);
    LET $ep_stats = (SELECT count() AS total, count(outcome IN ['success', 'partial_success']) AS successes FROM episode GROUP ALL);
    LET $latest_mem = (SELECT day_key, timestamp FROM activity_log ORDER BY timestamp DESC LIMIT 1);
    LET $latest_intro = (SELECT generated_at, posture FROM introspection_report ORDER BY generated_at DESC LIMIT 1);
    LET $operator = (SELECT * FROM operator_model LIMIT 1);
    LET $contradictions = (SELECT count() AS c FROM contradicts GROUP ALL);
    RETURN {
      beliefs: $beliefs[0],
      axioms: $axioms,
      knowledge_count: $knowledge_count[0].c OR 0,
      k_axioms: $k_axioms,
      intentions: $intentions,
      gaps_open: $gaps_open,
      gaps_high: $gaps_high,
      ep_stats: $ep_stats[0],
      latest_mem: $latest_mem[0],
      latest_intro: $latest_intro[0],
      operator: $operator[0],
      contradictions: $contradictions[0].c OR 0
    }
  `;

  async build(now?: Date): Promise<Result<WorldModel, DomainError>> {
    // If concept space is available, use it as the PRIMARY world model source
    if (this.conceptSpace && this.conceptSpace.getDimensionCount() > 0) {
      return this.buildFromConceptSpace(now);
    }
    // Fallback: SQL-based build (reptilian brain, before concept space boots)
    const currentTime = now || new Date();
    const dayKey = currentTime.toISOString().slice(0, 10);

    // Single DB round-trip for ALL data
    const dbResult = await this.db.queryRaw<any>(WorldModelService.WORLD_MODEL_QUERY);
    const d = dbResult.isOk() ? (Array.isArray(dbResult.value) ? dbResult.value[dbResult.value.length - 1] : dbResult.value) : {} as Record<string, unknown>;

    const beliefs = { count: d?.beliefs?.c || 0, avgConf: d?.beliefs?.avg || 0 };
    const knowledgeCount = d?.knowledge_count || 0;
    const intentionsList = d?.intentions || [];
    const topIntention = intentionsList[0] || null;
    const gapsList = d?.gaps_open || [];
    const highGaps = d?.gaps_high || [];
    const operator = d?.operator || null;
    const epStats = d?.ep_stats || { total: 0, successes: 0 };
    const agentSuccessRate = epStats.total > 0 ? epStats.successes / epStats.total : 0.5;
    const latestMemoryDay = d?.latest_mem?.day_key || null;
    const introDate = d?.latest_intro?.generated_at || null;

    const memoryFreshnessDays = latestMemoryDay
      ? Math.floor((currentTime.getTime() - new Date(latestMemoryDay).getTime()) / 86400000) : 999;
    const staleDays = this.config.get('worldmodel.memory_stale_days');

    // === Build invariants from both v2 (beliefs) and v4 (knowledge axioms) ===
    const beliefInvariants = (d?.axioms || []).map((b: any) => ({ id: b.id, content: b.content, confidence: b.confidence }));
    const knowledgeAxioms = (d?.k_axioms || []).map((k: any) => ({ id: k.id, content: k.content, confidence: 1.0 }));
    const invariants = [...beliefInvariants, ...knowledgeAxioms];

    // === Build goals from intentions ===
    const intentionGoals = intentionsList.filter((i: any) => i.kind === 'goal')
      .map((i: any) => ({ id: i.intention_id, content: i.description, confidence: i.priority }));
    const goals = intentionGoals;

    // === Confidence calculation ===
    const confidence = this.calculateConfidence({
      beliefCount: beliefs.count,
      knowledgeCount,
      intentionCount: intentionsList.length,
      memoryDays: latestMemoryDay ? 1 : 0,
      logCount: latestMemoryDay ? 1 : 0,
      gapCount: gapsList.length,
      agentSuccessRate,
    });

    // === Assemble world model ===
    const model: WorldModel = {
      version: 2,
      generated_at: currentTime.toISOString(),
      workspace_day: dayKey,
      confidence,

      self_model: {
        agency_level: 'L2+',
        invariants,
        goals,
        review_pressure: gapsList.length + highGaps.length,
        active_limitations: [
          ...(memoryFreshnessDays > staleDays ? ['stale_memory'] : []),
          ...(knowledgeCount < 5 ? ['low_knowledge_base'] : []),
          ...(agentSuccessRate < 0.5 ? ['low_success_rate'] : []),
        ],
      },

      human_model: {
        preferences: operator?.expertise?.map((e: any) => `${e.domain}: ${e.level}`) || [],
        constraints: operator?.patterns ? [
          ...(operator.patterns.active_hours ? [`Active hours: ${operator.patterns.active_hours}`] : []),
          `Review style: ${operator.patterns.review_style}`,
        ] : [],
        active_requests: intentionsList
          .filter((i: any) => i.source === 'operator_explicit' && i.status === 'active')
          .map((i: any) => i.description),
      },

      workspace_model: {
        active_project: topIntention?.description || null,
        mode: intentionsList.length > 0 ? 'active' : 'idle',
        status: intentionsList.some((i: any) => i.progress?.blockers?.length > 0) ? 'blocked' : 'active',
        repo_dirty: false,
        memory_freshness_days: memoryFreshnessDays,
        introspection_date: introDate,
        next_step: topIntention?.progress.last_action || null,
      },

      environment_model: {
        waiting_conditions: intentionsList
          .filter((i: any) => i.status === 'suspended')
          .map((i: any) => `Waiting: ${i.description}`),
        dependencies: intentionsList
          .filter((i: any) => i.progress?.blockers?.length > 0)
          .flatMap((i: any) => i.progress.blockers),
        open_tensions: highGaps.map((g: any) => g.description),
        external_systems: [],
      },

      action_priors: {
        hard_blocks: gapsList
          .filter((g: any) => g.impact > 0.8)
          .map((g: any) => `Knowledge gap: ${g.description}`),
        preferred_modes: operator?.patterns?.prefers_autonomous_work
          ? ['direct_act', 'prepare_conditions']
          : ['observe', 'analyze'],
        active_risks: [
          ...(memoryFreshnessDays > 5 ? ['stale_context'] : []),
          ...(agentSuccessRate < 0.6 ? ['low_success_rate_risk'] : []),
          ...(operator?.session?.frustration_signals && operator.session.frustration_signals > 3 ? ['operator_frustrated'] : []),
        ],
      },

      sources: {
        beliefs: { count: beliefs.count },
        memory: { days: latestMemoryDay ? 1 : 0, latest_day: latestMemoryDay },
        logs: { entries: 0 },
        pending_beliefs: { count: 0 },
        status: { exists: true },
      },
    };

    await this.db.create('world_model', model as unknown as Record<string, unknown>);
    return ok(model);
  }

  /**
   * Build world model FROM concept space.
   * The concept space IS the world model — dimensions = beliefs about structure,
   * positions = facts, clusters = categories, gradient = desires.
   */
  private async buildFromConceptSpace(now?: Date): Promise<Result<WorldModel, DomainError>> {
    const currentTime = now || new Date();
    const spatial = await this.conceptSpace!.snapshot();

    const model: WorldModel = {
      version: 3, // spatial version
      generated_at: currentTime.toISOString(),
      workspace_day: currentTime.toISOString().slice(0, 10),
      confidence: spatial.confidence,

      self_model: {
        agency_level: 'L3-spatial',
        invariants: spatial.self_region ? spatial.self_region.traces.map(t => ({ id: t, content: t, confidence: 1 })) : [],
        goals: [],
        review_pressure: spatial.gaps.length,
        active_limitations: spatial.gaps.map(g => g.expected_by),
      },

      human_model: { preferences: [], constraints: [], active_requests: [] },

      workspace_model: {
        active_project: null,
        mode: spatial.gradient_field.attractors.length > 0 ? 'active' : 'idle',
        status: 'active',
        repo_dirty: false,
        memory_freshness_days: 0,
        introspection_date: null,
        next_step: null,
      },

      environment_model: {
        waiting_conditions: [],
        dependencies: [],
        open_tensions: spatial.gaps.map(g => `Gap at ${g.expected_by}`),
        external_systems: [],
      },

      action_priors: {
        hard_blocks: [],
        preferred_modes: ['direct_act'],
        active_risks: spatial.coherence < 0.3 ? ['low_coherence'] : [],
      },

      sources: {
        beliefs: { count: spatial.trace_count },
        memory: { days: 0 },
        logs: { entries: 0 },
        pending_beliefs: { count: 0 },
        status: { exists: true },
      },

      // NEW: spatial data
      spatial: {
        dimensions: spatial.dimensions.map(d => ({ id: d.id, label: d.label || `axis_${d.id}`, usage: d.usage_count })),
        regions: spatial.regions.length,
        self_traces: spatial.self_region?.traces.length || 0,
        trajectories: spatial.trajectories.length,
        attractors: spatial.gradient_field.attractors.length,
        repellers: spatial.gradient_field.repellers.length,
        coherence: spatial.coherence,
        gaps: spatial.gaps.length,
      },
    } as unknown as WorldModel;

    await this.db.create('world_model', model as unknown as Record<string, unknown>);
    return ok(model);
  }

  async getLatest(): Promise<Result<WorldModel | null, DomainError>> {
    const result = await this.db.query<WorldModel>('SELECT * FROM world_model ORDER BY generated_at DESC LIMIT 1');
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }

  isFresh(model: WorldModel, now?: Date): boolean {
    const currentTime = now || new Date();
    const hoursOld = (currentTime.getTime() - new Date(model.generated_at).getTime()) / 3600000;
    return hoursOld < this.config.get('worldmodel.stale_after_hours');
  }

  private calculateConfidence(data: {
    beliefCount: number; knowledgeCount: number; intentionCount: number;
    memoryDays: number; logCount: number; gapCount: number; agentSuccessRate: number;
  }): number {
    let score = 0.2; // base
    if (data.beliefCount > 5 || data.knowledgeCount > 5) score += 0.15;
    if (data.knowledgeCount > 10) score += 0.1;
    if (data.intentionCount > 0) score += 0.1; // we know what we're doing
    if (data.memoryDays > 0) score += 0.15;
    if (data.logCount > 0) score += 0.1;
    if (data.gapCount === 0) score += 0.1; // no open questions
    score += data.agentSuccessRate * 0.1; // competence boost
    return Math.min(1.0, Math.round(score * 1000) / 1000);
  }
}
