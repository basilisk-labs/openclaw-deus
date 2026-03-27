import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { CognitiveConfigService } from './cognitive-config.service';

/**
 * TemporalCognitionService: Internal sense of time.
 *
 * NOT a date parser. This service perceives time through cognitive experience:
 * - Subjective duration: how "long ago" something feels based on event density
 * - Temporal rhythm: learned patterns of activity cycles
 * - Urgency: derived from decay rates, not deadlines
 * - Anticipation: expected duration based on past episodes for similar tasks
 *
 * Biological inspiration:
 * - Ebbinghaus: memory decay IS time perception
 * - Event density: more events = time feels longer in retrospect
 * - Novelty: novel events stretch subjective time
 * - Circadian: activity rhythms create internal "days"
 */

export interface TemporalPerception {
  /** Cognitive cycles since system boot (not wall-clock) */
  cognitive_age: number;
  /** Events processed since last "rest" (nightly run) */
  events_since_rest: number;
  /** Current tempo: events per cognitive hour */
  tempo: number;
  /** Subjective time dilation: >1 = time feels slow (high novelty), <1 = fast (routine) */
  dilation: number;
  /** Phase of cognitive rhythm: 'active' | 'consolidating' | 'resting' */
  phase: 'active' | 'consolidating' | 'resting';
}

export interface SubjectiveDuration {
  /** Wall-clock hours */
  clock_hours: number;
  /** Subjective "felt" hours, modulated by event density and novelty */
  felt_hours: number;
  /** Ratio: felt/clock. >1 = felt longer than clock, <1 = felt shorter */
  dilation_ratio: number;
  /** Events that occurred during this period */
  event_count: number;
  /** Novelty ratio: fraction of events that were "new" (low similarity to prior) */
  novelty_ratio: number;
}

export interface TemporalExpectation {
  /** Expected cognitive cycles to complete (based on similar past episodes) */
  expected_cycles: number;
  /** Confidence in the estimate */
  confidence: number;
  /** Basis: what similar episodes informed this estimate */
  basis: string;
  /** Urgency: 0-1, derived from how many cycles have passed vs expected */
  urgency: number;
}

const TEMPORAL_STATE_QUERY = `
  LET $total_episodes = (SELECT count() AS c FROM episode GROUP ALL)[0].c OR 0;
  LET $total_nightly = (SELECT count() AS c FROM nightly_run GROUP ALL)[0].c OR 0;
  LET $events_today = (SELECT count() AS c FROM activity_log WHERE day_key = $today GROUP ALL)[0].c OR 0;
  LET $events_yesterday = (SELECT count() AS c FROM activity_log WHERE day_key = $yesterday GROUP ALL)[0].c OR 0;
  LET $last_nightly = (SELECT started_at FROM nightly_run ORDER BY started_at DESC LIMIT 1)[0].started_at;
  LET $events_since_nightly = (SELECT count() AS c FROM activity_log WHERE timestamp > $last_nightly GROUP ALL)[0].c OR 0;
  LET $recent_events = (SELECT timestamp, type, description FROM activity_log ORDER BY timestamp DESC LIMIT 50);
  RETURN {
    total_episodes: $total_episodes,
    total_nightly: $total_nightly,
    events_today: $events_today,
    events_yesterday: $events_yesterday,
    last_nightly: $last_nightly,
    events_since_nightly: $events_since_nightly,
    recent_events: $recent_events
  }
`;

@Injectable()
export class TemporalCognitionService {
  private readonly logger = new Logger(TemporalCognitionService.name);

  // Internal state: running average of event rate and novelty
  private eventTimestamps: number[] = [];
  private recentDescriptions: string[] = [];
  private cycleCount = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  /**
   * Tick: called on every pipeline message to update internal temporal state.
   */
  tick(message: string): void {
    const now = Date.now();
    this.eventTimestamps.push(now);
    this.cycleCount++;

    // Keep rolling window of last 100 events
    if (this.eventTimestamps.length > 100) this.eventTimestamps.shift();

    // Track novelty via description overlap
    this.recentDescriptions.push(message.slice(0, 200));
    if (this.recentDescriptions.length > 50) this.recentDescriptions.shift();
  }

  /**
   * Current temporal perception: how the system "feels" about time right now.
   */
  async perceive(): Promise<Result<TemporalPerception, DomainError>> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    const raw = await this.db.queryRaw<any>(TEMPORAL_STATE_QUERY, { today, yesterday });
    const d = raw.isOk()
      ? (Array.isArray(raw.value) ? raw.value[raw.value.length - 1] : raw.value)
      : {} as Record<string, unknown>;

    const totalEpisodes = d?.total_episodes || 0;
    const totalNightly = d?.total_nightly || 0;
    const eventsToday = d?.events_today || 0;
    const eventsYesterday = d?.events_yesterday || 0;
    const eventsSinceNightly = d?.events_since_nightly || 0;

    // Cognitive age = total episodes (each episode is one "cognitive cycle")
    const cognitiveAge = totalEpisodes + this.cycleCount;

    // Tempo: events per hour (rolling average from in-memory timestamps)
    const tempo = this.computeTempo();

    // Dilation: novelty stretches time, routine compresses it
    const dilation = this.computeDilation();

    // Phase: based on events since last nightly run
    const phase = eventsSinceNightly > 20 ? 'consolidating'
      : eventsSinceNightly === 0 ? 'resting'
      : 'active';

    return ok({
      cognitive_age: cognitiveAge,
      events_since_rest: eventsSinceNightly,
      tempo: Math.round(tempo * 100) / 100,
      dilation: Math.round(dilation * 100) / 100,
      phase,
    });
  }

  /**
   * Subjective duration: how long ago something "feels" based on event density.
   * 10 clock hours with 100 events feels MUCH longer than 10 hours with 2 events.
   */
  async subjectiveDurationSince(isoTimestamp: string): Promise<Result<SubjectiveDuration, DomainError>> {
    const since = new Date(isoTimestamp);
    const now = new Date();
    const clockHours = (now.getTime() - since.getTime()) / 3600000;

    // Count events in the period
    const eventResult = await this.db.query<{ c: number }>(
      `SELECT count() AS c FROM activity_log WHERE timestamp > $since GROUP ALL`,
      { since: since },
    );
    const eventCount = eventResult.isOk() && eventResult.value.length > 0 ? eventResult.value[0].c : 0;

    // Novelty: how many events were "new" (check knowledge created in period)
    const knowledgeResult = await this.db.query<{ c: number }>(
      `SELECT count() AS c FROM knowledge WHERE created_at > $since GROUP ALL`,
      { since: since },
    );
    const newKnowledge = knowledgeResult.isOk() && knowledgeResult.value.length > 0 ? knowledgeResult.value[0].c : 0;
    const noveltyRatio = eventCount > 0 ? Math.min(1, newKnowledge / eventCount) : 0;

    // Subjective time = clock time * event density factor * novelty factor
    // Dense + novel = feels longer. Sparse + routine = feels shorter.
    const baselineEventsPerHour = 5; // "normal" rate
    const densityFactor = eventCount > 0 ? Math.log2(1 + eventCount / Math.max(1, clockHours)) / Math.log2(1 + baselineEventsPerHour) : 0.5;
    const noveltyFactor = 1 + noveltyRatio * 0.5; // novelty stretches time by up to 50%
    const feltHours = clockHours * densityFactor * noveltyFactor;

    return ok({
      clock_hours: Math.round(clockHours * 10) / 10,
      felt_hours: Math.round(feltHours * 10) / 10,
      dilation_ratio: clockHours > 0 ? Math.round((feltHours / clockHours) * 100) / 100 : 1,
      event_count: eventCount,
      novelty_ratio: Math.round(noveltyRatio * 100) / 100,
    });
  }

  /**
   * Temporal expectation: how long should this type of task take?
   * Based on past episodes for similar intentions, NOT hardcoded estimates.
   */
  async anticipate(intentionDescription: string): Promise<Result<TemporalExpectation, DomainError>> {
    // Find episodes for similar intentions
    const episodeResult = await this.db.query<{
      duration_ms: number;
      outcome: string;
      intention_id: string;
    }>(
      `SELECT duration_ms, outcome, intention_id, created_at
       FROM episode
       WHERE duration_ms > 0
       ORDER BY created_at DESC
       LIMIT 20`,
    );

    if (episodeResult.isErr() || episodeResult.value.length === 0) {
      return ok({
        expected_cycles: 3, // default: 3 cognitive cycles
        confidence: 0.2,
        basis: 'no prior episodes — using default estimate',
        urgency: 0.3,
      });
    }

    const episodes = episodeResult.value;
    const avgDurationMs = episodes.reduce((s, e) => s + (e.duration_ms || 0), 0) / episodes.length;
    const successEpisodes = episodes.filter(e => e.outcome === 'success' || e.outcome === 'partial_success');
    const failEpisodes = episodes.filter(e => e.outcome === 'failure');

    // Expected cycles = average number of episodes per completed intention
    const intentionIds = [...new Set(episodes.map(e => e.intention_id).filter(Boolean))];
    const expectedCycles = intentionIds.length > 0 ? episodes.length / intentionIds.length : 3;

    // Urgency: based on how many cycles THIS intention has already consumed
    const currentEpisodes = await this.db.query<{ c: number }>(
      `SELECT count() AS c FROM episode WHERE intention_id IN (
        SELECT intention_id FROM intention WHERE description CONTAINS $desc LIMIT 1
      ) GROUP ALL`,
      { desc: intentionDescription.slice(0, 50) },
    );
    const currentCycles = currentEpisodes.isOk() && currentEpisodes.value.length > 0 ? currentEpisodes.value[0].c : 0;

    // Urgency increases as cycles consumed approaches expected
    const urgency = expectedCycles > 0 ? Math.min(1, currentCycles / expectedCycles) : 0.3;

    return ok({
      expected_cycles: Math.round(expectedCycles * 10) / 10,
      confidence: Math.min(0.9, 0.2 + episodes.length * 0.035),
      basis: `${episodes.length} episodes across ${intentionIds.length} intentions (avg ${Math.round(avgDurationMs / 1000)}s, ${successEpisodes.length} success, ${failEpisodes.length} fail)`,
      urgency: Math.round(urgency * 100) / 100,
    });
  }

  /**
   * Is it "time" for something? Not clock-based — based on cognitive rhythm.
   * Returns true if enough cognitive cycles have passed since last occurrence.
   */
  async isTimeFor(action: string, minCyclesSince: number): Promise<boolean> {
    // Check when this action last occurred (by searching activity log)
    const lastResult = await this.db.query<{ timestamp: string }>(
      `SELECT timestamp FROM activity_log WHERE description CONTAINS $action ORDER BY timestamp DESC LIMIT 1`,
      { action },
    );

    if (lastResult.isErr() || lastResult.value.length === 0) return true; // never done = overdue

    const lastTime = new Date(lastResult.value[0].timestamp).getTime();
    const eventsSince = this.eventTimestamps.filter(t => t > lastTime).length;

    return eventsSince >= minCyclesSince;
  }

  /**
   * Compute current tempo: events per hour from in-memory timestamps.
   */
  private computeTempo(): number {
    if (this.eventTimestamps.length < 2) return 0;
    const oldest = this.eventTimestamps[0];
    const newest = this.eventTimestamps[this.eventTimestamps.length - 1];
    const hours = (newest - oldest) / 3600000;
    return hours > 0 ? this.eventTimestamps.length / hours : 0;
  }

  /**
   * Compute time dilation: novelty stretches time, routine compresses it.
   * >1 = time feels slow (lots of new things)
   * <1 = time feels fast (routine, repetitive)
   * =1 = normal
   */
  private computeDilation(): number {
    if (this.recentDescriptions.length < 3) return 1.0;

    // Measure novelty: how different is each message from the ones before it?
    let totalNovelty = 0;
    for (let i = 1; i < this.recentDescriptions.length; i++) {
      const current = this.recentDescriptions[i];
      const previous = this.recentDescriptions.slice(Math.max(0, i - 5), i);
      let maxSimilarity = 0;
      for (const prev of previous) {
        const overlap = this.wordOverlap(current, prev);
        if (overlap > maxSimilarity) maxSimilarity = overlap;
      }
      totalNovelty += (1 - maxSimilarity);
    }

    const avgNovelty = totalNovelty / (this.recentDescriptions.length - 1);
    // Novelty 0.5 = normal (dilation 1.0)
    // Novelty 1.0 = all new (dilation 1.5)
    // Novelty 0.0 = all routine (dilation 0.5)
    return 0.5 + avgNovelty;
  }

  /** Simple word overlap without depending on SimilarityProvider (avoids circular dep) */
  private wordOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
    return intersection / Math.max(wordsA.size, wordsB.size);
  }
}
