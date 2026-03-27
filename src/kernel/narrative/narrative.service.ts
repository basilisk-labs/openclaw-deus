import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { LlmClientService } from '../../llm/llm-client.service';
import { LlmOperationType, LlmPriority } from '../../llm/types/llm.types';
import { CommitDelta, NarrativeFrame, TimeSense } from '../kernel.types';
import { CommitKernelService } from '../commit/commit-kernel.service';
import { AffectiveStateService } from '../affect/affective-state.service';

/**
 * NarrativeService: Post-hoc temporal storytelling + commit log compaction.
 *
 * Two functions:
 * 1. COMPACTION: old commits outside attention window → compressed into NarrativeFrame
 * 2. NARRATION: generate temporal descriptions using time-sense + affect
 *    "это было давно", "тянулось", "пролетело"
 */

const NARRATE_TOOL = {
  name: 'narrate',
  description: 'Generate temporal narrative from cognitive state',
  input_schema: {
    type: 'object' as const,
    properties: {
      timeframe: { type: 'string' as const },
      summary: { type: 'string' as const },
      temporal_quality: { type: 'string' as const, enum: ['dragged', 'flew_by', 'felt_important', 'routine', 'intense'] },
      key_events: { type: 'array' as const, items: { type: 'string' as const } },
      unresolved: { type: 'array' as const, items: { type: 'string' as const } },
    },
    required: ['timeframe', 'summary', 'temporal_quality', 'key_events', 'unresolved'],
  },
};

const SYSTEM_PROMPT = `You are the narrative layer of a cognitive agent.
Given commit history and temporal perception, produce a short temporal narrative.
How did this period FEEL? Was it long or short? What stood out? What remains unresolved?
Use temporal language: "давно", "только что", "тянулось", "пролетело", "было важно".`;

@Injectable()
export class NarrativeService {
  private readonly logger = new Logger(NarrativeService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly llm: LlmClientService,
    private readonly commitKernel: CommitKernelService,
    private readonly affect: AffectiveStateService,
  ) {}

  /**
   * Compact old commits into narrative frames.
   * Commits outside attention window → summarized → deleted from commit_log.
   */
  async compact(): Promise<Result<{ compacted: number; frames_created: number }, DomainError>> {
    // Get all commits outside attention window
    const windowResult = await this.commitKernel.getAttentionWindow();
    if (windowResult.isErr()) return err(windowResult.error);

    const inWindow = new Set(windowResult.value.map(c => c.commit_id));

    const allResult = await this.db.query<CommitDelta>(
      'SELECT * FROM commit_log ORDER BY cycle ASC',
    );
    if (allResult.isErr()) return err(allResult.error);

    const outsideWindow = allResult.value.filter(c => !inWindow.has(c.commit_id));
    if (outsideWindow.length < 10) {
      return ok({ compacted: 0, frames_created: 0 }); // not enough to compact
    }

    // Group into chunks of ~20 commits
    const chunks: CommitDelta[][] = [];
    for (let i = 0; i < outsideWindow.length; i += 20) {
      chunks.push(outsideWindow.slice(i, i + 20));
    }

    let framesCreated = 0;
    for (const chunk of chunks) {
      const frame = await this.compactChunk(chunk);
      if (frame) {
        await this.db.create('narrative_frame', frame as unknown as Record<string, unknown>);
        // Delete compacted commits
        for (const c of chunk) {
          if (c.id) await this.db.remove(c.id);
        }
        framesCreated++;
      }
    }

    this.logger.log(`Compacted ${outsideWindow.length} commits into ${framesCreated} narrative frames`);
    return ok({ compacted: outsideWindow.length, frames_created: framesCreated });
  }

  /**
   * Compress a chunk of commits into a NarrativeFrame.
   * Uses LLM if available, otherwise rule-based.
   */
  private async compactChunk(commits: CommitDelta[]): Promise<NarrativeFrame | null> {
    if (commits.length === 0) return null;

    const cycleRange = `cycles ${commits[0].cycle}-${commits[commits.length - 1].cycle}`;
    const commitTypes = new Map<string, number>();
    let totalNovelty = 0;
    let totalPredError = 0;
    let escalations = 0;

    for (const c of commits) {
      commitTypes.set(c.type, (commitTypes.get(c.type) || 0) + 1);
      totalNovelty += c.novelty_cost;
      totalPredError += c.prediction_error;
      if (c.is_escalation) escalations++;
    }

    const avgNovelty = totalNovelty / commits.length;
    const avgPredError = totalPredError / commits.length;

    // Determine temporal quality from dynamics
    let temporalQuality: string;
    if (avgNovelty > 0.6 && avgPredError > 0.3) temporalQuality = 'intense';
    else if (avgNovelty > 0.5) temporalQuality = 'dragged'; // lots of novelty = felt long
    else if (avgNovelty < 0.2 && avgPredError < 0.1) temporalQuality = 'flew_by'; // routine
    else if (escalations > commits.length * 0.3) temporalQuality = 'felt_important';
    else temporalQuality = 'routine';

    // Key events: highest-energy commits
    const keyEvents = commits
      .sort((a, b) => b.energy - a.energy)
      .slice(0, 5)
      .map(c => `[${c.type}] ${c.source_agents.join('+')} (energy=${c.energy})`);

    // Try LLM narrative
    if (this.llm.isAvailable()) {
      try {
        const result = await this.llm.call<NarrativeFrame>({
          operationType: LlmOperationType.SELF_ASSESSMENT,
          priority: LlmPriority.LOW,
          maxTokens: 512,
          systemPrompt: SYSTEM_PROMPT,
          userMessage: `Period: ${cycleRange}\nCommits: ${commits.length}\nTypes: ${JSON.stringify(Object.fromEntries(commitTypes))}\nAvg novelty: ${avgNovelty.toFixed(2)}\nAvg pred error: ${avgPredError.toFixed(2)}\nEscalations: ${escalations}\nKey events:\n${keyEvents.join('\n')}`,
          tools: [NARRATE_TOOL],
          forceTool: 'narrate',
        });

        if (result.isOk()) {
          return result.value.data;
        }
      } catch { /* fallback below */ }
    }

    // Rule-based fallback
    return {
      timeframe: cycleRange,
      summary: `${commits.length} commits: ${Array.from(commitTypes.entries()).map(([t, c]) => `${c} ${t}`).join(', ')}`,
      temporal_quality: temporalQuality,
      key_events: keyEvents,
      unresolved: [],
    };
  }

  /**
   * Generate narrative for current state — used in introspection and operator communication.
   */
  async narrate(): Promise<Result<NarrativeFrame, DomainError>> {
    const timeSense = await this.commitKernel.computeTimeSense();
    const affectSnapshot = this.affect.getSnapshot();
    const recentCommits = await this.commitKernel.getAttentionWindow();

    const commits = recentCommits.isOk() ? recentCommits.value : [];
    if (commits.length === 0) {
      return ok({
        timeframe: 'current',
        summary: 'Nothing in awareness. System resting.',
        temporal_quality: 'routine',
        key_events: [],
        unresolved: [],
      });
    }

    // Build narrative from commit dynamics
    const frame = await this.compactChunk(commits);
    if (!frame) {
      return ok({ timeframe: 'current', summary: 'Minimal activity.', temporal_quality: 'routine', key_events: [], unresolved: [] });
    }

    // Enrich with affect
    frame.timeframe = `current (dilation=${timeSense.dilation}, mode=${affectSnapshot.mode})`;
    if (affectSnapshot.pain.intensity > 0.3) {
      frame.unresolved.push(`Pain: ${affectSnapshot.pain.source} (${affectSnapshot.pain.chronic ? 'chronic' : 'acute'})`);
    }

    return ok(frame);
  }

  async getRecentFrames(limit = 10): Promise<Result<NarrativeFrame[], DomainError>> {
    return this.db.query<NarrativeFrame>(
      `SELECT * FROM narrative_frame ORDER BY timeframe DESC LIMIT $limit`,
      { limit },
    );
  }
}
