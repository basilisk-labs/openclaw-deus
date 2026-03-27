# Affect Model — Learned Homeostasis

## Architecture

NOT keyword matching. NOT config.adjust(). A differentiable model with gradient descent.

```
7 accumulators                    4 hormones              6 config deltas
[pred_error]                      [cortisol]              [convergence_threshold]
[tension]      × W₁ → sigmoid →  [dopamine]    × W₂ →   [spread_factor]
[pain]                            [norepinephrine]  tanh  [hebbian_lr]
[convergence]                     [serotonin]       ×0.02 [energy_threshold]
[reward]                                                   [activation_boost]
[novelty]                                                  [freshness_decay]
[stability]

                                  × W_mode → softmax → mode
                                  [explore|exploit|defensive|resting]

Loss = pred_error_acc + pain_acc - convergence_acc - reward_acc
∂Loss/∂W: analytical gradients, clipping [-1, 1]
Weights: Xavier init, persisted in SurrealDB, cumulative learning
```

## Five Drives (Desire Gradient)

Not just "toward pleasant, away from unpleasant":

1. **Pain avoidance**: repel from positions of failed episodes
2. **Novelty hunger**: attract toward high-VOI beliefs, knowledge gaps
3. **Uncertainty aversion**: attract toward tight clusters (well-understood regions)
4. **Mastery drive**: attract toward high-confidence self-traces
5. **Prediction accuracy**: repel from regions with high prediction errors

## Energy ↔ Affect Coupling

- Positive affect (reward) partially restores energy
- Negative affect (pain) drains energy faster
- Low energy → attention narrows, forgetting accelerates
- Sleep fully recovers energy + resets fatigue
