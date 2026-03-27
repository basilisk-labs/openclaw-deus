# Developmental Metrics — Observing a Mind Grow

## Principle

Not just "does it learn shapes." How does it LIVE? How does it DEVELOP? Is it curious? Is it happy? Is it becoming more autonomous?

A developmental psychologist doesn't just test knowledge. They observe the WHOLE child.

## Five Metric Domains

### 1. COGNITIVE DEVELOPMENT (how the mind grows)

| Metric | What it measures | How to compute |
|--------|-----------------|----------------|
| Dimension growth rate | Speed of forming new distinctions | dims[t] - dims[t-N] / N |
| Abstraction count | How many generalizations formed | count traces where content contains [ABSTRACT] or [PROPERTY] |
| Schema complexity | Depth of patterns (co-activation chains) | max co_activation_count across edges |
| Concept space coverage | How much of the space is populated | unique clusters / total dimensions |
| Knowledge retention | What sticks vs what fades | active traces / total traces ever created |
| Cross-modal binding strength | How well modalities integrate | avg edge weight between different-modality traces |

### 2. VITALITY (energy economy)

| Metric | What it measures | How to compute |
|--------|-----------------|----------------|
| Sleep regularity | Predictable rest cycles | std deviation of cycles_between_sleeps |
| Energy efficiency | Learning per unit energy | (accuracy_delta) / energy_spent |
| Recovery quality | Post-sleep improvement | accuracy[after_sleep] - accuracy[before_sleep] |
| Fatigue resilience | How long before degradation | ticks at >0.5 energy before needsSleep |
| Exploration budget | Energy spent on novelty vs routine | exploration_spend / total_spend |

### 3. AFFECT TRAJECTORY (emotional development)

| Metric | What it measures | How to compute |
|--------|-----------------|----------------|
| Valence trend | Becoming happier or sadder? | linear regression on valence over time |
| Cortisol baseline | Adapting or chronically stressed? | rolling avg of cortisol |
| Curiosity sustain | Maintains interest? | novelty hunger drive strength over time |
| Pain resolution rate | Solves problems faster? | avg cycles from pain onset to resolution |
| Emotional range | Experiences variety? | max(valence) - min(valence) over window |
| Mode diversity | Uses all modes? | entropy of mode distribution |

### 4. AGENCY (autonomy development)

| Metric | What it measures | How to compute |
|--------|-----------------|----------------|
| Action diversity | Tries different things? | unique actions / total actions |
| Target novelty preference | Seeks unknown? | unknown_targets_chosen / total_actions |
| Explore→exploit shift | Maturing strategy? | explore_ratio over time (should decrease) |
| Help-seeking frequency | Growing independent? | teacher_calls / total_ticks (should decrease) |
| Prediction-action coupling | Acts on predictions? | actions preceded by prediction signal / total |
| Consequence learning | Avoids repeated mistakes? | same_negative_action_count over time (should decrease) |

### 5. WORLD MODEL QUALITY (understanding)

| Metric | What it measures | How to compute |
|--------|-----------------|----------------|
| Object coverage | How many objects known? | objects_with_traces / total_world_objects |
| Property accuracy | Correct properties? | correct_properties / total_properties_known |
| Generalization rate | Applies to new objects? | novel_objects_correctly_predicted / novel_objects_seen |
| Prediction precision | Forecasts improve? | rolling avg prediction error (should decrease) |
| Causal understanding | Knows cause-effect? | trajectory count with confidence > 0.5 |
| Physics model | Understands world rules? | "round → rolls" type correlations detected |

## Developmental Stages (emergent, not hardcoded)

The system naturally progresses through stages, observable from metrics:

```
STAGE 0: SENSORY (everything is new)
  Indicators: dimension growth rate HIGH, modality births, low accuracy

STAGE 1: CATEGORICAL (forming groups)
  Indicators: abstractions emerging, accuracy rising, dimension growth slowing

STAGE 2: PREDICTIVE (anticipating outcomes)
  Indicators: trajectories forming, prediction errors decreasing

STAGE 3: AGENTIC (purposeful exploration)
  Indicators: exploration→exploitation shift, help-seeking decreasing

STAGE 4: REFLECTIVE (self-awareness)
  Indicators: self-traces increasing, mode diversity high, emotional range wide
```

## Evolving World

The world is not static. It grows WITH the child:

```
World Level 0: Single room, 5 objects, mama always present
  Triggers progression when: accuracy > 50% AND dimensions > 10

World Level 1: Two rooms, 10 objects, mama sometimes absent
  Triggers when: accuracy > 60% AND abstractions > 3

World Level 2: Three locations, 15 objects, weather changes, surprises
  Triggers when: accuracy > 70% AND explore/exploit shift observed

World Level 3: All locations, all objects, mama rare, social interactions
  Triggers when: accuracy > 80% AND help-seeking < 10%

World Level 4: Novel objects introduced, physics exceptions
  Tests generalization and adaptation
```

World progression is triggered by the CHILD'S metrics, not by tick count.
