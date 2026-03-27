/**
 * VALIDATION RUNNER: 200-tick learning dynamics test.
 *
 * Measures without LLM (ANTHROPIC_API_KEY=""):
 * - World model accuracy vs ground truth
 * - Prediction error trend (should decrease)
 * - Modality separation quality
 * - Dimension growth over time
 * - Energy economy (sleep count, spend/recovery)
 * - Trace growth
 *
 * Output: JSON ValidationReport to stdout.
 * Run: ANTHROPIC_API_KEY="" npx ts-node src/training/validate-learning.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CognitivePipelineService } from '../cognitive/cognitive-pipeline.service';
import { KernelLoopService } from '../kernel/kernel-loop.service';
import { TraceGraphService } from '../kernel/memory/trace-graph.service';
import { CommitKernelService } from '../kernel/commit/commit-kernel.service';
import { AffectiveStateService } from '../kernel/affect/affective-state.service';
import { ConceptSpaceService } from '../kernel/space/concept-space.service';
import { ModalityDiscoveryService } from '../kernel/sensory/modality-discovery.service';
import { EnergyService } from '../kernel/energy.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { SurrealService } from '../database/surreal.service';
import { VirtualWorld } from './virtual-world';
import { AgentAction, ActionConsequence, WorldBridge } from '../kernel/agency.types';

// ─── Types ───────────────────────────────────────────────────

interface Checkpoint {
  tick: number;
  traces: number;
  commits: number;
  dimensions: number;
  modalities: number;
  world_model_accuracy: number;
  prediction_error_avg: number;
  energy: number;
  affect_valence: number;
  sleeps: number;
}

interface ValidationReport {
  ticks: number;
  duration_ms: number;
  checkpoints: Checkpoint[];
  learning_curve: number[];
  final_accuracy: number;
}

// ─── World Bridge (same as childhood.ts) ─────────────────────

class VirtualWorldBridge implements WorldBridge {
  constructor(private readonly world: VirtualWorld) {}

  async executeAction(action: AgentAction): Promise<ActionConsequence[]> {
    const consequences = this.world.childAction(action.method || 'touch', action.target);
    return consequences.map(e => ({
      content: e.content,
      source: e.source,
      emotional_valence: this.inferValence(e.content),
    }));
  }

  getAvailableTargets(): string[] { return this.world.getObjectNames(); }
  getAvailableActions(): string[] { return this.world.getAvailableActions(); }

  private inferValence(content: string): number {
    const lower = content.toLowerCase();
    if (lower.includes('разбил') || lower.includes('расстро') || lower.includes('нельзя') || lower.includes('больно')) return -0.3;
    if (lower.includes('молодец') || lower.includes('умница') || lower.includes('хорошо') || lower.includes('красив')) return 0.3;
    if (lower.includes('покатил') || lower.includes('плавает') || lower.includes('звенит')) return 0.1;
    return 0;
  }
}

// ─── Main ────────────────────────────────────────────────────

const TOTAL_TICKS = parseInt(process.argv[2] || '200', 10);
const CHECKPOINT_INTERVAL = 50;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  const pipeline = app.get(CognitivePipelineService);
  const kernelLoop = app.get(KernelLoopService);
  const traceGraph = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect = app.get(AffectiveStateService);
  const conceptSpace = app.get(ConceptSpaceService);
  const modalities = app.get(ModalityDiscoveryService);
  const energy = app.get(EnergyService);
  const config = app.get(CognitiveConfigService);
  const db = app.get(SurrealService);

  // ── Clean runtime data for fresh validation ──
  console.error('Cleaning runtime data for fresh validation...');
  for (const table of ['trace', 'commit_log', 'affect_weights', 'concept_dimension', 'discovered_modality', 'trajectory', 'narrative_frame']) {
    await db.execute(`DELETE FROM ${table}`);
  }

  // ── Fast mode: lower escalation so fast-path signals create commits ──
  await config.set('kernel.escalation_threshold', 0.7, 'validate-learning: fast mode');

  const world = new VirtualWorld();
  const bridge = new VirtualWorldBridge(world);
  kernelLoop.setWorld(bridge);

  const checkpoints: Checkpoint[] = [];
  let sleepCount = 0;
  let prevEnergy = energy.getState().current;
  const predictionErrors: number[] = [];

  const startMs = Date.now();

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    // ── World tick ──
    const events = world.tick();

    for (const event of events) {
      await pipeline.processMessage(event.content);
    }

    // ── Track sleeps (energy jumped back up → sleep happened) ──
    const curEnergy = energy.getState().current;
    if (curEnergy > prevEnergy + 0.3) {
      sleepCount++;
    }
    prevEnergy = curEnergy;

    // ── Track prediction errors from recent commits ──
    const windowResult = await commitKernel.getAttentionWindow();
    if (windowResult.isOk()) {
      const recentCommits = windowResult.value;
      if (recentCommits.length > 0) {
        const avgPredErr = recentCommits.reduce((s, c) => s + (c.prediction_error || 0), 0) / recentCommits.length;
        predictionErrors.push(avgPredErr);
      }
    }

    // ── Checkpoint every CHECKPOINT_INTERVAL ticks ──
    if ((tick + 1) % CHECKPOINT_INTERVAL === 0 || tick === TOTAL_TICKS - 1) {
      const traces = await traceGraph.getTraceCount();
      const commits = commitKernel.getCommitCount();
      const dims = conceptSpace.getDimensionCount();
      const mods = modalities.getModalityCount();
      const affectState = affect.getSnapshot();
      const energyState = energy.getState();

      // ── World model accuracy ──
      const accuracy = await measureWorldModelAccuracy(db, world);

      // ── Rolling prediction error avg (last 20) ──
      const recentPredErrors = predictionErrors.slice(-20);
      const predErrAvg = recentPredErrors.length > 0
        ? recentPredErrors.reduce((s, e) => s + e, 0) / recentPredErrors.length
        : 0;

      checkpoints.push({
        tick: tick + 1,
        traces,
        commits,
        dimensions: dims,
        modalities: mods,
        world_model_accuracy: accuracy,
        prediction_error_avg: Math.round(predErrAvg * 1000) / 1000,
        energy: energyState.current,
        affect_valence: affectState.valence,
        sleeps: sleepCount,
      });

      // Progress to stderr (stdout reserved for JSON report)
      process.stderr.write(
        `  [${tick + 1}/${TOTAL_TICKS}] traces=${traces} commits=${commits} ` +
        `dims=${dims} mods=${mods} acc=${(accuracy * 100).toFixed(0)}% ` +
        `predErr=${predErrAvg.toFixed(3)} sleeps=${sleepCount}\n`,
      );
    }
  }

  const durationMs = Date.now() - startMs;

  // ── Build learning curve: prediction error per checkpoint ──
  const learningCurve = checkpoints.map(cp => cp.prediction_error_avg);
  const finalAccuracy = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].world_model_accuracy : 0;

  const report: ValidationReport = {
    ticks: TOTAL_TICKS,
    duration_ms: durationMs,
    checkpoints,
    learning_curve: learningCurve,
    final_accuracy: finalAccuracy,
  };

  // ── Output JSON to stdout ──
  console.log(JSON.stringify(report, null, 2));

  await app.close();
}

// ─── Helpers ─────────────────────────────────────────────────

async function measureWorldModelAccuracy(
  db: SurrealService,
  world: VirtualWorld,
): Promise<number> {
  const groundTruth = world.getGroundTruth();
  let correct = 0;
  let total = 0;

  for (const obj of groundTruth) {
    const traces_q = await db.query<Record<string, unknown>>(
      `SELECT content FROM trace WHERE content CONTAINS $name AND archived = false LIMIT 3`,
      { name: obj.name },
    );
    if (traces_q.isOk() && traces_q.value.length > 0) {
      total++;
      const texts = traces_q.value.map(t => ((t.content as string) || '').toLowerCase());
      if (Object.values(obj.properties).some(p => texts.some(t => t.includes(p.toLowerCase())))) {
        correct++;
      }
    }
  }

  return total > 0 ? correct / total : 0;
}

main().catch(e => {
  process.stderr.write(`FATAL: ${e.message || e}\n`);
  process.exit(1);
});
