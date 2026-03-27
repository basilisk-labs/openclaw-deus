# Light Cone — Multi-Frequency Cognitive Processing

## Principle

Consciousness is always running. But not everything at the same speed. Local operations are fast. Global operations are slow. Like physics: information propagates at finite speed.

The brain doesn't do a full neural scan every millisecond. Neurons fire locally at ms. Gamma coherence at 40Hz. Memory consolidation at hours. DEUS works the same way.

## Frequency Layers

```
FAST (~0.01ms, every tick):
  In-memory only. NEVER touches DB.
  - Trace weight micro-decay (0.999×)
  - Trace freshness micro-decay (0.9999×)
  - Hot trace eviction (weight < 0.01)
  - Affect accumulator updates
  - Energy tick

MEDIUM (every 5 fast ticks):
  In-memory spreading activation on cached traces.
  - Hot trace neighbors activate
  - Emotional charge modulation
  - Hebbian edge updates QUEUED (not written yet)

SLOW (every 50 fast ticks):
  DB sync. This is where persistence happens.
  - Flush batched trace writes to SurrealDB
  - Flush batched edge weight updates
  - Load recently changed traces INTO hot memory
  - Agency: tryAct() through WorldBridge
  - Idle reflection: dreaming, curiosity, inference, schemas
  - Trace forgetting (spatial drift toward attractors)

GLOBAL (every 200 fast ticks):
  Expensive global operations.
  - Dimension naming from exemplars
  - Substrate → traces sync (knowledge, intentions, episodes)
  - Convergence cluster detection

DEEP (every 1000 fast ticks):
  Heaviest operations. Run rarely.
  - Narrative compaction (compress old commits)
  - World model rebuild from concept space
  - Meta-learning analysis
```

## Hot Memory

In-memory cache of recently active traces (max 200):

```typescript
interface HotTrace {
  traceId: string;
  content: string;
  weight: number;         // decays in-memory between DB syncs
  freshness: number;      // decays in-memory
  emotionalCharge: number;
  activationCount: number;
}
```

- `activateHot()`: boost trace in memory, no DB
- `spreadHot()`: activate neighbors in memory, queue edge updates
- `loadFromDb()`: sync DB state into hot memory (SLOW cadence)
- `flushWrites()`: push accumulated changes to DB (SLOW cadence)

## Write Batching

Changes accumulate in memory and flush to DB on SLOW cadence:
- Trace weight changes: batched
- Edge weight updates (Hebbian): batched
- New traces: written on creation (external events)
- Commits: written immediately (immutable log)

## Performance

| Layer | Frequency | Cost | DB Round-trips |
|-------|-----------|------|---------------|
| FAST | every tick | ~0.01ms | 0 |
| MEDIUM | every 5 ticks | ~0.1ms | 0 |
| SLOW | every 50 ticks | ~50-200ms | 5-10 |
| GLOBAL | every 200 ticks | ~100-500ms | 10-20 |
| DEEP | every 1000 ticks | ~500-2000ms | 20+ |

At 1000 ticks: only 20 SLOW syncs, 5 GLOBAL scans, 1 DEEP operation.
Most ticks are sub-millisecond.

## External Events

External events (messages, world consequences) BYPASS the cadence system:
- They interrupt immediately regardless of frequency
- Full processing: raw stream → agents → commits → affect
- After processing: return to cadence-based idle
