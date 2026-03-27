import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../../database/surreal.service';
import { DiscoveredModality, EventFingerprint, ModalityResult, RawSensoryEvent } from './modality.types';
import { FingerprinterService } from './fingerprinter.service';
import { ConceptSpaceService } from '../space/concept-space.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';

/**
 * ModalityDiscovery: Online clustering of raw events into discovered modalities.
 *
 * NOT k-means with predetermined k.
 * Growing clusters: new modality born when event is too different from all existing.
 * Like a brain discovering that visual and audio are DIFFERENT sensory streams.
 *
 * Modality birth ≈ dimension birth in concept space:
 *   dimension: from CONFLICT (opposing content)
 *   modality: from NOVELTY (event too different from known patterns)
 */

const FINGERPRINT_DIM = 11; // dimension of fingerprint vector

@Injectable()
export class ModalityDiscoveryService {
  private readonly logger = new Logger(ModalityDiscoveryService.name);
  private modalities: DiscoveredModality[] = [];
  private modalityCounter = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly fingerprinter: FingerprinterService,
    private readonly conceptSpace: ConceptSpaceService,
    private readonly config: CognitiveConfigService,
  ) {}

  /**
   * Process a raw event: fingerprint → discover modality → project into concept space.
   */
  async process(event: RawSensoryEvent, cycle: number): Promise<ModalityResult> {
    // Step 1: Statistical fingerprint
    const fingerprint = this.fingerprinter.fingerprint(event);
    const vector = this.fingerprinter.toVector(fingerprint);

    // Step 2: Find nearest modality cluster
    let bestModality: DiscoveredModality | null = null;
    let bestDist = Infinity;

    for (const mod of this.modalities) {
      const dist = this.euclidean(vector, mod.centroid);
      if (dist < bestDist) {
        bestDist = dist;
        bestModality = mod;
      }
    }

    let isNew = false;

    if (!bestModality || bestDist > this.config.get('sensory.novelty_threshold')) {
      // TOO DIFFERENT from all known → BIRTH NEW MODALITY
      bestModality = await this.birthModality(vector, cycle);
      isNew = true;
      this.logger.log(`MODALITY BORN: #${bestModality.id} (now ${this.modalities.length} total)`);
    } else {
      // Update cluster centroid (running average)
      this.updateCentroid(bestModality, vector);
      bestModality.member_count++;
    }

    // Step 3: Project into concept space using modality-specific projection
    const conceptPosition = this.project(vector, bestModality);

    // Update self-similarity in fingerprint
    fingerprint.self_similarity = 1 - (bestDist / Math.max(0.01, this.config.get('sensory.novelty_threshold')));

    return {
      modality_id: bestModality.id,
      modality_label: bestModality.label,
      is_new_modality: isNew,
      fingerprint,
      concept_position: conceptPosition,
      novelty: bestDist,
    };
  }

  /**
   * Birth a new modality from a novel event.
   */
  private async birthModality(vector: number[], cycle: number): Promise<DiscoveredModality> {
    const conceptDims = this.conceptSpace.getDimensionCount();
    const projDim = Math.max(1, conceptDims);

    const modality: DiscoveredModality = {
      id: this.modalityCounter++,
      centroid: [...vector],
      member_count: 1,
      born_at_cycle: cycle,
      // Xavier initialization for projection
      projection_weights: Array.from({ length: FINGERPRINT_DIM * projDim }, () =>
        (Math.random() * 2 - 1) * Math.sqrt(2 / (FINGERPRINT_DIM + projDim)),
      ),
      projection_bias: new Array(projDim).fill(0),
    };

    this.modalities.push(modality);

    // Persist
    await this.db.create('discovered_modality', {
      modality_id: modality.id,
      centroid: modality.centroid,
      member_count: modality.member_count,
      born_at_cycle: modality.born_at_cycle,
      projection_weights: modality.projection_weights,
      projection_bias: modality.projection_bias,
    } as Record<string, unknown>);

    return modality;
  }

  /**
   * Project fingerprint vector into concept space using modality-specific learned weights.
   * position = tanh(fingerprint × W + bias)
   */
  private project(vector: number[], modality: DiscoveredModality): number[] {
    const outDim = modality.projection_bias.length;
    const position = new Array(outDim).fill(0);

    for (let j = 0; j < outDim; j++) {
      let sum = modality.projection_bias[j];
      for (let i = 0; i < Math.min(vector.length, FINGERPRINT_DIM); i++) {
        const wIdx = i * outDim + j;
        if (wIdx < modality.projection_weights.length) {
          sum += vector[i] * modality.projection_weights[wIdx];
        }
      }
      position[j] = Math.tanh(sum);
    }

    return position;
  }

  /**
   * Update projection weights via contrastive learning:
   * Co-occurring events from different modalities should be near in concept space.
   * Same-modality events should cluster.
   */
  updateProjection(
    modalityId: number,
    eventPosition: number[],
    coOccurringPosition: number[] | null,
    learningRate = 0.01,
  ): void {
    const mod = this.modalities.find(m => m.id === modalityId);
    if (!mod) return;

    if (coOccurringPosition) {
      // Pull projection toward co-occurring event (cross-modal binding)
      for (let j = 0; j < mod.projection_bias.length; j++) {
        const diff = (coOccurringPosition[j] ?? 0) - (eventPosition[j] ?? 0);
        mod.projection_bias[j] += learningRate * diff;
      }
    }
  }

  /**
   * Update cluster centroid with running average.
   */
  private updateCentroid(modality: DiscoveredModality, vector: number[]): void {
    const n = modality.member_count;
    for (let i = 0; i < modality.centroid.length; i++) {
      // Exponential moving average
      modality.centroid[i] = modality.centroid[i] * (n / (n + 1)) + vector[i] * (1 / (n + 1));
    }
  }

  /**
   * Auto-label modalities from their statistical signature.
   * High symbol_density → "structured" (code-like)
   * High unique_token_ratio + low symbol → "natural_language"
   * High numeric_ratio → "data/metrics"
   * etc.
   */
  /**
   * Label modalities from their statistical fingerprint — no hardcoded heuristics.
   * Labels are the dominant fingerprint feature (highest centroid component).
   * The system doesn't know what "structured" or "language" means —
   * it only knows which statistical feature dominates this cluster.
   */
  async labelModalities(): Promise<void> {
    const featureNames = [
      'avg_token_len', 'unique_ratio', 'symbol_density', 'numeric_ratio',
      'uppercase', 'line_count', 'avg_line_len', 'entropy',
      'compression', 'time_gap', 'burst_rate',
    ];

    for (const mod of this.modalities) {
      if (mod.label) continue;
      if (mod.member_count < 3) continue;

      // Label = dominant fingerprint feature (emergent, not hardcoded categories)
      const c = mod.centroid;
      let maxIdx = 0;
      let maxVal = -Infinity;
      for (let i = 0; i < Math.min(c.length, featureNames.length); i++) {
        if ((c[i] ?? 0) > maxVal) {
          maxVal = c[i] ?? 0;
          maxIdx = i;
        }
      }

      mod.label = `${featureNames[maxIdx] || 'feature'}_${mod.id}`;
      this.logger.log(`MODALITY LABELED: #${mod.id} → "${mod.label}" (${mod.member_count} events, dominant=${featureNames[maxIdx]})`);
    }
  }

  /** Load from DB on startup. */
  async load(): Promise<void> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM discovered_modality ORDER BY modality_id',
    );
    if (result.isOk()) {
      for (const d of result.value) {
        this.modalities.push({
          id: d.modality_id as number,
          centroid: (d.centroid as number[]) || [],
          member_count: (d.member_count as number) || 0,
          born_at_cycle: (d.born_at_cycle as number) || 0,
          label: d.label as string | undefined,
          projection_weights: (d.projection_weights as number[]) || [],
          projection_bias: (d.projection_bias as number[]) || [],
        });
        if ((d.modality_id as number) >= this.modalityCounter) {
          this.modalityCounter = (d.modality_id as number) + 1;
        }
      }
      if (this.modalities.length > 0) {
        this.logger.log(`Loaded ${this.modalities.length} discovered modalities`);
      }
    }
  }

  getModalities(): DiscoveredModality[] { return [...this.modalities]; }
  getModalityCount(): number { return this.modalities.length; }

  private euclidean(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}
