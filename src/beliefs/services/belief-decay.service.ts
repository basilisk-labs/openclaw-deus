import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { Belief, DecayProfile, DecayResult, DecayStats } from '../../common/types/belief.types';
import { CLASS_DEFAULTS, DECAY_RATES, MS_PER_DAY } from '../../common/constants/belief.constants';
import { SurrealService } from '../../database/surreal.service';
import { EventsService } from '../../events/events.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { BeliefsService } from '../beliefs.service';

// SurrealQL native decay — evidence-weighted rates (Bayesian: more evidence = slower decay)
// effective_rate = base_rate / log2(1 + max(1, evidence_count))
const DECAY_QUERY = `
  UPDATE belief SET
    confidence = math::max(
      confidence_floor,
      confidence * math::exp(
        -(
          IF decay_mode = 'slow' THEN $rate_slow
          ELSE IF decay_mode = 'normal' THEN $rate_normal
          ELSE IF decay_mode = 'fast' THEN $rate_fast
          ELSE 0
          END
        ) / math::log2(1 + math::max(1, array::len(evidence_set)))
        * ((time::millis(time::now()) - time::millis(timestamp_updated)) / 86400000)
      )
    ),
    timestamp_updated = time::now()
  WHERE decay_mode != 'no_decay'
    AND status = 'active'
    AND confidence > confidence_floor
`;

const REPAIR_EXEMPT_QUERY = `
  UPDATE belief SET
    confidence = confidence_floor,
    status = 'active',
    timestamp_updated = time::now()
  WHERE (belief_class = 'axiom' OR string::starts_with(belief_id, 'I'))
    AND (confidence != confidence_floor OR status != 'active')
`;

const FLAG_FOR_REVIEW_QUERY = `
  UPDATE belief SET status = 'review_needed'
  WHERE status = 'active'
    AND decay_mode != 'no_decay'
    AND confidence < review_threshold
`;

@Injectable()
export class BeliefDecayService {
  private readonly logger = new Logger(BeliefDecayService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly config: CognitiveConfigService,
  ) {}

  async runDecayCycle(now?: Date): Promise<Result<DecayStats, DomainError>> {
    const currentTime = now || new Date();

    // Step 1: Repair exempt beliefs (axioms) — SurrealQL native
    const repairResult = await this.db.batchUpdate(REPAIR_EXEMPT_QUERY);
    const restoredExempt = repairResult.isOk() ? repairResult.value : 0;

    // Step 2: Apply exponential decay — evidence-weighted rates (more evidence = slower decay)
    // Base rates from config, but modulated by evidence count via Bayesian formula:
    // effective_rate = base_rate / log2(1 + evidence_count)
    // This is approximated in SurrealQL by using array::len(evidence_set)
    const decayResult = await this.db.batchUpdate(DECAY_QUERY, {
      rate_slow: this.config.get('decay.rate_slow'),
      rate_normal: this.config.get('decay.rate_normal'),
      rate_fast: this.config.get('decay.rate_fast'),
    });
    const decayed = decayResult.isOk() ? decayResult.value : 0;

    // Step 3: Flag beliefs below review threshold
    const flagResult = await this.db.batchUpdate(FLAG_FOR_REVIEW_QUERY);
    const flagged = flagResult.isOk() ? flagResult.value : 0;

    // Stats
    const allBeliefs = await this.beliefs.findAll();
    const beliefs = allBeliefs.isOk() ? allBeliefs.value : [];
    const avgConfidence = beliefs.length > 0
      ? beliefs.reduce((sum, b) => sum + b.confidence, 0) / beliefs.length : 0;

    const stats: DecayStats = {
      timestamp: currentTime.toISOString(),
      total_beliefs: beliefs.length,
      decayed, flagged, deprecated: 0, archived: 0,
      restored_exempt: restoredExempt,
      avg_confidence: Math.round(avgConfidence * 1000) / 1000,
    };

    if (decayed > 0 || flagged > 0) {
      await this.events.emit('belief.decayed', stats);
    }

    this.logger.log(`Decay: ${decayed} decayed, ${flagged} flagged, ${restoredExempt} restored`);
    return ok(stats);
  }

  // Pure function kept for unit testing
  applyDecay(belief: Belief, now?: Date): Result<DecayResult, DomainError> {
    const profile = this.getDecayProfile(belief);
    if (profile.decay_rate === 0) return ok({ changed: false, belief, profile, rawDecayedConfidence: belief.confidence });

    const currentTime = now || new Date();
    const daysSinceUpdate = (currentTime.getTime() - new Date(belief.timestamp_updated).getTime()) / MS_PER_DAY;
    const rawDecayedConfidence = belief.confidence * Math.exp(-profile.decay_rate * daysSinceUpdate);
    const oldConfidence = belief.confidence;
    belief.confidence = Math.max(profile.confidence_floor, rawDecayedConfidence);
    belief.confidence = Math.round(belief.confidence * 1000) / 1000;
    const changed = oldConfidence !== belief.confidence;
    if (changed) {
      belief.drift_history = belief.drift_history || [];
      belief.drift_history.push({
        timestamp: currentTime.toISOString(), old_confidence: oldConfidence,
        new_confidence: belief.confidence, reason: 'time_decay',
        belief_class: profile.belief_class, decay_mode: profile.decay_mode,
        decay_rate: profile.decay_rate, confidence_floor: profile.confidence_floor,
      });
    }
    return ok({ changed, belief, profile, rawDecayedConfidence });
  }

  getDecayProfile(belief: Belief): DecayProfile {
    const defaults = CLASS_DEFAULTS[belief.belief_class] || CLASS_DEFAULTS.operational;
    const configRates: Record<string, string> = {
      slow: 'decay.rate_slow', normal: 'decay.rate_normal', fast: 'decay.rate_fast',
    };
    const rateKey = configRates[belief.decay_mode];
    const decay_rate = rateKey ? this.config.get(rateKey) : (defaults.decay_rate ?? 0);
    return {
      belief_class: belief.belief_class,
      decay_mode: belief.decay_mode || defaults.decay_mode,
      decay_rate,
      confidence_floor: belief.confidence_floor ?? defaults.confidence_floor,
      review_threshold: belief.review_threshold ?? defaults.review_threshold,
      archivable: belief.archivable ?? defaults.archivable,
    };
  }

  isDecayExempt(belief: Belief): boolean {
    return belief.belief_class === 'axiom' || belief.belief_id.startsWith('I');
  }

  repairExemptBelief(belief: Belief): boolean {
    const profile = this.getDecayProfile(belief);
    let repaired = false;
    if (belief.confidence !== profile.confidence_floor) { belief.confidence = profile.confidence_floor; repaired = true; }
    if (belief.status !== 'active') { belief.status = 'active'; repaired = true; }
    if (repaired) {
      belief.timestamp_updated = new Date().toISOString();
      belief.drift_history.push({ timestamp: new Date().toISOString(), reason: 'decay_exempt_restore',
        new_confidence: belief.confidence, belief_class: profile.belief_class, confidence_floor: profile.confidence_floor });
    }
    return repaired;
  }
}
