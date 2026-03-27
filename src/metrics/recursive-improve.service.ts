import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { MetricsService } from './metrics.service';
import { DiagnosisService } from './diagnosis.service';
import { ExperimentService } from './experiment.service';
import { ImprovementRun } from './experiment.types';
import { Hypothesis } from './diagnosis.types';

const MAX_PARAM_EXPERIMENTS_PER_RUN = 3;

@Injectable()
export class RecursiveImproveService {
  private readonly logger = new Logger(RecursiveImproveService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly metrics: MetricsService,
    private readonly diagnosis: DiagnosisService,
    private readonly experiments: ExperimentService,
  ) {}

  /**
   * Full recursive improvement loop:
   * measure → diagnose → hypothesize → experiment/propose → persist
   */
  async run(): Promise<Result<ImprovementRun, DomainError>> {
    const startedAt = new Date().toISOString();
    this.logger.log('Recursive improvement loop started');

    // Step 1: Measure
    const snapshotResult = await this.metrics.snapshot();
    if (snapshotResult.isErr()) return err(snapshotResult.error);
    const snapshot = snapshotResult.value;

    // Skip if system is healthy
    if (snapshot.weak_dimensions.length === 0 && snapshot.health_score > 0.8) {
      this.logger.log(`System healthy (score=${snapshot.health_score}), skipping improvement`);
      const run: ImprovementRun = {
        snapshot_id: snapshot.id || snapshot.timestamp,
        diagnoses_count: 0,
        experiments_run: 0,
        experiments_committed: 0,
        experiments_rolled_back: 0,
        logic_proposals_created: 0,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      };
      await this.db.create('improvement_run', run as unknown as Record<string, unknown>);
      return ok(run);
    }

    // Step 2: Diagnose
    const diagResult = await this.diagnosis.analyze(snapshot);
    if (diagResult.isErr()) return err(diagResult.error);
    const diagnosisResult = diagResult.value;

    // Step 3: Collect all hypotheses, sorted by confidence
    const allHypotheses: Hypothesis[] = diagnosisResult.diagnoses
      .flatMap((d) => d.hypotheses)
      .sort((a, b) => b.confidence - a.confidence);

    this.logger.warn(`Hypotheses: ${allHypotheses.length} total (${allHypotheses.map(h => h.type).join(', ') || 'none'})`);

    let experimentsRun = 0;
    let experimentsCommitted = 0;
    let experimentsRolledBack = 0;
    let logicProposals = 0;

    // Step 4: Process hypotheses
    for (const hyp of allHypotheses) {
      if (hyp.type === 'param_adjustment' && experimentsRun < MAX_PARAM_EXPERIMENTS_PER_RUN) {
        // Run experiment
        const expResult = await this.experiments.runParamExperiment(hyp);
        experimentsRun++;

        if (expResult.isOk()) {
          if (expResult.value.status === 'completed') {
            experimentsCommitted++;
          } else if (expResult.value.status === 'rolled_back') {
            experimentsRolledBack++;
          }
        } else {
          this.logger.warn(`Experiment failed for ${hyp.id}: ${expResult.error.message}`);
        }
      } else if (hyp.type !== 'param_adjustment') {
        // Logic/architecture change → propose for review
        const propResult = await this.experiments.proposeLogicImprovement(hyp);
        if (propResult.isOk()) {
          logicProposals++;
        } else {
          this.logger.warn(`Logic proposal failed for ${hyp.id}: ${propResult.error.message}`);
        }
      }
    }

    const run: ImprovementRun = {
      snapshot_id: snapshot.id || snapshot.timestamp,
      diagnoses_count: diagnosisResult.diagnoses.length,
      experiments_run: experimentsRun,
      experiments_committed: experimentsCommitted,
      experiments_rolled_back: experimentsRolledBack,
      logic_proposals_created: logicProposals,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    };

    await this.db.create('improvement_run', run as unknown as Record<string, unknown>);

    this.logger.log(
      `Improvement loop: ${diagnosisResult.diagnoses.length} diagnoses, ` +
      `${experimentsRun} experiments (${experimentsCommitted} committed, ${experimentsRolledBack} rolled back), ` +
      `${logicProposals} logic proposals`,
    );

    return ok(run);
  }

  async getHistory(limit = 10): Promise<Result<ImprovementRun[], DomainError>> {
    return this.db.query<ImprovementRun>(
      `SELECT * FROM improvement_run ORDER BY started_at DESC LIMIT ${limit}`,
    );
  }
}
