import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { CognitiveConfigService } from './cognitive-config.service';

/**
 * Meta-learning: track which learning strategies work and adapt accordingly.
 * Answers: which domains are error-prone? Which knowledge types retain best?
 * Which deliberation patterns lead to success?
 */

export interface MetaLearningReport {
  id?: string;
  timestamp: string;
  domain_effectiveness: DomainEffectiveness[];
  knowledge_retention: KnowledgeRetention[];
  deliberation_accuracy: DeliberationAccuracy;
  recommendations: MetaRecommendation[];
}

export interface DomainEffectiveness {
  domain: string;
  episode_count: number;
  success_rate: number;
  avg_confidence: number;
  knowledge_count: number;
  gap_count: number;
  risk_level: 'low' | 'medium' | 'high';
}

export interface KnowledgeRetention {
  kind: string;
  total: number;
  active: number;
  avg_confidence: number;
  avg_evidence_count: number;
  retention_rate: number; // active / total
}

export interface DeliberationAccuracy {
  total_deliberations: number;
  avg_estimated_success: number;
  actual_success_rate: number;
  calibration_gap: number; // |estimated - actual|
  best_approach: string; // which approach type wins most often
}

export interface MetaRecommendation {
  type: 'domain_attention' | 'extraction_bias' | 'deliberation_strategy' | 'config_adjustment';
  description: string;
  target: string;
  confidence: number;
}

const META_QUERY = `
  LET $domain_stats = (
    SELECT
      domain,
      count() AS knowledge_count,
      math::mean(confidence.point OR confidence OR 0) AS avg_confidence
    FROM knowledge
    WHERE status = 'active'
    GROUP BY domain
  );
  LET $domain_gaps = (
    SELECT domain, count() AS gap_count
    FROM knowledge_gap WHERE status = 'open'
    GROUP BY domain
  );
  LET $knowledge_by_kind = (
    SELECT
      kind,
      count() AS total,
      count(status = 'active') AS active,
      math::mean(confidence.point OR confidence OR 0) AS avg_conf,
      math::mean(array::len(evidence)) AS avg_evidence
    FROM knowledge
    GROUP BY kind
  );
  LET $delib_stats = (
    SELECT
      count() AS total,
      math::mean(options[selected_option].estimated_success OR 0.5) AS avg_estimated
    FROM deliberation
    GROUP ALL
  );
  LET $episode_success = (
    SELECT count() AS total, count(outcome IN ['success', 'partial_success']) AS successes
    FROM episode WHERE created_at > time::now() - 30d
    GROUP ALL
  );
  RETURN {
    domain_stats: $domain_stats,
    domain_gaps: $domain_gaps,
    knowledge_by_kind: $knowledge_by_kind,
    delib_stats: $delib_stats[0],
    episode_success: $episode_success[0]
  }
`;

@Injectable()
export class MetaLearningService {
  private readonly logger = new Logger(MetaLearningService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  async analyze(): Promise<Result<MetaLearningReport, DomainError>> {
    const raw = await this.db.queryRaw<any>(META_QUERY);
    const d = raw.isOk()
      ? (Array.isArray(raw.value) ? raw.value[raw.value.length - 1] : raw.value)
      : {} as Record<string, unknown>;

    const domainStats = d?.domain_stats || [];
    const domainGaps = d?.domain_gaps || [];
    const knowledgeByKind = d?.knowledge_by_kind || [];
    const delibStats = d?.delib_stats || { total: 0, avg_estimated: 0.5 };
    const episodeSuccess = d?.episode_success || { total: 0, successes: 0 };

    // Domain effectiveness
    const gapsByDomain = new Map<string, number>();
    for (const g of domainGaps) {
      gapsByDomain.set(g.domain, g.gap_count || 0);
    }

    const domainEffectiveness: DomainEffectiveness[] = domainStats.map((ds: any) => {
      const gaps = gapsByDomain.get(ds.domain) || 0;
      const successRate = ds.avg_confidence > 0.7 ? 0.8 : 0.5; // proxy from confidence
      return {
        domain: ds.domain,
        episode_count: 0, // would need domain-tagged episodes
        success_rate: successRate,
        avg_confidence: Math.round((ds.avg_confidence || 0) * 1000) / 1000,
        knowledge_count: ds.knowledge_count || 0,
        gap_count: gaps,
        risk_level: (gaps > 5 ? 'high' : gaps > 2 ? 'medium' : 'low') as DomainEffectiveness['risk_level'],
      };
    });

    // Knowledge retention by kind
    const knowledgeRetention: KnowledgeRetention[] = knowledgeByKind.map((k: any) => ({
      kind: k.kind,
      total: k.total || 0,
      active: k.active || 0,
      avg_confidence: Math.round((k.avg_conf || 0) * 1000) / 1000,
      avg_evidence_count: Math.round((k.avg_evidence || 0) * 10) / 10,
      retention_rate: k.total > 0 ? Math.round((k.active / k.total) * 1000) / 1000 : 0,
    }));

    // Deliberation accuracy
    const actualRate = episodeSuccess.total > 0 ? episodeSuccess.successes / episodeSuccess.total : 0.5;
    const deliberationAccuracy: DeliberationAccuracy = {
      total_deliberations: delibStats.total || 0,
      avg_estimated_success: Math.round((delibStats.avg_estimated || 0.5) * 1000) / 1000,
      actual_success_rate: Math.round(actualRate * 1000) / 1000,
      calibration_gap: Math.round(Math.abs((delibStats.avg_estimated || 0.5) - actualRate) * 1000) / 1000,
      best_approach: 'standard', // would need per-approach tracking
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(domainEffectiveness, knowledgeRetention, deliberationAccuracy);

    const report: MetaLearningReport = {
      timestamp: new Date().toISOString(),
      domain_effectiveness: domainEffectiveness,
      knowledge_retention: knowledgeRetention,
      deliberation_accuracy: deliberationAccuracy,
      recommendations,
    };

    await this.db.create('meta_learning_report', report as unknown as Record<string, unknown>);
    this.logger.log(`Meta-learning: ${domainEffectiveness.length} domains, ${recommendations.length} recommendations`);
    return ok(report);
  }

  private generateRecommendations(
    domains: DomainEffectiveness[],
    retention: KnowledgeRetention[],
    delib: DeliberationAccuracy,
  ): MetaRecommendation[] {
    const recs: MetaRecommendation[] = [];

    // High-risk domains need more attention
    for (const d of domains.filter((d) => d.risk_level === 'high')) {
      recs.push({
        type: 'domain_attention',
        description: `Domain "${d.domain}" has ${d.gap_count} knowledge gaps — prioritize gap filling`,
        target: d.domain,
        confidence: 0.8,
      });
    }

    // Best-retaining knowledge kind → bias extraction
    const bestRetention = retention.sort((a, b) => b.retention_rate - a.retention_rate)[0];
    if (bestRetention && bestRetention.retention_rate > 0.8) {
      recs.push({
        type: 'extraction_bias',
        description: `"${bestRetention.kind}" knowledge retains best (${(bestRetention.retention_rate * 100).toFixed(0)}%) — bias extraction toward this type`,
        target: bestRetention.kind,
        confidence: 0.6,
      });
    }

    // Deliberation calibration
    if (delib.calibration_gap > 0.15 && delib.total_deliberations >= 5) {
      const direction = delib.avg_estimated_success > delib.actual_success_rate ? 'overconfident' : 'underconfident';
      recs.push({
        type: 'deliberation_strategy',
        description: `Deliberation is ${direction}: estimated ${(delib.avg_estimated_success * 100).toFixed(0)}% but actual ${(delib.actual_success_rate * 100).toFixed(0)}%`,
        target: 'deliberation',
        confidence: 0.7,
      });
    }

    return recs;
  }

  async getLatest(): Promise<Result<MetaLearningReport | null, DomainError>> {
    const result = await this.db.query<MetaLearningReport>(
      'SELECT * FROM meta_learning_report ORDER BY timestamp DESC LIMIT 1',
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }
}
