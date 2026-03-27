import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { CalibrationReport } from '../common/types/cognitive-config.types';

@Injectable()
export class CalibrationService {
  private readonly logger = new Logger(CalibrationService.name);

  constructor(private readonly db: SurrealService) {}

  /**
   * Record a prediction for later calibration tracking.
   */
  async recordPrediction(content: string, confidence: number): Promise<Result<void, DomainError>> {
    return this.db.execute(
      `CREATE prediction SET content = $content, confidence = $conf, created_at = time::now()`,
      { content, conf: confidence },
    ).then(r => r.isOk() ? ok(undefined) : err(r.error));
  }

  /**
   * Record outcome of a prediction.
   */
  async recordOutcome(predictionId: string, wasCorrect: boolean): Promise<Result<void, DomainError>> {
    return this.db.execute(
      `UPDATE $id SET outcome = $outcome, resolved_at = time::now()`,
      { id: predictionId, outcome: wasCorrect },
    ).then(r => r.isOk() ? ok(undefined) : err(r.error));
  }

  /**
   * Compute Expected Calibration Error (ECE).
   * Groups predictions into confidence buckets, compares predicted vs actual accuracy.
   */
  async computeCalibration(): Promise<Result<CalibrationReport, DomainError>> {
    const predictions = await this.db.query<{
      confidence: number;
      outcome: boolean;
    }>('SELECT confidence, outcome, created_at FROM prediction WHERE outcome IS NOT NONE ORDER BY created_at DESC LIMIT 500');

    if (predictions.isErr()) return err(predictions.error);
    const data = predictions.value;

    if (data.length < 10) {
      return ok({
        ece: 0,
        overconfident: false,
        underconfident: false,
        correction_factor: 0,
        sample_size: data.length,
        calibration_curve: [],
        suggestion: 'Not enough predictions to assess calibration (need >= 10)',
      });
    }

    // Bucket by confidence (0.1 increments)
    const buckets = new Map<number, { correct: number; total: number; sumConf: number }>();
    for (const p of data) {
      const bucket = Math.floor(p.confidence * 10) / 10;
      const b = buckets.get(bucket) || { correct: 0, total: 0, sumConf: 0 };
      b.total++;
      b.sumConf += p.confidence;
      if (p.outcome) b.correct++;
      buckets.set(bucket, b);
    }

    // Compute ECE
    let ece = 0;
    let totalOverConfidence = 0;
    const curve: CalibrationReport['calibration_curve'] = [];

    for (const [bucket, b] of buckets.entries()) {
      const avgConf = b.sumConf / b.total;
      const accuracy = b.correct / b.total;
      const weight = b.total / data.length;
      ece += Math.abs(avgConf - accuracy) * weight;
      totalOverConfidence += (avgConf - accuracy) * weight;
      curve.push({ predicted: avgConf, actual: accuracy, count: b.total });
    }

    const overconfident = totalOverConfidence > 0.05;
    const underconfident = totalOverConfidence < -0.05;
    const correctionFactor = -totalOverConfidence; // positive = should increase confidence

    return ok({
      ece: Math.round(ece * 1000) / 1000,
      overconfident,
      underconfident,
      correction_factor: Math.round(correctionFactor * 1000) / 1000,
      sample_size: data.length,
      calibration_curve: curve.sort((a, b) => a.predicted - b.predicted),
      suggestion: ece > 0.15
        ? `High miscalibration (ECE=${ece.toFixed(3)}). ${overconfident ? 'Reduce' : 'Increase'} confidence by ~${Math.abs(correctionFactor).toFixed(2)}`
        : 'Calibration acceptable',
    });
  }
}
