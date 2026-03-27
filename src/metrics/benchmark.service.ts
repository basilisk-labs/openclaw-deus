import { Injectable, Optional, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { CognitivePipelineService } from '../cognitive/cognitive-pipeline.service';
import { IntrospectionService } from '../introspection/introspection.service';
import { BeliefDecayService } from '../beliefs/services/belief-decay.service';
import {
  BenchmarkScenario,
  BenchmarkResult,
  BenchmarkSuiteResult,
  BenchmarkExpectations,
} from './benchmark.types';

const BUILT_IN_SCENARIOS: BenchmarkScenario[] = [
  {
    id: 'bench_extraction_simple',
    name: 'Simple extraction',
    category: 'extraction',
    input: {
      messages: ['I need to refactor the authentication module to use JWT tokens instead of session cookies. The deadline is next Friday.'],
    },
    expectations: { min_intentions: 1, min_knowledge: 1 },
  },
  {
    id: 'bench_contradiction',
    name: 'Contradiction detection',
    category: 'coherence',
    input: {
      messages: [
        'We should always use PostgreSQL for our data storage needs.',
        'We should avoid PostgreSQL entirely and use MongoDB for everything.',
      ],
    },
    expectations: { min_contradictions: 1 },
  },
  {
    id: 'bench_knowledge_gap',
    name: 'Knowledge gap linking',
    category: 'knowledge',
    input: {
      messages: ['We need to integrate with the Quantum Computing API but I have no idea how their authentication works.'],
    },
    expectations: { min_intentions: 1 },
  },
  {
    id: 'bench_deliberation_quality',
    name: 'Deliberation quality',
    category: 'deliberation',
    input: {
      messages: ['Design a complete microservices migration strategy for our monolithic e-commerce platform with zero downtime.'],
    },
    expectations: { min_intentions: 1, min_options: 2 },
  },
  {
    id: 'bench_pipeline_throughput',
    name: 'Pipeline throughput',
    category: 'integration',
    input: {
      messages: [
        'Start the build process.',
        'Check the test results.',
        'Deploy to staging.',
        'Monitor the logs.',
        'Review the metrics.',
      ],
    },
    expectations: { max_duration_ms: 30000 },
  },
  {
    id: 'bench_coherence_stability',
    name: 'Coherence stability',
    category: 'coherence',
    input: { messages: [] },
    expectations: { min_coherence: 0.5 },
  },
  {
    id: 'bench_decay_correctness',
    name: 'Decay correctness',
    category: 'coherence',
    input: { messages: [] },
    expectations: {},
  },
  {
    id: 'bench_nightly_completeness',
    name: 'Nightly completeness',
    category: 'integration',
    input: { messages: [] },
    expectations: { all_stages_passed: true },
  },
];

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger(BenchmarkService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly pipeline: CognitivePipelineService,
    private readonly introspection: IntrospectionService,
    private readonly decay: BeliefDecayService,
  ) {}

  getScenarios(): BenchmarkScenario[] {
    return [...BUILT_IN_SCENARIOS];
  }

  async runAll(): Promise<Result<BenchmarkSuiteResult, DomainError>> {
    const startTime = Date.now();
    const results: BenchmarkResult[] = [];

    for (const scenario of BUILT_IN_SCENARIOS) {
      const result = await this.runScenario(scenario);
      results.push(result);
    }

    const suite: BenchmarkSuiteResult = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
      duration_ms: Date.now() - startTime,
      run_at: new Date().toISOString(),
    };

    await this.db.create('benchmark_result', suite as unknown as Record<string, unknown>);
    this.logger.log(`Benchmarks: ${suite.passed}/${suite.total} passed, ${suite.duration_ms}ms`);
    return ok(suite);
  }

  async runScenario(scenario: BenchmarkScenario): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const failures: string[] = [];
    const actual: Record<string, unknown> = {};

    try {
      switch (scenario.category) {
        case 'extraction':
        case 'knowledge':
          await this.runExtractionBenchmark(scenario, actual, failures);
          break;
        case 'deliberation':
          await this.runDeliberationBenchmark(scenario, actual, failures);
          break;
        case 'coherence':
          await this.runCoherenceBenchmark(scenario, actual, failures);
          break;
        case 'integration':
          await this.runIntegrationBenchmark(scenario, actual, failures);
          break;
        default:
          await this.runExtractionBenchmark(scenario, actual, failures);
      }
    } catch (e: any) {
      failures.push(`Scenario crashed: ${e.message}`);
    }

    const duration = Date.now() - startTime;

    // Check duration expectation
    if (scenario.expectations.max_duration_ms && duration > scenario.expectations.max_duration_ms) {
      failures.push(`Duration ${duration}ms > expected ${scenario.expectations.max_duration_ms}ms`);
    }

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      passed: failures.length === 0,
      actual,
      expected: scenario.expectations as Record<string, unknown>,
      failures,
      duration_ms: duration,
      run_at: new Date().toISOString(),
    };
  }

  private async runExtractionBenchmark(
    scenario: BenchmarkScenario,
    actual: Record<string, unknown>,
    failures: string[],
  ): Promise<void> {
    let totalIntentions = 0;
    let totalKnowledge = 0;

    for (const msg of scenario.input.messages) {
      const result = await this.pipeline.processMessage(msg);
      if (result.isOk()) {
        totalIntentions += result.value.intentions_recognized;
        totalKnowledge += result.value.knowledge_extracted;
      } else {
        failures.push(`Pipeline error: ${result.error.message}`);
      }
    }

    actual.intentions_recognized = totalIntentions;
    actual.knowledge_extracted = totalKnowledge;

    if (scenario.expectations.min_intentions && totalIntentions < scenario.expectations.min_intentions) {
      failures.push(`Intentions ${totalIntentions} < expected ${scenario.expectations.min_intentions}`);
    }
    if (scenario.expectations.min_knowledge && totalKnowledge < scenario.expectations.min_knowledge) {
      failures.push(`Knowledge ${totalKnowledge} < expected ${scenario.expectations.min_knowledge}`);
    }
  }

  private async runDeliberationBenchmark(
    scenario: BenchmarkScenario,
    actual: Record<string, unknown>,
    failures: string[],
  ): Promise<void> {
    // Process message to create intention, then check deliberation was created
    for (const msg of scenario.input.messages) {
      const result = await this.pipeline.processMessage(msg);
      if (result.isOk()) {
        actual.deliberations_made = result.value.deliberations_made;

        // Check deliberation options from DB
        const delibs = await this.db.query<any>(
          'SELECT * FROM deliberation ORDER BY created_at DESC LIMIT 1',
        );
        if (delibs.isOk() && delibs.value.length > 0) {
          const latest = delibs.value[0];
          actual.options_count = latest.options?.length || 0;
          actual.safety_passed = latest.safety_check?.passed;

          if (scenario.expectations.min_options && (latest.options?.length || 0) < scenario.expectations.min_options) {
            failures.push(`Options ${latest.options?.length || 0} < expected ${scenario.expectations.min_options}`);
          }
        }
      } else {
        failures.push(`Pipeline error: ${result.error.message}`);
      }
    }
  }

  private async runCoherenceBenchmark(
    scenario: BenchmarkScenario,
    actual: Record<string, unknown>,
    failures: string[],
  ): Promise<void> {
    if (scenario.id === 'bench_coherence_stability') {
      const report = await this.introspection.run('full');
      if (report.isOk()) {
        actual.coherence_score = report.value.coherence_score;
        actual.posture = report.value.posture;
        if (scenario.expectations.min_coherence && report.value.coherence_score < scenario.expectations.min_coherence) {
          failures.push(`Coherence ${report.value.coherence_score} < expected ${scenario.expectations.min_coherence}`);
        }
      } else {
        failures.push(`Introspection error: ${report.error.message}`);
      }
    } else if (scenario.id === 'bench_contradiction') {
      // Process contradictory messages
      for (const msg of scenario.input.messages) {
        await this.pipeline.processMessage(msg);
      }
      // Check for contradictions
      const contrs = await this.db.query<any>('SELECT count() AS c FROM contradicts GROUP ALL');
      const count = contrs.isOk() && contrs.value.length > 0 ? contrs.value[0].c : 0;
      actual.contradictions_found = count;
      if (scenario.expectations.min_contradictions && count < scenario.expectations.min_contradictions) {
        failures.push(`Contradictions ${count} < expected ${scenario.expectations.min_contradictions}`);
      }
    } else if (scenario.id === 'bench_decay_correctness') {
      const result = await this.decay.runDecayCycle();
      actual.decay_ran = result.isOk();
      if (result.isErr()) {
        failures.push(`Decay cycle failed: ${result.error.message}`);
      }
    }
  }

  private async runIntegrationBenchmark(
    scenario: BenchmarkScenario,
    actual: Record<string, unknown>,
    failures: string[],
  ): Promise<void> {
    if (scenario.id === 'bench_nightly_completeness') {
      // Check latest nightly run from DB (don't trigger a new one to avoid circular dep)
      const latest = await this.db.query<any>(
        'SELECT * FROM nightly_run ORDER BY started_at DESC LIMIT 1',
      );
      if (latest.isOk() && latest.value.length > 0) {
        const summary = latest.value[0].summary as Record<string, unknown>;
        actual.total_stages = summary.total_stages;
        actual.passed_stages = summary.passed;
        actual.failed_stages = summary.failed;
        if (scenario.expectations.all_stages_passed && (summary.failed as number) > 0) {
          failures.push(`${summary.failed} nightly stages failed`);
        }
      } else {
        failures.push('No nightly run found — run nightly first');
      }
    } else {
      // Pipeline throughput
      for (const msg of scenario.input.messages) {
        const result = await this.pipeline.processMessage(msg);
        if (result.isErr()) {
          failures.push(`Pipeline error: ${result.error.message}`);
        }
      }
      actual.messages_processed = scenario.input.messages.length;
    }
  }

  async getLatestResults(): Promise<Result<BenchmarkSuiteResult | null, DomainError>> {
    const result = await this.db.query<BenchmarkSuiteResult>(
      'SELECT * FROM benchmark_result ORDER BY run_at DESC LIMIT 1',
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }
}
