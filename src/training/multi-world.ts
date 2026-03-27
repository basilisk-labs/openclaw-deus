/**
 * MULTI-WORLD: Same kernel, different worlds. Transfer learning test.
 *
 * Phase 1 (60%): Train in EvolvingWorld (physical objects)
 * Phase 2 (40%): Switch to SocialWorld (social interactions)
 *
 * Key question: does learning in world A help in world B?
 * The kernel keeps its concept space, traces, clusters — nothing resets.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { KernelLoopService } from '../kernel/kernel-loop.service';
import { TraceGraphService } from '../kernel/memory/trace-graph.service';
import { CommitKernelService } from '../kernel/commit/commit-kernel.service';
import { AffectiveStateService } from '../kernel/affect/affective-state.service';
import { ConceptSpaceService } from '../kernel/space/concept-space.service';
import { ModalityDiscoveryService } from '../kernel/sensory/modality-discovery.service';
import { EnergyService } from '../kernel/energy.service';
import { DevelopmentalMetricsService } from '../kernel/developmental-metrics.service';
import { LlmClientService } from '../llm/llm-client.service';
import { SurrealService } from '../database/surreal.service';
import { EvolvingWorld } from './evolving-world';
import { SocialWorld } from './social-world';
import { AgentAction, ActionConsequence, WorldBridge } from '../kernel/agency.types';

const TOTAL_TICKS = parseInt(process.argv[2] || '500', 10);
const PHASE1_RATIO = 0.6;
const PHASE1_TICKS = Math.floor(TOTAL_TICKS * PHASE1_RATIO);
const PHASE2_TICKS = TOTAL_TICKS - PHASE1_TICKS;
const REPORT_INTERVAL = Math.max(10, Math.floor(TOTAL_TICKS / 20));
const DEV_METRICS_INTERVAL = Math.max(25, Math.floor(TOTAL_TICKS / 10));

// ═══════════════════════════════════════════
// CorrectiveWorldBridge for EvolvingWorld
// (same as childhood.ts)
// ═══════════════════════════════════════════

class PhysicalWorldBridge implements WorldBridge {
  private lastPredictionWasWrong = false;

  constructor(
    private readonly world: EvolvingWorld,
    private readonly devMetrics: DevelopmentalMetricsService,
    private readonly affect: AffectiveStateService,
    private readonly conceptSpace: ConceptSpaceService,
  ) {}

  async executeAction(action: AgentAction): Promise<ActionConsequence[]> {
    const consequences = this.world.childAction(action.method || 'touch', action.target);
    let valence = this.computeValence(consequences);

    if (this.lastPredictionWasWrong) {
      valence *= 1.5;
      this.lastPredictionWasWrong = false;
    }

    const isExploration = !action.target || Math.random() < 0.5;
    this.devMetrics.recordAction(
      action.method || 'touch',
      action.target || 'unknown',
      this.world.getState().tick,
      isExploration,
    );

    if (valence < -0.1) {
      this.devMetrics.recordPainOnset(this.world.getState().tick);
    }

    return consequences.map(e => ({
      content: e.content,
      source: e.source,
      emotional_valence: valence,
    }));
  }

  getAvailableTargets(): string[] { return this.world.getObjectNames(); }
  getAvailableActions(): string[] { return this.world.getAvailableActions(); }
  markPredictionWrong(): void { this.lastPredictionWasWrong = true; }

  private computeValence(consequences: Array<{ content: string; source: string }>): number {
    let valence = 0;
    for (const _c of consequences) { valence += 0.02; }
    return Math.max(-1, Math.min(1, valence));
  }
}

// ═══════════════════════════════════════════
// CorrectiveWorldBridge for SocialWorld
// ═══════════════════════════════════════════

class SocialWorldBridge implements WorldBridge {
  private lastPredictionWasWrong = false;

  constructor(
    private readonly world: SocialWorld,
    private readonly devMetrics: DevelopmentalMetricsService,
    private readonly affect: AffectiveStateService,
  ) {}

  async executeAction(action: AgentAction): Promise<ActionConsequence[]> {
    const consequences = this.world.childAction(action.method || 'observe', action.target);
    let valence = this.computeSocialValence(consequences);

    if (this.lastPredictionWasWrong) {
      valence *= 1.5;
      this.lastPredictionWasWrong = false;
    }

    const isExploration = !action.target || Math.random() < 0.5;
    this.devMetrics.recordAction(
      action.method || 'observe',
      action.target || 'unknown',
      this.world.getState().tick,
      isExploration,
    );

    if (valence < -0.1) {
      this.devMetrics.recordPainOnset(this.world.getState().tick);
    }

    return consequences.map(e => ({
      content: e.content,
      source: e.source,
      emotional_valence: valence,
    }));
  }

  getAvailableTargets(): string[] { return this.world.getObjectNames(); }
  getAvailableActions(): string[] { return this.world.getAvailableActions(); }
  markPredictionWrong(): void { this.lastPredictionWasWrong = true; }

  /**
   * Social valence: derived from event source tags.
   * Sharing/cooperation → positive, conflict/taking → negative.
   */
  private computeSocialValence(consequences: Array<{ content: string; source: string }>): number {
    let valence = 0;
    for (const c of consequences) {
      switch (c.source) {
        case 'social_very_positive': valence += 0.15; break;
        case 'social_positive':      valence += 0.08; break;
        case 'social_cooperation':   valence += 0.12; break;
        case 'social_neutral':       valence += 0.01; break;
        case 'social_observe':       valence += 0.02; break;
        case 'social_negative':      valence -= 0.1;  break;
        case 'social_conflict':      valence -= 0.12; break;
        case 'social_departure':     valence -= 0.03; break;
        case 'social_arrival':       valence += 0.05; break;
        case 'social_mood':          valence += 0.01; break;
        default:                     valence += 0.01; break;
      }
    }
    return Math.max(-1, Math.min(1, valence));
  }
}

// ═══════════════════════════════════════════
// TRANSFER LEARNING METRICS
// ═══════════════════════════════════════════

interface TransferMetrics {
  phase1_final_accuracy: number;
  phase1_final_traces: number;
  phase1_final_dims: number;
  phase2_initial_traces: number;
  phase2_final_accuracy: number;
  phase2_final_traces: number;
  phase2_trace_growth: number;          // traces gained in phase 2
  phase2_learning_rate: number;         // accuracy gain per tick in phase 2
  /** Ratio of phase2 learning rate vs phase1 learning rate (>1 = transfer helped) */
  transfer_coefficient: number;
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn'] });
  const kernelLoop   = app.get(KernelLoopService);
  const traceGraph   = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect       = app.get(AffectiveStateService);
  const conceptSpace = app.get(ConceptSpaceService);
  const modalities   = app.get(ModalityDiscoveryService);
  const energy       = app.get(EnergyService);
  const devMetrics   = app.get(DevelopmentalMetricsService);
  const llm          = app.get(LlmClientService);
  const db           = app.get(SurrealService);

  llm.pause();

  // ── Phase 1: Physical World ──

  const physWorld = new EvolvingWorld();
  const physBridge = new PhysicalWorldBridge(physWorld, devMetrics, affect, conceptSpace);
  kernelLoop.setWorld(physBridge);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MULTI-WORLD TRAINING: ${TOTAL_TICKS} ticks total`);
  console.log(`  Phase 1: EvolvingWorld (physical) — ${PHASE1_TICKS} ticks (${Math.round(PHASE1_RATIO * 100)}%)`);
  console.log(`  Phase 2: SocialWorld (social)     — ${PHASE2_TICKS} ticks (${Math.round((1 - PHASE1_RATIO) * 100)}%)`);
  console.log(`${'═'.repeat(60)}\n`);

  let totalMs = 0;
  let lastReportTraces = 0;
  let phase1FinalAccuracy = 0;
  let phase1FirstAccuracy = 0;
  let phase1AccuracyRecorded = false;

  // ── PHASE 1 LOOP ──
  console.log(`  ── PHASE 1: PHYSICAL WORLD ──\n`);

  for (let tick = 0; tick < PHASE1_TICKS; tick++) {
    const start = Date.now();

    const events = physWorld.tick();
    for (const event of events) { kernelLoop.pushEvent(event.content); }
    await kernelLoop.pump();

    if (energy.needsSleep()) { devMetrics.recordSleep(tick); energy.sleep(); }
    totalMs += Date.now() - start;

    // Developmental metrics
    if ((tick + 1) % DEV_METRICS_INTERVAL === 0) {
      const accuracy = await computeAccuracy(physWorld, db);
      devMetrics.recordAccuracy(tick, accuracy);

      if (!phase1AccuracyRecorded && accuracy > 0) {
        phase1FirstAccuracy = accuracy;
        phase1AccuracyRecorded = true;
      }
      phase1FinalAccuracy = accuracy;

      await conceptSpace.materializeClusters(tick);
      const snap = await devMetrics.snapshot(tick);
      const progressed = physWorld.checkProgression(snap);
      if (progressed) {
        console.log(`  [Phase1] World Level UP -> ${physWorld.getLevel()} at tick ${tick + 1}`);
      }
    }

    // Report
    if ((tick + 1) % REPORT_INTERVAL === 0) {
      const traces = await traceGraph.getTraceCount();
      printReport('Phase1', tick + 1, TOTAL_TICKS, traces, lastReportTraces, commitKernel, conceptSpace, modalities, affect, energy, totalMs);
      lastReportTraces = traces;
    }
  }

  const phase1Traces = await traceGraph.getTraceCount();
  const phase1Dims = conceptSpace.getDimensionCount();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  PHASE 1 COMPLETE: traces=${phase1Traces} dims=${phase1Dims} accuracy=${phase1FinalAccuracy.toFixed(3)}`);
  console.log(`  Switching to SocialWorld (kernel state preserved)`);
  console.log(`${'─'.repeat(60)}\n`);

  // ── Phase 2: Social World (SAME kernel) ──

  const socialWorld = new SocialWorld();
  const socialBridge = new SocialWorldBridge(socialWorld, devMetrics, affect);
  kernelLoop.setWorld(socialBridge);

  console.log(`  ── PHASE 2: SOCIAL WORLD ──\n`);

  let phase2FirstAccuracy = 0;
  let phase2AccuracyRecorded = false;
  let phase2FinalAccuracy = 0;

  for (let tick = PHASE1_TICKS; tick < TOTAL_TICKS; tick++) {
    const start = Date.now();

    const events = socialWorld.tick();
    for (const event of events) { kernelLoop.pushEvent(event.content); }
    await kernelLoop.pump();

    if (energy.needsSleep()) { devMetrics.recordSleep(tick); energy.sleep(); }
    totalMs += Date.now() - start;

    // Developmental metrics
    if ((tick + 1) % DEV_METRICS_INTERVAL === 0) {
      const accuracy = await computeSocialAccuracy(socialWorld, db);
      devMetrics.recordAccuracy(tick, accuracy);

      if (!phase2AccuracyRecorded && accuracy > 0) {
        phase2FirstAccuracy = accuracy;
        phase2AccuracyRecorded = true;
      }
      phase2FinalAccuracy = accuracy;

      await conceptSpace.materializeClusters(tick);
      const snap = await devMetrics.snapshot(tick);
      const progressed = socialWorld.checkProgression(snap);
      if (progressed) {
        console.log(`  [Phase2] Social Level UP -> ${socialWorld.getLevel()} at tick ${tick + 1}`);
      }
    }

    // Report
    if ((tick + 1) % REPORT_INTERVAL === 0 || tick === TOTAL_TICKS - 1) {
      const traces = await traceGraph.getTraceCount();
      printReport('Phase2', tick + 1, TOTAL_TICKS, traces, lastReportTraces, commitKernel, conceptSpace, modalities, affect, energy, totalMs);
      lastReportTraces = traces;
    }
  }

  // ── TRANSFER LEARNING REPORT ──

  const finalTraces = await traceGraph.getTraceCount();
  const finalSnap = await devMetrics.snapshot(TOTAL_TICKS);

  const phase1LearningRate = PHASE1_TICKS > 0
    ? (phase1FinalAccuracy - phase1FirstAccuracy) / PHASE1_TICKS
    : 0;
  const phase2LearningRate = PHASE2_TICKS > 0
    ? (phase2FinalAccuracy - phase2FirstAccuracy) / PHASE2_TICKS
    : 0;

  const transfer: TransferMetrics = {
    phase1_final_accuracy: phase1FinalAccuracy,
    phase1_final_traces: phase1Traces,
    phase1_final_dims: phase1Dims,
    phase2_initial_traces: phase1Traces,
    phase2_final_accuracy: phase2FinalAccuracy,
    phase2_final_traces: finalTraces,
    phase2_trace_growth: finalTraces - phase1Traces,
    phase2_learning_rate: phase2LearningRate,
    transfer_coefficient: phase1LearningRate > 0 ? phase2LearningRate / phase1LearningRate : 0,
  };

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MULTI-WORLD TRAINING COMPLETE`);
  console.log(`${'═'.repeat(60)}`);

  console.log(`\n  Total ticks: ${TOTAL_TICKS} | Time: ${Math.round(totalMs / 1000)}s`);
  console.log(`  Final traces: ${finalTraces} | Commits: ${commitKernel.getCommitCount()}`);
  console.log(`  Dimensions: ${conceptSpace.getDimensionCount()} | Modalities: ${modalities.getModalityCount()}`);

  console.log(`\n  ── TRANSFER LEARNING METRICS ──`);
  console.log(`  Phase 1 (physical): accuracy=${transfer.phase1_final_accuracy.toFixed(3)} traces=${transfer.phase1_final_traces} dims=${transfer.phase1_final_dims}`);
  console.log(`  Phase 2 (social):   accuracy=${transfer.phase2_final_accuracy.toFixed(3)} traces=${transfer.phase2_final_traces} growth=+${transfer.phase2_trace_growth}`);
  console.log(`  Phase 1 learning rate: ${(transfer.phase1_final_accuracy - phase1FirstAccuracy).toFixed(4)} accuracy / ${PHASE1_TICKS} ticks`);
  console.log(`  Phase 2 learning rate: ${(transfer.phase2_final_accuracy - phase2FirstAccuracy).toFixed(4)} accuracy / ${PHASE2_TICKS} ticks`);
  console.log(`  Transfer coefficient:  ${transfer.transfer_coefficient.toFixed(3)} (>1 = transfer helped, <1 = transfer hindered)`);

  console.log(`\n  ── DEVELOPMENTAL PROFILE ──`);
  console.log(devMetrics.formatSnapshot(finalSnap));

  // World progression histories
  const physHist = physWorld.getLevelHistory();
  if (physHist.length > 1) {
    console.log(`\n  ── PHYSICAL WORLD PROGRESSION ──`);
    for (const lh of physHist) { console.log(`  Level ${lh.level} at tick ${lh.tick}`); }
  }
  const socialHist = socialWorld.getLevelHistory();
  if (socialHist.length > 1) {
    console.log(`\n  ── SOCIAL WORLD PROGRESSION ──`);
    for (const lh of socialHist) { console.log(`  Level ${lh.level} at tick ${lh.tick}`); }
  }

  await app.close();
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

async function computeAccuracy(
  world: EvolvingWorld,
  db: SurrealService,
): Promise<number> {
  const groundTruth = world.getGroundTruth();
  let correct = 0; let total = 0;
  for (const obj of groundTruth) {
    const traces_q = await db.query<Record<string, unknown>>(
      `SELECT content FROM trace WHERE content CONTAINS $name AND archived = false LIMIT 3`,
      { name: obj.name },
    );
    if (traces_q.isOk() && traces_q.value.length > 0) {
      total++;
      const texts = traces_q.value.map(t => (t.content as string || '').toLowerCase());
      if (Object.values(obj.properties).some(p => texts.some(t => t.includes(p.toLowerCase())))) correct++;
    }
  }
  return total > 0 ? correct / total : 0;
}

async function computeSocialAccuracy(
  world: SocialWorld,
  db: SurrealService,
): Promise<number> {
  const groundTruth = world.getGroundTruth();
  let correct = 0; let total = 0;
  for (const ch of groundTruth) {
    const traces_q = await db.query<Record<string, unknown>>(
      `SELECT content FROM trace WHERE content CONTAINS $name AND archived = false LIMIT 3`,
      { name: ch.name },
    );
    if (traces_q.isOk() && traces_q.value.length > 0) {
      total++;
      const texts = traces_q.value.map(t => (t.content as string || '').toLowerCase());
      if (Object.values(ch.properties).some(p => texts.some(t => t.includes(p.toLowerCase())))) correct++;
    }
  }
  return total > 0 ? correct / total : 0;
}

function printReport(
  phase: string, tick: number, total: number,
  traces: number, lastTraces: number,
  commitKernel: CommitKernelService,
  conceptSpace: ConceptSpaceService,
  modalities: ModalityDiscoveryService,
  affect: AffectiveStateService,
  energy: EnergyService,
  totalMs: number,
): void {
  const pct = Math.round((tick / total) * 100);
  const commits = commitKernel.getCommitCount();
  const dims = conceptSpace.getDimensionCount();
  const mods = modalities.getModalityCount();
  const affectState = affect.getSnapshot();
  const energyState = energy.getState();

  console.log(`  [${phase}] ${pct}% (tick ${tick}/${total}) traces=${traces}(+${traces - lastTraces}) commits=${commits} dims=${dims} mods=${mods} affect=${affectState.mode} energy=${energyState.current}/${energyState.max} ${Math.round(totalMs / Math.max(1, tick))}ms/tick`);
}

main().catch(e => console.error('FATAL:', e.message || e));
