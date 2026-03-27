import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { DiagnosisService } from './diagnosis.service';
import { BenchmarkService } from './benchmark.service';
import { ExperimentService } from './experiment.service';
import { RecursiveImproveService } from './recursive-improve.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly diagnosis: DiagnosisService,
    private readonly benchmarks: BenchmarkService,
    private readonly experiments: ExperimentService,
    private readonly improve: RecursiveImproveService,
  ) {}

  @Get('snapshot')
  async getSnapshot() {
    const result = await this.metrics.getLatest();
    if (result.isErr()) return { error: result.error.message };
    if (!result.value) {
      // Take fresh snapshot
      const fresh = await this.metrics.snapshot();
      return fresh.isOk() ? fresh.value : { error: fresh.error.message };
    }
    return result.value;
  }

  @Get('history')
  async getHistory() {
    const result = await this.metrics.getHistory();
    return result.isOk() ? result.value : { error: result.error.message };
  }

  @Post('snapshot')
  async takeSnapshot() {
    const result = await this.metrics.snapshot();
    return result.isOk() ? result.value : { error: result.error.message };
  }

  @Post('diagnose')
  async runDiagnosis() {
    const snapshot = await this.metrics.snapshot();
    if (snapshot.isErr()) return { error: snapshot.error.message };
    const result = await this.diagnosis.analyze(snapshot.value);
    return result.isOk() ? result.value : { error: result.error.message };
  }

  @Get('benchmarks')
  async getBenchmarks() {
    return this.benchmarks.getScenarios();
  }

  @Post('benchmarks/run')
  async runBenchmarks() {
    const result = await this.benchmarks.runAll();
    return result.isOk() ? result.value : { error: result.error.message };
  }

  @Post('improve')
  async runImprovement() {
    const result = await this.improve.run();
    return result.isOk() ? result.value : { error: result.error.message };
  }

  @Get('improvements')
  async getPendingImprovements() {
    const result = await this.experiments.getPendingImprovements();
    return result.isOk() ? result.value : { error: result.error.message };
  }

  @Post('improvements/:id')
  async reviewImprovement(
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; notes?: string },
  ) {
    const result = await this.experiments.reviewImprovement(id, body.decision, body.notes);
    return result.isOk() ? result.value : { error: result.error.message };
  }

  @Get('improve/history')
  async getImproveHistory() {
    const result = await this.improve.getHistory();
    return result.isOk() ? result.value : { error: result.error.message };
  }
}
