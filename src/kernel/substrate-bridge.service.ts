import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';
import { TraceGraphService } from './memory/trace-graph.service';
import { WorldModelService } from '../world-model/world-model.service';
import { CommitDelta } from './kernel.types';

/**
 * SubstrateBridge: Synchronizes reptilian brain state ↔ trace graph.
 *
 * Two directions:
 * 1. SUBSTRATE → TRACES: when substrate services create data (intentions, knowledge, episodes),
 *    corresponding traces are auto-created in the trace graph.
 * 2. COMMITS → WORLD MODEL: when kernel commits are produced,
 *    world model and self model are actually updated.
 *
 * This closes the gap between the two realities.
 */
@Injectable()
export class SubstrateBridgeService {
  private readonly logger = new Logger(SubstrateBridgeService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly traceGraph: TraceGraphService,
    private readonly worldModel: WorldModelService,
  ) {}

  /**
   * Sync substrate state → traces. Called after each kernel cycle.
   * Finds recently created substrate records that don't have corresponding traces.
   */
  async syncSubstrateToTraces(cycle: number): Promise<{ synced: number }> {
    let synced = 0;

    // Sync recent knowledge → traces
    const newKnowledge = await this.db.query<any>(
      `SELECT knowledge_id, content, confidence, domain FROM knowledge
       WHERE status = 'active'
       AND knowledge_id NOT IN (SELECT source_id FROM trace WHERE source_type = 'knowledge' AND archived = false)
       LIMIT 20`,
    );
    if (newKnowledge.isOk()) {
      for (const k of newKnowledge.value) {
        const conf = typeof k.confidence === 'object' ? k.confidence.point : k.confidence;
        await this.traceGraph.createTrace({
          source_type: 'knowledge',
          source_id: k.knowledge_id,
          content: `[${k.domain}] ${k.content}`,
          initial_weight: (conf || 0.5) * 0.7,
          confidence: conf || 0.5,
        });
        synced++;
      }
    }

    // Sync recent intentions → traces
    const newIntentions = await this.db.query<any>(
      `SELECT intention_id, description, priority, status FROM intention
       WHERE status IN ['recognized', 'adopted', 'active']
       AND intention_id NOT IN (SELECT source_id FROM trace WHERE source_type = 'decision' AND archived = false)
       LIMIT 10`,
    );
    if (newIntentions.isOk()) {
      for (const i of newIntentions.value) {
        await this.traceGraph.createTrace({
          source_type: 'decision',
          source_id: i.intention_id,
          content: `Intention: ${i.description}`,
          initial_weight: (i.priority || 0.5) * 0.8,
          confidence: i.priority || 0.5,
          emotional_charge: 0.1, // intentions have mild positive charge
        });
        synced++;
      }
    }

    // Sync recent episodes → traces (with emotional charge from outcome)
    const newEpisodes = await this.db.query<any>(
      `SELECT episode_id, summary, outcome, intention_id FROM episode
       WHERE episode_id NOT IN (SELECT source_id FROM trace WHERE source_type = 'episode' AND archived = false)
       LIMIT 10`,
    );
    if (newEpisodes.isOk()) {
      for (const ep of newEpisodes.value) {
        const charge = ep.outcome === 'success' ? 0.3
          : ep.outcome === 'failure' ? -0.4
          : ep.outcome === 'partial_success' ? 0.1
          : -0.1;
        await this.traceGraph.createTrace({
          source_type: 'episode',
          source_id: ep.episode_id,
          content: `Episode [${ep.outcome}]: ${ep.summary || ep.intention_id}`,
          initial_weight: 0.6,
          confidence: 0.7,
          emotional_charge: charge,
        });
        synced++;
      }
    }

    if (synced > 0) {
      this.logger.log(`Substrate→Traces: synced ${synced} records`);
    }

    return { synced };
  }

  /**
   * Apply commits to world model. Called after kernel stabilizes.
   * Aggregates all commit deltas and rebuilds world model if significant changes.
   */
  async applyCommitsToWorldModel(commits: CommitDelta[]): Promise<void> {
    if (commits.length === 0) return;

    // Count significant commits by type
    const typeCounts: Record<string, number> = {};
    let totalEnergy = 0;
    for (const c of commits) {
      typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
      totalEnergy += c.energy;
    }

    // Rebuild world model if: any self_model commits, or high total energy, or >5 commits
    const needsRebuild = (typeCounts['self_model'] || 0) > 0
      || totalEnergy > 0.5
      || commits.length > 5;

    if (needsRebuild) {
      const result = await this.worldModel.build();
      if (result.isOk()) {
        this.logger.log(`World model rebuilt: confidence=${result.value.confidence} (triggered by ${commits.length} commits, energy=${totalEnergy.toFixed(2)})`);
      }
    }
  }

  /**
   * Reinforce traces from episode outcomes. Called by affect system.
   */
  async reinforceFromEpisode(episodeId: string, outcome: string): Promise<void> {
    const reward = outcome === 'success' ? 0.3
      : outcome === 'failure' ? -0.3
      : outcome === 'partial_success' ? 0.1
      : 0;

    if (Math.abs(reward) < 0.01) return;

    // Find traces related to this episode's intention
    const episode = await this.db.query<any>(
      'SELECT intention_id FROM episode WHERE episode_id = $eid LIMIT 1',
      { eid: episodeId },
    );
    if (episode.isErr() || episode.value.length === 0) return;

    const intentionId = episode.value[0].intention_id;
    if (!intentionId) return;

    // Find all traces linked to this intention
    const traces = await this.db.query<any>(
      `SELECT trace_id FROM trace WHERE source_id = $iid AND archived = false`,
      { iid: intentionId },
    );
    if (traces.isErr()) return;

    const traceIds = traces.value.map((t: any) => t.trace_id);
    if (traceIds.length > 0) {
      await this.traceGraph.reinforceFromOutcome(traceIds, reward);
      this.logger.log(`Episode ${episodeId} (${outcome}) → reinforced ${traceIds.length} traces (reward=${reward})`);
    }
  }
}
