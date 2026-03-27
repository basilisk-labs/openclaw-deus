/**
 * CHILDHOOD: Child lives in an evolving world. Kernel IS the child.
 *
 * Training script is NOT the brain — it's the WORLD + OBSERVER.
 * - Creates evolving virtual world
 * - Feeds world events to kernel
 * - Executes kernel's actions in the world
 * - Observes developmental metrics (never controls)
 * - World evolves based on child's development
 *
 * The kernel decides: what to explore, when to rest, when to ask for help.
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
import { AgentAction, ActionConsequence, WorldBridge } from '../kernel/agency.types';

const TOTAL_TICKS = parseInt(process.argv[2] || '500', 10);
const REPORT_INTERVAL = Math.max(10, Math.floor(TOTAL_TICKS / 20));
const DEV_METRICS_INTERVAL = Math.max(25, Math.floor(TOTAL_TICKS / 10));

/**
 * CorrectiveWorldBridge: World IS the teacher.
 *
 * No separate "adult". The world provides learning signals through:
 * 1. Natural consequences (push ball → it rolls) with valence
 * 2. Amplified consequences — wrong predictions get stronger error signal
 * 3. Reward shaping — correct cluster structure → ambient reward
 * 4. Adversarial curriculum — present objects that stress weak clusters
 *
 * The child learns from EXPERIENCE, not from being told.
 */
class CorrectiveWorldBridge implements WorldBridge {
  private lastPredictionWasWrong = false;
  private adversarialObjects: string[] = [];

  constructor(
    private readonly world: EvolvingWorld,
    private readonly devMetrics: DevelopmentalMetricsService,
    private readonly affect: AffectiveStateService,
    private readonly conceptSpace: ConceptSpaceService,
  ) {}

  async executeAction(action: AgentAction): Promise<ActionConsequence[]> {
    const consequences = this.world.childAction(action.method || 'touch', action.target);
    // Valence from consequence multiplicity — real valence comes from prediction error in kernel
    let valence = this.computeConsequenceValence(consequences);

    // AMPLIFIED CONSEQUENCES: if prediction was wrong, world response feels stronger
    // Like touching something hot — the pain is proportional to how wrong you were
    if (this.lastPredictionWasWrong) {
      valence *= 1.5; // amplify both positive and negative
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

  getAvailableTargets(): string[] {
    const natural = this.world.getObjectNames();
    // ADVERSARIAL CURRICULUM: inject objects that stress weak clusters
    if (this.adversarialObjects.length > 0) {
      // Prioritize adversarial objects (put them first)
      const combined = [...this.adversarialObjects.filter(o => natural.includes(o)), ...natural];
      return [...new Set(combined)];
    }
    return natural;
  }

  getAvailableActions(): string[] { return this.world.getAvailableActions(); }

  /** Signal from kernel that prediction was wrong (amplify next consequence). */
  markPredictionWrong(): void { this.lastPredictionWasWrong = true; }

  /**
   * REWARD SHAPING: called periodically from training loop.
   * Compares child's cluster structure vs ground truth categories.
   * Correct clusters → reward. Wrong clusters → no penalty (just no reward).
   */
  async shapeReward(groundTruth: Array<{ name: string; properties: Record<string, string> }>): Promise<void> {
    const clusters = await this.conceptSpace.getActiveClusters();
    if (clusters.length === 0) return;

    // Check if objects with shared properties end up in same clusters
    // Group ground truth by shape (the most distinctive property)
    const shapeGroups = new Map<string, string[]>();
    for (const obj of groundTruth) {
      const shape = obj.properties.shape || 'unknown';
      if (!shapeGroups.has(shape)) shapeGroups.set(shape, []);
      shapeGroups.get(shape)!.push(obj.name);
    }

    // For each shape group, check if child has clustered them together
    let correctClusters = 0;
    let totalChecks = 0;
    for (const [, names] of shapeGroups) {
      if (names.length < 2) continue;
      totalChecks++;

      // Get clusters for these objects
      const objectClusters = new Set<string>();
      for (const name of names) {
        const cluster = await this.conceptSpace.getTraceCluster(name);
        if (cluster) objectClusters.add(cluster);
      }
      // If all in same cluster → correct
      if (objectClusters.size === 1) correctClusters++;
    }

    if (totalChecks > 0) {
      const accuracy = correctClusters / totalChecks;
      if (accuracy > 0.3) {
        this.affect.reward(accuracy * 0.15); // subtle reward for correct clustering
      }
    }
  }

  /**
   * ADVERSARIAL CURRICULUM: find weak clusters and present challenging objects.
   * Called periodically. Sets objects for next ticks.
   */
  async planAdversarialExperiences(): Promise<void> {
    const clusters = await this.conceptSpace.getActiveClusters();
    if (clusters.length < 2) return;

    // Find lowest-confidence cluster → its members need more experience
    const weakest = clusters.reduce((a, b) => a.confidence < b.confidence ? a : b);
    // Get members of weakest cluster
    const members = await this.conceptSpace['db'].query<{ trace_id: string; content: string }>(
      `SELECT in.trace_id AS trace_id, in.content AS content FROM belongs_to WHERE out.cluster_id = $cid LIMIT 5`,
      { cid: weakest.cluster_id },
    );

    if (members.isOk() && members.value.length > 0) {
      // Extract object names from trace content
      const objects = this.world.getObjectNames();
      this.adversarialObjects = members.value
        .map(m => objects.find(o => m.content.toLowerCase().includes(o.toLowerCase())))
        .filter((o): o is string => !!o);
    }
  }

  /**
   * Valence from the world's PHYSICS — the world encodes consequences
   * as prediction errors. Valence = how much the outcome matched
   * the child's prior experience with this type of event.
   *
   * Computed from graph: if traces about this source have positive emotional_charge
   * in the child's memory, valence is positive. If negative → negative.
   * Failing that, novel events are mildly positive (curiosity), familiar are neutral.
   *
   * For now: base valence from event multiplicity (more events = more significant).
   * The REAL valence signal comes from prediction error in tryAct()
   * and from reward/pain in the affect model.
   */
  private computeConsequenceValence(consequences: Array<{ content: string; source: string }>): number {
    // Base: each consequence is a learning signal. Multiple consequences = significant event.
    let valence = 0;
    for (const c of consequences) {
      // Physics that changes object state → mild learning signal
      // The SIGN comes from prediction accuracy in the kernel, not from us
      valence += 0.02; // every interaction is slightly positive (curiosity satisfied)
    }
    return Math.max(-1, Math.min(1, valence));
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn'] });
  const kernelLoop = app.get(KernelLoopService);
  const traceGraph = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect = app.get(AffectiveStateService);
  const conceptSpace = app.get(ConceptSpaceService);
  const modalities = app.get(ModalityDiscoveryService);
  const energy = app.get(EnergyService);
  const devMetrics = app.get(DevelopmentalMetricsService);
  const llm = app.get(LlmClientService);
  const db = app.get(SurrealService);

  // TRAINING MODE: zero LLM calls. Child learns from experience, not from asking adults.
  // Set LLM_MODEL=claude-haiku-4-5-20251001 for rare LLM calls if needed.
  llm.pause();

  const world = new EvolvingWorld();
  const bridge = new CorrectiveWorldBridge(world, devMetrics, affect, conceptSpace);

  // Connect kernel to world — kernel can now ACT
  kernelLoop.setWorld(bridge);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CHILDHOOD: ${TOTAL_TICKS} world ticks (evolving world)`);
  console.log(`  Starting: ${world.getState().location} | Level ${world.getLevel()}`);
  console.log(`  Fast path: pushEvent → pump (no LLM, no blocking)`);
  console.log(`${'═'.repeat(60)}\n`);

  let totalMs = 0;
  let lastReportTraces = 0;

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    const start = Date.now();

    // === WORLD TICK: generate ambient events ===
    const events = world.tick();

    // === PUSH events to kernel queue (non-blocking) ===
    for (const event of events) {
      kernelLoop.pushEvent(event.content);
    }

    // === PUMP: kernel processes all queued events + light-cone tick ===
    await kernelLoop.pump();

    // === TRACK SLEEP ===
    if (energy.needsSleep()) {
      devMetrics.recordSleep(tick);
      energy.sleep();
    }

    totalMs += Date.now() - start;

    // === DEVELOPMENTAL METRICS (periodic) ===
    if ((tick + 1) % DEV_METRICS_INTERVAL === 0) {
      // Compute world model accuracy for metrics
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
      const accuracy = total > 0 ? correct / total : 0;
      devMetrics.recordAccuracy(tick, accuracy);

      // REWARD SHAPING: reward from accurate world model (natural consequence)
      if (accuracy > 0.5) {
        affect.reward(accuracy * 0.2);
      }

      // CLUSTER REWARD SHAPING: correct cluster structure → ambient reward
      await bridge.shapeReward(groundTruth);

      // ADVERSARIAL CURRICULUM: plan challenging experiences for next ticks
      await bridge.planAdversarialExperiences();

      // CLUSTER MATERIALIZATION: persist clusters as graph entities
      await conceptSpace.materializeClusters(tick);

      // Take snapshot
      const snap = await devMetrics.snapshot(tick);

      // Check world progression
      const progressed = world.checkProgression(snap);
      if (progressed) {
        console.log(`\n  ★★★ WORLD LEVEL UP → ${world.getLevel()} at tick ${tick + 1} ★★★`);
        console.log(`  New location: ${world.getState().location}`);
        console.log(`  Objects: ${world.getObjectNames().join(', ')}\n`);
      }
    }

    // === OBSERVE (never control) ===
    if ((tick + 1) % REPORT_INTERVAL === 0 || tick === TOTAL_TICKS - 1) {
      const pct = Math.round(((tick + 1) / TOTAL_TICKS) * 100);
      const traces = await traceGraph.getTraceCount();
      const commits = commitKernel.getCommitCount();
      const dims = conceptSpace.getDimensionCount();
      const mods = modalities.getModalityCount();
      const affectState = affect.getSnapshot();
      const energyState = energy.getState();
      const worldState = world.getState();

      console.log(`\n  ── ${pct}% (tick ${tick + 1}/${TOTAL_TICKS}) ──`);
      console.log(`  World: ${worldState.location} | Level ${worldState.level} | ${worldState.weather} | ${worldState.timeOfDay}`);
      console.log(`  Brain: traces=${traces}(+${traces - lastReportTraces}) commits=${commits} dims=${dims} modalities=${mods}`);
      console.log(`  Affect: mode=${affectState.mode} val=${affectState.valence} arousal=${affectState.arousal}`);
      console.log(`  Energy: ${energyState.current}/${energyState.max} fatigue=${energyState.fatigue_level}`);
      console.log(`  Speed: ${Math.round(totalMs / Math.max(1, tick + 1))}ms/tick`);

      // Show vocabulary + recent speech
      const vocabSize = await conceptSpace.getVocabularySize();
      const recentSpeech = kernelLoop.getVerbalProductions().filter(p => p.cycle > tick - REPORT_INTERVAL);
      if (vocabSize > 0 || recentSpeech.length > 0) {
        console.log(`  Language: vocab=${vocabSize} words=${recentSpeech.map(p => `"${p.word}"`).join(', ') || '(silent)'}`);
      }

      // Show latest developmental snapshot if available
      const latestSnap = devMetrics.getLatest();
      if (latestSnap) {
        console.log(devMetrics.formatSnapshot(latestSnap));
      }

      lastReportTraces = traces;
    }
  }

  // === FINAL ===
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  CHILDHOOD COMPLETE');
  console.log(`${'═'.repeat(60)}`);

  const finalTraces = await traceGraph.getTraceCount();
  const finalAffect = affect.getSnapshot();
  const finalEnergy = energy.getState();
  const finalSnap = await devMetrics.snapshot(TOTAL_TICKS);

  const vocabFinal = await conceptSpace.getVocabularySize();
  const allSpeech = kernelLoop.getVerbalProductions();

  console.log(`\n  Ticks: ${TOTAL_TICKS} | Time: ${Math.round(totalMs / 1000)}s`);
  console.log(`  Traces: ${finalTraces} | Commits: ${commitKernel.getCommitCount()}`);
  console.log(`  Vocabulary: ${vocabFinal} lexical traces | ${allSpeech.length} words produced`);
  console.log(`  Dimensions: ${conceptSpace.getDimensionCount()} | Modalities: ${modalities.getModalityCount()}`);
  console.log(`  Affect: mode=${finalAffect.mode} val=${finalAffect.valence}`);
  console.log(`  Energy: ${finalEnergy.current}/${finalEnergy.max} total_spent=${finalEnergy.total_energy_spent}`);

  console.log(`\n  ── DEVELOPMENTAL PROFILE ──`);
  console.log(devMetrics.formatSnapshot(finalSnap));

  // World progression history
  const levelHist = world.getLevelHistory();
  if (levelHist.length > 1) {
    console.log(`\n  ── WORLD PROGRESSION ──`);
    for (const lh of levelHist) {
      console.log(`  Level ${lh.level} at tick ${lh.tick}`);
    }
  }

  // Show developmental trajectory
  const history = devMetrics.getHistory();
  if (history.length >= 3) {
    console.log(`\n  ── DEVELOPMENTAL TRAJECTORY ──`);
    for (const snap of history) {
      console.log(`  tick=${snap.tick} stage=${snap.stage} health=${snap.overall_health} accuracy=${snap.world_model.property_accuracy} abstractions=${snap.cognitive.abstraction_count}`);
    }
  }

  for (const d of conceptSpace.getDimensions().slice(0, 5)) {
    console.log(`  axis_${d.id}: ${d.label || '(unnamed)'}`);
  }
  for (const m of modalities.getModalities().slice(0, 5)) {
    console.log(`  modality #${m.id}: ${m.label || '(unlabeled)'} (${m.member_count} events)`);
  }

  await app.close();
}

main().catch(e => console.error('FATAL:', e.message || e));
