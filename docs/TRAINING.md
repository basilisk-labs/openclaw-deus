# Training — Learning Through Experience

## Approach

Not lessons. Not language. EXPERIENCE. The child lives in a virtual world and learns from prediction errors, consequences, and sensorimotor contingencies. Zero LLM tokens during training. The world IS the teacher.

## Training Modes

### Childhood (single world)
```bash
npx ts-node src/training/childhood.ts 500
```
- Evolving world: 5 levels, 30+ objects, physics, weather, social characters
- CorrectiveWorldBridge: amplified consequences, adversarial curriculum, reward shaping
- Fast path: `pushEvent()` → `pump()` — 0.25s/tick, ~2 min for 500 ticks

### Multi-world (transfer learning)
```bash
npx ts-node src/training/multi-world.ts 500
```
- Phase 1 (60%): Physical world — objects, shapes, physics
- Phase 2 (40%): Social world — characters, moods, cooperation/conflict
- Same kernel, no reset — concept space carries over

## Learning Signals

| Signal | Source | Effect |
|--------|--------|--------|
| Prediction error | Sensorimotor predictor vs actual | Backprop through traces + train predictor W matrices |
| Reward/pain | World consequences (physics) | Affect accumulators → hormones → config modulation |
| Conflict | Graph-structural (close traces, divergent edges) | Dimension birth |
| Co-activation | Hebbian (fire together → wire together) | Edge strengthening + co_activation_count |
| Cluster accuracy | Reward shaping (correct categories → reward) | Affect gradient |
| Adversarial exposure | Weak cluster detection | More objects from weak categories |

## Evolving World Levels

Progression triggered by child's developmental metrics, not tick count:

| Level | Locations | Objects | Mama | Features |
|-------|-----------|---------|------|----------|
| 0 | 1 room | 5 | always | naming only |
| 1 | 2 rooms | 13 | 80% | describing |
| 2 | 3 locations | 20 | 60% | weather, cause-effect |
| 3 | 5 locations | 30+ | 30% | social characters |
| 4 | 5 locations | 30+ novel | 15% | physics exceptions |

## Training Results (300 ticks)

```
Dimensions:    39 (born from graph conflicts)
Abstractions:  19 (emerged from co-activation)
Modalities:    11 (discovered statistical clusters)
World Level:   0 → 1 → 2
Stage:         SENSORY → CATEGORICAL
Health:        66%
Accuracy:      86%
Prediction:    1.0
Energy spent:  12.67
Sleep cycles:  regular (0.96 regularity)
```

## Architecture: pump() Fast Path

```
World.tick() → events
    ↓
kernelLoop.pushEvent(event)  [non-blocking]
    ↓
kernelLoop.pump()  [one cycle]:
    ├── FAST: energy.tick() + lightCone.fastTick()
    ├── Events → rawStream.ingest() → traces
    ├── Agents → signals (no LLM, budget=0)
    ├── Hebbian co-activation edges
    ├── CommitKernel → commits → affect → config deltas
    ├── Reward from convergent/accurate commits
    ├── MEDIUM: hot trace modulation + tryAct (agency)
    ├── SLOW: active cognition + predictor training + forgetting
    ├── GLOBAL: dimension naming + cluster materialization
    └── DEEP: narrative + world model rebuild
```

## Sensorimotor Predictor

Learned dynamics in embedding space (JEPA + Active Inference):

```
Input:  position_t (N-dim) + action_embedding (8-dim)
        ↓
W_delta: tanh(W × [pos; action]) × 0.5 → position_delta
W_unc:   softplus(W × [pos; action]) → uncertainty
        ↓
Output: position_t+1 = position_t + delta
        uncertainty per dimension

Loss = prediction_error + β × uncertainty_penalty
Training: batch gradient descent on transition buffer (SLOW cadence)
```

Every action records a sensorimotor transition: `(position_t, action, position_t+1, reward)`. The predictor learns to forecast next positions, and its uncertainty drives curiosity.
