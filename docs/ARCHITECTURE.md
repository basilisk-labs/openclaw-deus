# DEUS Architecture

## Virtual Metabody

DEUS is not a pipeline. It's a pre-linguistic virtual organism with a body (world interface), a brain (concept space + kernel), and a life cycle (energy, sleep, growth). The child has no language — it learns through spatial positions, edge weights, prediction errors, and sensorimotor contingencies.

```
┌─────────────────────────────────────────────────────────┐
│              EVOLVING WORLD (the teacher)                 │
│                                                          │
│   Objects + Physics + Social characters + Weather        │
│   CorrectiveWorldBridge: amplified consequences,         │
│   adversarial curriculum, reward shaping                 │
│                                                          │
│   The world IS the teacher. No separate "adult".         │
└─────────────────────┬───────────────────────────────────┘
                      │ raw sensory events (no language)
                      │
┌─────────────────────▼───────────────────────────────────┐
│                 SENSORY LAYER                             │
│                                                          │
│   Raw events → Fingerprint (11 statistical features)     │
│   → Modality Discovery (online clustering, emergent)     │
│   → Attention Gating (learned, gradient descent)         │
│                                                          │
│   Zero text analysis. Labels from dominant features.     │
│   All thresholds in CognitiveConfig (tunable).           │
└─────────────────────┬───────────────────────────────────┘
                      │ gated signals
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   THE BRAIN                               │
│                                                          │
│   ┌─────────────────────────────────────────────┐       │
│   │         CONCEPT SPACE (the only model)       │       │
│   │                                               │       │
│   │   Dimensions born from graph conflicts        │       │
│   │   Traces: positions + velocity in N-dim space │       │
│   │   Clusters: materialized graph entities       │       │
│   │     (soft membership via belongs_to edges)    │       │
│   │     (hierarchy via contains edges)            │       │
│   │   Centroids = abstractions ([ABSTRACT] traces)│       │
│   │   Trajectories = trace→trace + cluster→cluster│       │
│   │   Gradient field = 5 desire drives            │       │
│   │   Self-traces = self model                    │       │
│   │                                               │       │
│   │   Hebbian learning on all edges               │       │
│   │   Prediction error backpropagation            │       │
│   │   Spreading activation (spatial + edge-based) │       │
│   │   Forgetting = drift toward nearest attractor │       │
│   │   MTREE vector index for O(log n) KNN         │       │
│   └─────────────────────────────────────────────┘       │
│                      ↕                                    │
│   ┌──────────────────────────────────────────────────┐  │
│   │      SENSORIMOTOR PREDICTOR (JEPA+Active Inf.)   │  │
│   │                                                    │  │
│   │   Learned dynamics: (position_t, action) →        │  │
│   │     position_t+1 (predicted) + uncertainty         │  │
│   │   Loss = variational free energy                   │  │
│   │   Trains from transition buffer (experience replay)│  │
│   │   Drives curiosity: high uncertainty → explore     │  │
│   └──────────────────────────────────────────────────┘  │
│                      ↕                                    │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│   │ 5 Agents │ │ Commit   │ │ Affect   │ │ Energy   │  │
│   │ (swarm)  │ │ Kernel   │ │ Model    │ │ Budget   │  │
│   │          │ │ (attn    │ │ (grad    │ │ (gates   │  │
│   │ sensory  │ │ bottle-  │ │ descent, │ │ all ops, │  │
│   │ predict  │ │ neck,    │ │ ~40      │ │ sleep,   │  │
│   │ affect   │ │ 6 typed  │ │ learned  │ │ fatigue) │  │
│   │ priority │ │ commits) │ │ params)  │ │          │  │
│   │ strategy │ │          │ │          │ │          │  │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                      ↕                                    │
│   ┌─────────────────────────────────────────────┐       │
│   │         ACTIVE COGNITION (idle, no LLM)      │       │
│   │                                               │       │
│   │   Episodic replay (dreaming)                  │       │
│   │   Curiosity (VOI + predictor uncertainty)     │       │
│   │   Active inference (deduction from graph)     │       │
│   │   Schema detection (abstraction emergence)    │       │
│   └─────────────────────────────────────────────┘       │
│                      ↕                                    │
│   ┌─────────────────────────────────────────────┐       │
│   │         AGENCY (kernel decides actions)       │       │
│   │                                               │       │
│   │   Gradient field (5 drives) → desire vector   │       │
│   │   Predictor → forecast outcome                │       │
│   │   Act → compare prediction vs actual          │       │
│   │   Record SMC transition → train predictor     │       │
│   │   Cluster-level trajectories → transfer learn │       │
│   │   Energy gates all actions                    │       │
│   └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Key Principle: One Space, All Functions

The concept space is not "one module among many." It IS the mind:

| Function | Implementation |
|----------|---------------|
| World model | Dimensions = discovered distinctions. Positions = learned facts. |
| Self model | Self-traces positioned near relevant knowledge |
| Memory | Trace weight + freshness + reactivation count |
| Forgetting | Drift toward nearest attractor (not deletion) |
| Prediction | Sensorimotor predictor: learned (position, action) → position' |
| Desire | Gradient field from 5 drives |
| Categories | Materialized clusters with soft membership |
| Abstractions | Cluster centroids as [ABSTRACT] hub traces |
| Physical laws | Cluster-level trajectories (push round → rolls) |
| Time | Rate of reconfiguration under bandwidth constraint |
| Uncertainty | Predictor uncertainty per position×action region |

## World-as-Teacher

The child doesn't need an adult. The world IS the teacher:

- **Natural consequences**: push ball → it rolls (prediction confirmed). Push cube → it doesn't (prediction error → backprop → learning).
- **Reward shaping**: correct cluster structure → ambient reward. Wrong clusters → no reward (not punishment).
- **Adversarial curriculum**: weak clusters get more exposure. Objects that stress current abstractions are presented more often.
- **Zero text analysis**: valence from physics, not from parsing words. The child is pre-linguistic.

## Sensorimotor Contingency

The fundamental learning unit is NOT an observation. It's an **action-outcome pair**:

```
(action, position_before, position_after, prediction_error, reward)
```

The child learns: "when I do X from state S, I end up in state S'". This IS perception — mastery of lawful regularities between actions and sensory changes (O'Regan & Noe, 2001).

The `SensorimotorPredictorService` learns these contingencies:
- Forward: `position_t + action → predicted_position_t+1 + uncertainty`
- Loss: variational free energy = prediction_error + β × KL_divergence
- Backward: analytical gradients, weight persistence
- Curiosity: high uncertainty regions → explore

## Clustered Representations

Clusters are first-class graph entities in SurrealDB:

```
cluster ──belongs_to──> trace    (soft membership, strength 0-1)
cluster ──contains──> cluster    (hierarchy)
cluster ──cluster_trajectory──> cluster   (abstract dynamics)
```

Transfer learning: new object → belongs_to cluster:round → cluster trajectory predicts "push → rolls". No explicit copy needed.

## Concurrent Modulation

Affect, energy, and attention modulate ALL operations simultaneously:

- **Affect hormones** modulate: hot trace dynamics (NE→spread, serotonin→stability, cortisol→focus)
- **Energy** gates: all operations, sleep, fatigue
- **Attention** selects: which modalities get processing
- **Predictor uncertainty** drives: curiosity, careful planning

## Light Cone: Multi-Frequency Processing

| Layer | Frequency | What | Where |
|-------|-----------|------|-------|
| FAST | every tick | trace dynamics, affect, energy | in-memory |
| MEDIUM | ×5 | spreading activation, agency (tryAct) | in-memory + DB |
| SLOW | ×50 | active cognition, predictor training, forgetting | DB |
| GLOBAL | ×200 | clustering, dimension naming, cluster materialization | DB |
| DEEP | ×1000 | narrative, world model rebuild | DB |

## Multi-World Support

Same kernel, different WorldBridge implementations:
- **EvolvingWorld**: physical objects, physics, 5 levels
- **SocialWorld**: characters, social interactions, cooperation/conflict

Transfer learning: concept space carries over between worlds. Cluster-level trajectories generalize across domains.
