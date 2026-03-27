# DEUS Development Strategy & Roadmap

## Current State (v12.0)

```
186 files │ ~21,000 lines │ 193 tests │ 54 DB tables │ 51 commits
Architecture: Virtual metabody with agency, concept space, affect model
Status: Architecturally complete, functionally incomplete
```

## Critical Findings

### A. Learning Is Broken (CRITICAL)

Three learning mechanisms are DEFINED but NEVER INVOKED:

| Mechanism | DB Function | Service Method | Called? |
|-----------|------------|---------------|--------|
| Prediction error backprop | `fn::backprop_pred_error` | `traceGraph.backpropagatePredictionError()` | **NO** |
| Episode reinforcement | `fn::reinforce_outcome` | `traceGraph.reinforceFromOutcome()` | **NO** |
| Modality projection learning | — | `modalityDiscovery.updateProjection()` | **NO** |

**Impact**: System learns Hebbian associations (co-activation) but NOT from success/failure. Training plateaus after initial discoveries.

### B. Dead Code in Kernel (HIGH)

`ActiveCognitionService` is injected into KernelLoopService but **NEVER CALLED**. The idle reflection loop doesn't run dreaming, curiosity, inference, or schema detection during actual execution.

### C. Performance Bottleneck (HIGH)

`narrative.compact()` called EVERY cycle. At 1000 ticks with 1000+ commits: 1000ms+ per cycle. Should batch every 50 ticks.

### D. Test Coverage (HIGH)

- 192 tests for 186 files = **15% coverage by file**
- **42 services with ZERO tests** (including all kernel services)
- Zero integration tests, zero property tests
- Highest-risk untested: TraceGraph, ConceptSpace, Affect, Modality, CommitKernel

---

## Phase 1: Fix Learning (1-2 days)

**Goal**: System actually learns from experience. Training curve should improve, not plateau.

### 1.1 Wire prediction error backprop
- **Where**: `kernel-loop.service.ts` after PredictiveAgent produces error signals
- **What**: Call `traceGraph.backpropagatePredictionError(traceId, error)` for each prediction error signal
- **Effect**: Edges that led to wrong predictions weaken

### 1.2 Wire episode reinforcement
- **Where**: `kernel-loop.service.ts` in `onEpisodeOutcome()` or after `substrateBridge.syncSubstrateToTraces()`
- **What**: Call `traceGraph.reinforceFromOutcome(traceIds, reward)` when episodes complete
- **Effect**: Traces contributing to success strengthen, failure weakens

### 1.3 Wire modality projection learning
- **Where**: `raw-stream.service.ts` after cross-modal binding
- **What**: Call `modalityDiscovery.updateProjection()` with co-occurring positions
- **Effect**: Modality projections adapt over time (currently frozen at birth)

### 1.4 Wire ActiveCognition into idle loop
- **Where**: `kernel-loop.service.ts` idleReflection() — code exists but calls are missing
- **What**: Actually invoke `activeCognition.replayEpisode()`, `generateCuriosity()`, `activeInference()`, `detectSchemas()` during idle
- **Effect**: Dreaming, curiosity, deduction, abstraction work during reflection

### Verification
- Run 100-tick training → commits > 0, trace weights change, dimensions born
- Check: prediction errors decrease over ticks (learning curve)
- Check: episode outcomes affect trace weights (fn::reinforce_outcome called)

---

## Phase 2: Performance (1 day)

**Goal**: 1000 ticks in <5 minutes.

### 2.1 Batch narrative compaction
- Every 50 ticks instead of every tick
- Track `ticksSinceLastCompaction` counter

### 2.2 Cache convergence clusters
- Reuse last 3 cycles of clusters (amortize O(n²) cost)

### 2.3 Reduce DB round-trips in idle
- `getActiveTraces()` called 5+ times per idle cycle — cache for 3 cycles

### Verification
- Benchmark: 1000 ticks < 5 minutes
- No functionality regression (same learning curve)

---

## Phase 3: Core Tests (3-5 days)

**Goal**: 400+ tests covering critical paths. No kernel service at 0%.

### Tier 1: Kernel services (200 tests, 12 spec files)

| Service | Tests | Priority |
|---------|-------|----------|
| trace-graph.service | 30 | P0: learning substrate |
| concept-space.service | 25 | P0: dimension birth, clustering |
| commit-kernel.service | 20 | P0: attention bottleneck |
| affective-state.service | 20 | P0: gradient descent correctness |
| active-cognition.service | 25 | P0: dreaming, inference, schemas |
| modality-discovery.service | 20 | P1: modality birth, clustering |
| energy.service | 15 | P1: budget enforcement |
| attention.service | 15 | P1: learned attention |
| fingerprinter.service | 15 | P1: statistical features |
| raw-stream.service | 10 | P2: event ingestion |
| narrative.service | 10 | P2: compaction |
| substrate-bridge.service | 10 | P2: sync verification |

### Tier 2: Cognitive services (100 tests, 8 spec files)

| Service | Tests | Priority |
|---------|-------|----------|
| cognitive-pipeline.service | 20 | P0: main orchestrator |
| bayesian-updater.service | 15 | P1: confidence math |
| causal-graph.service | 15 | P1: VOI, prediction |
| calibration.service | 15 | P1: ECE computation |
| temporal-cognition.service | 10 | P2 |
| meta-learning.service | 10 | P2 |
| importance-scorer.service | 10 | P2 |
| llm-client.service | 20 | P1: retry, budget, concurrency |

### Tier 3: Integration tests (80 tests, 5 spec files)

| Test Suite | Tests |
|-----------|-------|
| kernel-flow.integration | 20: message → signals → traces → commits |
| learning-flow.integration | 15: episode → reinforcement → prediction improvement |
| modality.integration | 15: events → modality birth → cross-modal binding |
| energy-lifecycle.integration | 15: spend → fatigue → sleep → recovery |
| concept-space.integration | 15: conflict → dimension → clustering → abstraction |

### Tier 4: Property tests (50 tests, 1 spec file)

Key invariants:
- Trace weight ∈ [0, 1]
- Energy ∈ [0, max_energy]
- Hormone levels ∈ [0, 1]
- Dimension count monotonically increases
- Euclidean distance satisfies triangle inequality
- Affect mode probabilities sum to 1.0

### Verification
- `npm test` → 600+ tests pass
- Coverage report → >70% for kernel, >60% for cognitive

---

## Phase 4: Training Validation (2-3 days)

**Goal**: Prove the system ACTUALLY LEARNS. Quantifiable metrics.

### 4.1 World model accuracy test
- Run 500 ticks in virtual world
- After every 50 ticks: measure accuracy (concept space beliefs vs ground truth)
- **Expected**: accuracy improves from ~20% at tick 50 to >60% at tick 500

### 4.2 Modality separation test
- Feed mixed events (text, physics consequences, mama speech)
- After 200 events: check modality clusters are distinct
- **Expected**: 3+ modalities, each with >10 members, clear statistical separation

### 4.3 Abstraction emergence test
- Feed 50+ instances of round + angular objects
- Check: [PROPERTY] traces exist for shared properties
- **Expected**: "круглый" or similar property abstracted

### 4.4 Prediction improvement test
- Track prediction errors over 300 ticks
- **Expected**: rolling average decreases (learning curve)

### 4.5 Energy economy test
- Run 500 ticks, track energy spend/recovery
- **Expected**: child sleeps 3-5 times, energy usage matches exploration patterns

### 4.6 Agency test
- Track kernel actions through WorldBridge
- **Expected**: actions become less random over time (prefer known-rewarding objects)

### Verification
- All 6 tests produce quantitative reports saved to `reports/`
- Learning curves visualizable

---

## Phase 5: Architecture Hardening (ongoing)

### 5.1 Move from pipeline to concurrent modulation
- Affect modulates DURING processing, not after
- Energy constraints DURING trace creation, not just at gates
- Long-term: unified `concept_space.process(event, modulators)` call

### 5.2 Prediction → action → consequence loop closure
- Kernel predicts "if I push round thing → rolls"
- Acts through WorldBridge
- Compares prediction vs actual
- Backprops error through concept space trajectories

### 5.3 Self-model enrichment
- Create self-traces from episode outcomes: "I'm good at identifying shapes"
- Self-traces participate in agency decisions: "I should explore textures, not shapes"

### 5.4 Multi-world support
- Same kernel, different WorldBridge implementations
- Test: shapes world, social world, code world
- Verify: transfer learning between worlds

---

## Success Criteria

| Metric | Current | Phase 1 | Phase 3 | Phase 4 |
|--------|---------|---------|---------|---------|
| Learning mechanisms active | 1/4 | 4/4 | 4/4 | 4/4 |
| Test count | 193 | 200 | 600+ | 650+ |
| Test coverage (kernel) | ~5% | ~10% | >70% | >70% |
| World model accuracy | untested | measurable | measurable | >60% at tick 500 |
| 1000-tick training time | ~12 min | ~12 min | <5 min | <5 min |
| Prediction error trend | flat | decreasing | decreasing | quantified |
| Dead code | 4 methods | 0 | 0 | 0 |
| Narrative bottleneck | every tick | every 50 | every 50 | every 50 |
