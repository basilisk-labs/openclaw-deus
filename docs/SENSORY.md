# Sensory Layer — Self-Organized Modality Discovery

## Principle

Modalities are not predefined channels. They are discovered statistical regularities in a raw event stream. The system receives undifferentiated events and LEARNS that they come in different "textures."

## Pipeline

```
RawSensoryEvent { content, source, timestamp, byte_length }
     ↓
FingerprinterService → 11 statistical features:
  avg_token_length, unique_token_ratio, symbol_density,
  numeric_ratio, uppercase_ratio, line_count, avg_line_length,
  char_entropy, compression_ratio, time_since_last, burst_rate
     ↓
ModalityDiscoveryService → online clustering:
  distance to nearest cluster > NOVELTY_THRESHOLD → BIRTH NEW MODALITY
  else → assign to existing cluster, update centroid (EMA)
     ↓
Per-modality learned projection:
  position = tanh(fingerprint × W_modality + bias_modality)
  W learned via contrastive loss: co-occur → near, else → far
     ↓
AttentionService → softmax over modality weights:
  high attention → deep processing (full content, strong trace)
  low attention → shallow (truncated, weak trace)
  Learned via gradient descent: modalities that reduce prediction error → ↑
  Involuntary capture: surprise/novelty → snap attention
     ↓
Concept Space (modality-tagged traces)
```

## Modality Birth vs Dimension Birth

Both emerge from novelty, but at different levels:

| | Modality Birth | Dimension Birth |
|--|---------------|----------------|
| Trigger | Event too different from ALL known clusters | Two traces too close but OPPOSING |
| What's created | New sensory channel | New axis of distinction |
| Example | First code seen (high symbol_density) | "ball rolls" vs "cube doesn't" → shape axis |
| Level | Input processing | Concept formation |

## Cross-Modal Binding

Events from different modalities that co-occur within 3 cycles:
- Auto-linked via `activates` edges
- Hebbian strengthening over repetitions
- Stable correlations = discovered physical laws

Example: "mama says мячик" (linguistic modality) always co-occurs with "round object present" (object modality) → binding forms → word MEANS the object.
