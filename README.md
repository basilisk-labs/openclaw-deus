# DEUS — Cognitive Runtime

A pre-linguistic virtual organism that learns about reality through experience. Not a pipeline. Not a chatbot. A mind that builds its own model of the world from traces, spatial positions, and prediction errors.

## What This Is

DEUS is a cognitive architecture where:
- **One structure holds everything** — concept space IS the world model, self model, predictions, and desires
- **Modalities are discovered**, not predefined — the system learns what "types of experience" exist
- **Abstractions emerge** from graph clustering — categories are born when traces cluster in concept space
- **Time is emergent** — not `Date.now()` but the rate of cognitive reconfiguration
- **Emotions are learned** — gradient descent on a differentiable affect model (4 hormones, 7 accumulators)
- **The kernel IS the agent** — it decides what to explore, when to rest, based on desire gradient
- **The world IS the teacher** — learning from prediction errors and consequences, no linguistic feedback
- **The world evolves WITH the child** — 5 progressive levels triggered by developmental metrics
- **Zero text analysis in learning path** — all learning is graph-structural, spatial, and numerical
- **Clusters are graph entities** — soft membership, hierarchy, cluster-level Q-learning

## Quick Start

```bash
# Start SurrealDB
npm run deus:db

# Bootstrap (migrations + seed beliefs + cognitive baseline)
npx ts-node src/cli.ts bootstrap

# Run childhood training (child lives in evolving world)
npx ts-node src/training/childhood.ts 500

# Multi-world training (physical → social, transfer learning)
npx ts-node src/training/multi-world.ts 500

# Tests
npm test   # 617+ tests, 55+ suites
```

## LLM Integration

LLM execution is transport-decoupled from cognition:

- `LlmDecisionPolicyService` stays inside DEUS and decides whether a call is needed, what kind of call it is, and what budget/model intent to assign.
- `LLMPort` is the only inference boundary for cognition services.
- `DirectLLMAdapter` talks to the provider directly.
- `OpenClawGatewayAdapter` forwards the same structured request to the OpenClaw inference gateway.
- `LlmClientService` remains the compatibility facade that applies budget, energy, cache, fallback, and observability policy.

Supported modes:

```bash
# Default: direct provider mode
LLM_MODE=direct

# Route inference through OpenClaw without moving cognition into OpenClaw
LLM_MODE=openclaw
OPENCLAW_INFERENCE_GATEWAY_URL=http://127.0.0.1:18080
OPENCLAW_INFERENCE_GATEWAY_PATH=/inference/complete
OPENCLAW_INFERENCE_GATEWAY_TOKEN=...
```

Direct-mode fallback can remain enabled in gateway mode:

```bash
LLM_FALLBACK_TO_DIRECT=true
```

Important boundary:

- DEUS decides when to call the LLM, builds context, and sets budget/model intent.
- OpenClaw is transport and governance only.
- Provider calls must stay inside adapters; cognition services use `LLMPort`, not provider SDKs.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full diagram.

```
Evolving World (objects + physics + consequences)
  ↓ events (no language — raw sensory)
Sensory Layer (fingerprint → modality discovery → attention)
  ↓ gated signals
Brain: Concept Space + Agents + Commits + Affect + Energy
  │
  ├── Traces: spatial positions, edge weights, co-activation
  ├── Clusters: materialized graph entities (soft membership, hierarchy)
  ├── Trajectories: cluster→cluster (abstract Q-learning)
  ├── Affect: 7 accumulators → 4 hormones → config modulation
  └── Dimensions: born from graph conflicts, not predefined
  │
  ↓ desire gradient (5 drives)
Agency (gradient field → spatial target selection → predict → act → compare → backprop)
  ↓ consequences
World (amplified consequences + adversarial curriculum + reward shaping)
```

Training loop: `pushEvent()` → `pump()` — 0.25s/tick, zero LLM tokens.

## Training Results (300 ticks, 1 minute)

```
Dimensions:    39 (born from graph conflicts)
Abstractions:  19 (emerged from co-activation patterns)
Modalities:    11 (discovered from statistical fingerprints)
World Level:   0 → 1 → 2 (3 locations, weather, surprises)
Stage:         SENSORY → CATEGORICAL
Health:        66%
Accuracy:      86%
Prediction:    1.0
```

## Documentation

| Document | What |
|----------|------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Virtual metabody diagram, key principles |
| [DYNAMICS.md](docs/DYNAMICS.md) | 7 update rules as equations |
| [CONCEPT-SPACE.md](docs/CONCEPT-SPACE.md) | Adaptive dimensions, spatial forgetting, verification |
| [SENSORY.md](docs/SENSORY.md) | Self-organized modality discovery, attention |
| [AFFECT.md](docs/AFFECT.md) | Gradient descent hormones, 5 drives, energy coupling |
| [AGENCY.md](docs/AGENCY.md) | WorldBridge, action selection, help requesting |
| [TRAINING.md](docs/TRAINING.md) | Virtual world, energy budget, running training |
| [LIGHT-CONE.md](docs/LIGHT-CONE.md) | Multi-frequency processing, hot memory, write batching |
| [DEVELOPMENTAL-METRICS.md](docs/DEVELOPMENTAL-METRICS.md) | 5 metric domains, developmental stages, evolving world |

## Numbers

```
200+ files, ~25,000 lines TypeScript
55+ test suites, 617+ tests
22 NestJS modules
18 SurrealDB migrations, 4 stored procedures, MTREE vector index
57+ database tables (including cluster, belongs_to, cluster_trajectory)
5 cognitive agents, 4 hormones, 7 accumulators, 5 desire drives
6 commit types, 6 child actions, 2 world types
5 developmental metric domains, 5 world levels
~80 tunable config params + ~40 gradient-learned affect params
Zero text analysis in learning path
```

## Stack

- **NestJS** — dependency injection, modules, lifecycle
- **SurrealDB 3.0** — graph DB, MTREE vectors, stored procedures, graph relations
- **Claude API** — LLM for rare world enrichment only (zero tokens during training)
- **neverthrow** — Result<T,E> error handling
- **TypeScript** — strict mode, zero `as any` in source

## Project Structure

```
src/
├── kernel/                    # The Brain
│   ├── kernel-loop.service    # Continuous event loop + pump() fast path
│   ├── agency.types           # WorldBridge, AgentAction
│   ├── energy.service         # Cognitive energy budget
│   ├── agents/                # 5 cognitive agents (sensory→strategic)
│   ├── memory/                # Trace graph (Hebbian, spreading activation)
│   ├── space/                 # Concept space (dimensions, clusters, positions)
│   ├── sensory/               # Modality discovery, fingerprinting, attention
│   ├── commit/                # Attention bottleneck (typed commits, energy)
│   ├── affect/                # Gradient descent affect model
│   ├── cognition/             # Active cognition (dreaming, curiosity, inference)
│   ├── narrative/             # Commit compaction, temporal storytelling
│   ├── developmental-metrics  # 5-domain developmental observation
│   └── substrate-bridge       # Reptilian brain ↔ traces ↔ world model
├── cognitive/                 # Substrate services + config (~80 tunable params)
├── training/                  # Evolving world + social world + multi-world runner
├── database/                  # SurrealDB service + 18 migrations
├── beliefs/                   # Belief system
├── knowledge/                 # Knowledge extraction + gaps
├── intention/                 # BDI intentions
├── deliberation/              # LLM deliberation
├── experience/                # Episodes, procedures, self-assessment
├── memory/                    # Activity log, aggregation
├── metrics/                   # Cognitive metrics, diagnosis, benchmarks
├── nightly/                   # 18-stage nightly pipeline
└── ...                        # world-model, policy, llm, embeddings, events
```

## License

Proprietary — Basilisk Labs
