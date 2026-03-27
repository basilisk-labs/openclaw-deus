# Agency — The Kernel IS the Child

## Principle

The kernel is not a processor that receives commands. It is an agent that LIVES in a world, DECIDES what to do, and ACTS.

## Sensorimotor Loop

```
perceive → model → predict → ACT → perceive → compare → update model
```

Every step is internal to the kernel. No external controller.

## WorldBridge Interface

```typescript
interface WorldBridge {
  executeAction(action: AgentAction): Promise<ActionConsequence[]>;
  getAvailableTargets(): string[];
  getAvailableActions(): string[];
}
```

The kernel CALLS the bridge. The bridge EXECUTES in the world. The world RESPONDS.

## Action Selection

Driven by internal state, not external commands:

1. **Curiosity**: unknown targets preferred (not in active traces) when in explore mode
2. **Energy gating**: can't explore if energy < cost.exploration_action
3. **Affect gating**: don't act when resting or defensive
4. **Natural pace**: 30% chance to skip (child doesn't act EVERY moment)
5. **Consequence learning**: positive valence → reward, negative → pain

## Help Requesting

The kernel INTERNALLY decides when to ask for help:
```
shouldRequestHelp() =
  pain > 0.4
  AND arousal > 0.5
  AND idleCyclesWithoutProgress > 3
  AND energy.canAffordLlm()
```

LLM call = asking the adult. NOT injected from outside.

## Training Script's Role

The training script is the WORLD, not the brain:

```
Training script:
  1. Creates VirtualWorld
  2. Implements WorldBridge
  3. Ticks world (generates ambient events)
  4. Feeds events to kernel (kernel.processMessage)
  5. Observes and reports metrics

Training script NEVER:
  - Decides what kernel should explore
  - Injects teacher/mama events
  - Controls sleep/wake cycles
  - Manages attention
```

All of these are kernel-internal decisions.
