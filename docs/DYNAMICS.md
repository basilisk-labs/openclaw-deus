# DEUS Dynamics — 7 Update Rules

The mathematical specification. No prose.

## Rule 1: Trace Activation

```
T.weight ← min(1, T.weight + α·(1 - T.weight)·S.confidence)
T.freshness ← 1.0

Spreading to neighbor N via edge E:
  activation(N) = E.weight · σ_spread · T.weight · exp(-d(T,N)² / (2·σ²))
  σ = σ_base / (1 + arousal) · (1 + dopamine) · energy.attentionFactor()

Inhibition to opponent O:
  O.weight ← max(0, O.weight - E.weight · σ_inhibit · T.weight)
```

## Rule 2: Hebbian Edge Learning

```
ΔE.weight = η · S.weight · T.weight           (co-activation)
          - η_decay · (T.inactive ? 1 : 0)    (anti-Hebbian)
          - η_pred · pred_error · E.weight     (error backprop)
          + η_reward · outcome · E.weight      (reinforcement)

E.weight ← clamp(E.weight + ΔE, 0.01, 1.0)
```

## Rule 3: Prediction → Trajectory

```
error = |actual_weight - predicted_weight|
if error > 0.15: backpropagate through incoming edges
trajectory.confidence += η_traj · (success ? +1 : -1)
```

## Rule 4: Affect → Multi-Drive Gradient

Five drives, not just valence:
```
desire(pos) = w₁·grad_pain_avoidance
            + w₂·grad_novelty_hunger
            + w₃·grad_uncertainty_aversion
            + w₄·grad_mastery_drive
            + w₅·grad_prediction_accuracy

Weights learned via gradient descent on reward.
```

## Rule 5: Commit → Topology Reconfiguration

```
T.velocity = T.velocity · 0.7 + delta · 0.3  (momentum)
T.position += T.velocity

Dimension birth on conflict:
  conflicting traces separated along new axis
  all other traces get 0 on new dimension
```

## Rule 6: Forgetting → Loss of Separability

```
nearest_attractor = closest cluster centroid (not origin)
drift = decay_rate / anchoring · (1 - T.weight) · energy.forgettingMultiplier()
T.position += normalize(attractor - T.position) · drift

When d(T, attractor) < merge_threshold AND T.weight·T.freshness < archive:
  archive(T)  →  individual trace gone, schema strengthened
```

## Rule 7: Time → Reconfiguration Cost

```
time = Σ_commits[novelty + |movements| + dim_births · cost] / bandwidth
dilation = reconfig_cost · w₁ + pred_error_rate · w₂ + novelty · w₃

felt_age(T) = cycle_distance · reactivation_factor · weight_factor
              · freshness_factor · reconfig_cost_since(T.birth)
```

## Core Identity

```
reality     = position + dynamics of traces in concept space
self        = stable cluster with commit authority
memory      = weight + separability + addressability
desire      = multi-drive gradient field
action      = movement along gradient (via WorldBridge)
time        = local cost of reconfiguration under bandwidth constraint
forgetting  = loss of resolution, drift toward nearest schema
energy      = finite budget constraining all operations
```
