import { Injectable, Logger } from '@nestjs/common';
import { Result, ok } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { CognitivePipelineResult } from '../common/types/cognitive-config.types';
import { EventsService } from '../events/events.service';
import { IntentionRecognitionService } from '../intention/services/intention-recognition.service';
import { IntentionStackService } from '../intention/services/intention-stack.service';
import { IntentionService } from '../intention/intention.service';
import { KnowledgeExtractionService } from '../knowledge/services/knowledge-extraction.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { Knowledge } from '../common/types/knowledge.types';
import { KnowledgeGapService } from '../knowledge/services/knowledge-gap.service';
import { DeliberationService } from '../deliberation/deliberation.service';
import { EpisodeService } from '../experience/episode.service';
import { SelfAssessmentService } from '../experience/self-assessment.service';
import { SessionTrackerService } from '../operator-model/services/session-tracker.service';
import { MemoryService } from '../memory/memory.service';
import { GraphLinkingService } from './graph-linking.service';
import { CognitiveConfigService } from './cognitive-config.service';
import { WorldModelService } from '../world-model/world-model.service';
import { BeliefsService } from '../beliefs/beliefs.service';
import { TemporalCognitionService } from './temporal-cognition.service';
import { KernelLoopService } from '../kernel/kernel-loop.service';
import { KernelOutput } from '../kernel/kernel.types';

/**
 * CognitivePipelineService: THE BRAIN's MAIN LOOP.
 *
 * This is the orchestrator that ties all cognitive components together.
 * When an operator message arrives: intention → knowledge → deliberation → episode.
 *
 * Two pipelines:
 * 1. processMessage() — triggered on every substantive operator message
 * 2. onIntentionCompleted() — triggered when an intention reaches terminal state
 */
@Injectable()
export class CognitivePipelineService {
  private readonly logger = new Logger(CognitivePipelineService.name);

  constructor(
    private readonly events: EventsService,
    private readonly intentionRecognition: IntentionRecognitionService,
    private readonly intentionStack: IntentionStackService,
    private readonly intentions: IntentionService,
    private readonly knowledgeExtraction: KnowledgeExtractionService,
    private readonly knowledge: KnowledgeService,
    private readonly gaps: KnowledgeGapService,
    private readonly deliberation: DeliberationService,
    private readonly episodes: EpisodeService,
    private readonly selfAssessment: SelfAssessmentService,
    private readonly sessionTracker: SessionTrackerService,
    private readonly memory: MemoryService,
    private readonly graphLinking: GraphLinkingService,
    private readonly config: CognitiveConfigService,
    private readonly worldModel: WorldModelService,
    private readonly beliefsService: BeliefsService,
    private readonly temporalCognition: TemporalCognitionService,
    private readonly kernelLoop: KernelLoopService,
  ) {}

  /**
   * Process an operator message through the cognitive kernel.
   *
   * The kernel is a self-recursive loop: agents → traces → convergence → commit → reflect → loop.
   * This method delegates to the kernel and translates output to pipeline result format.
   */
  async processMessage(message: string): Promise<Result<CognitivePipelineResult, DomainError>> {
    const startTime = Date.now();

    // Substrate: session tracking + memory logging (reptilian brain)
    await this.sessionTracker.trackMessage(message);
    await this.memory.logInteraction(message);

    // === KERNEL: self-recursive inner dialogue ===
    const kernelResult = await this.kernelLoop.think(message);

    if (kernelResult.isErr()) {
      this.logger.error(`Kernel failed: ${kernelResult.error.message}`);
      return ok({
        intentions_recognized: 0, intentions_completed: 0,
        knowledge_extracted: 0, knowledge_gaps_found: 0,
        deliberations_made: 0, duration_ms: Date.now() - startTime,
      });
    }

    const output = kernelResult.value;

    // Translate kernel output → pipeline result (backward compat for metrics/nightly)
    const result = this.translateKernelOutput(output, startTime);

    this.logger.log(
      `Kernel: ${output.total_cycles} cycles, ${output.total_commits} commits, ` +
      `${output.converged ? 'CONVERGED' : 'MAX_ITER'} (${output.convergence_reason}), ` +
      `dilation=${output.time_sense.dilation}, ${result.duration_ms}ms`,
    );

    return ok(result);
  }

  /**
   * Translate kernel output to CognitivePipelineResult for backward compatibility.
   */
  private translateKernelOutput(output: KernelOutput, startTime: number): CognitivePipelineResult {
    // Count perceptual commits that contain intentions
    const perceptual = output.commits.filter(c => c.type === 'perceptual');
    const strategic = output.commits.filter(c => c.type === 'action' || c.type === 'interpretive');

    return {
      intentions_recognized: perceptual.filter(c =>
        c.changes.traces_created.length > 0 || c.source_agents.includes('sensory'),
      ).length,
      intentions_completed: perceptual.filter(c =>
        (c.changes as Record<string, unknown>).completed,
      ).length,
      knowledge_extracted: perceptual.length,
      knowledge_gaps_found: 0,
      deliberations_made: strategic.length,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Handle intention completion: create episode, extract knowledge, check parent.
   */
  async onIntentionCompleted(intentionId: string, outcome: 'completed' | 'failed' | 'abandoned', reason: string): Promise<void> {
    this.logger.log(`Intention ${intentionId} completed: ${outcome}`);

    const episodeOutcome = outcome === 'completed' ? 'success' as const
      : outcome === 'failed' ? 'failure' as const
      : 'abandoned' as const;

    const episodeResult = await this.episodes.createFromCompletion(intentionId, reason, episodeOutcome);

    if (episodeResult.isOk()) {
      await this.extractKnowledgeFromEpisode(episodeResult.value);
    }

    await this.intentionStack.checkParentCompletion(intentionId);
    await this.selfAssessment.updateFromEpisodes();
  }

  // --- Private pipeline steps ---

  private async recognizeIntentions(message: string): Promise<any | null> {
    try {
      const result = await this.intentionRecognition.recognizeFromMessage(message);
      return result.isOk() ? result.value : null;
    } catch (e) {
      this.logger.warn(`Intention recognition failed: ${e}`);
      return null;
    }
  }

  private async extractKnowledge(message: string): Promise<any | null> {
    try {
      const result = await this.knowledgeExtraction.extractFromInteraction(message);
      return result.isOk() ? result.value : null;
    } catch (e) {
      this.logger.warn(`Knowledge extraction failed: ${e}`);
      return null;
    }
  }

  private async deliberateOnIntentions(newIntentions: any[]): Promise<number> {
    let deliberationCount = 0;
    const similarityThreshold = this.config.get('similarity.knowledge_match');

    for (const newInt of newIntentions) {
      const active = await this.intentions.findActive();
      if (active.isErr()) continue;

      const intention = active.value.find((i) =>
        i.description === newInt.description && i.status === 'recognized',
      );
      if (!intention) continue;

      const relevantKnowledge = await this.knowledge.findSimilar(intention.description, similarityThreshold);
      const knowledgeContext = relevantKnowledge.isOk() ? relevantKnowledge.value : [];

      const deliberationResult = await this.deliberation.deliberate(intention, { knowledge: knowledgeContext as Knowledge[] });
      if (deliberationResult.isOk()) {
        deliberationCount++;
        for (const k of knowledgeContext) {
          await this.graphLinking.linkIntentionToKnowledge(intention.intention_id, (k as Knowledge).knowledge_id);
        }
      }
    }

    return deliberationCount;
  }

  private async linkGapsToIntentions(knowledgeGaps: any[]): Promise<void> {
    for (const gap of knowledgeGaps) {
      const openGaps = await this.gaps.findOpen();
      if (openGaps.isErr()) continue;

      const matchingGap = openGaps.value.find((g: any) => g.description === gap.description);
      if (!matchingGap) continue;

      const activeIntentions = await this.intentions.findActive();
      if (activeIntentions.isErr()) continue;

      for (const intention of activeIntentions.value) {
        if (this.domainOverlap(intention.description, gap.domain)) {
          await this.graphLinking.linkIntentionToGap(intention.intention_id, gap.description);
        }
      }
    }
  }

  private async extractKnowledgeFromEpisode(episode: any): Promise<void> {
    for (const lesson of episode.lessons || []) {
      const knowledgeKind = lesson.kind === 'factual' ? 'fact' as const
        : lesson.kind === 'procedural' ? 'procedural' as const
        : 'meta' as const;

      const kResult = await this.knowledge.create({
        kind: knowledgeKind,
        content: lesson.content,
        domain: 'general',
        confidence: lesson.confidence,
        evidence: [{
          source: episode.episode_id,
          quality: 'strong_implication',
          timestamp: new Date().toISOString(),
          content: `Lesson from episode ${episode.episode_id}`,
        }],
      });

      if (kResult.isOk()) {
        await this.graphLinking.linkKnowledgeToEpisode((kResult.value as Knowledge).knowledge_id, episode.episode_id);
      }
    }
  }

  private domainOverlap(text: string, domain: string): boolean {
    return text.toLowerCase().includes(domain.toLowerCase());
  }

  /**
   * Active recall: proactively retrieve relevant knowledge and beliefs before processing.
   * This makes extraction aware of what the system already knows, preventing redundant extraction
   * and enabling reinforcement of existing knowledge.
   */
  private async activeRecall(message: string): Promise<string | null> {
    try {
      // Find similar knowledge to the incoming message
      const similar = await this.knowledge.findSimilar(message, 0.5);
      if (similar.isErr() || similar.value.length === 0) return null;

      const topKnowledge = similar.value.slice(0, 5);
      return topKnowledge.map((k: any) => `[${k.knowledge_id}] ${k.content}`).join('; ');
    } catch {
      return null;
    }
  }

  /**
   * Non-blocking world model refresh when stale.
   * (Proposed by DiagnosisService — cognitive self-modification)
   */
  private refreshWorldModelIfStale(): void {
    this.worldModel.getLatest().then((wmResult) => {
      if (wmResult.isErr() || !wmResult.value || !this.worldModel.isFresh(wmResult.value)) {
        this.logger.log('World model stale — triggering rebuild');
        this.worldModel.build().catch((e) => {
          this.logger.warn(`Background world model rebuild failed: ${e}`);
        });
      }
    }).catch((e) => this.logger.debug?.('Background world model rebuild failed: ' + e));
  }
}
