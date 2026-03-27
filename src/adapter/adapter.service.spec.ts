import { Test, TestingModule } from '@nestjs/testing';
import { ok } from 'neverthrow';
import { AdapterService } from './adapter.service';
import { SurrealService } from '../database/surreal.service';
import { WorldModelService } from '../world-model/world-model.service';
import { MetricsService } from '../metrics/metrics.service';
import { DiagnosisService } from '../metrics/diagnosis.service';

describe('AdapterService', () => {
  let service: AdapterService;
  let db: jest.Mocked<SurrealService>;
  let worldModel: jest.Mocked<WorldModelService>;
  let metrics: jest.Mocked<MetricsService>;
  let diagnosis: jest.Mocked<DiagnosisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdapterService,
        {
          provide: SurrealService,
          useValue: {
            isConnected: jest.fn().mockReturnValue(true),
            query: jest.fn().mockResolvedValue(ok([])),
            execute: jest.fn().mockResolvedValue(ok({})),
            create: jest.fn().mockResolvedValue(ok({})),
            update: jest.fn().mockResolvedValue(ok({})),
          },
        },
        {
          provide: WorldModelService,
          useValue: {
            getLatest: jest.fn().mockResolvedValue(ok({
              version: 2,
              generated_at: '2026-03-27T08:00:00.000Z',
              workspace_day: '2026-03-27',
              confidence: 0.8,
              self_model: { agency_level: 'L2', invariants: [], goals: [], review_pressure: 0, active_limitations: [] },
              human_model: { preferences: [], constraints: [], active_requests: [] },
              workspace_model: { active_project: null, mode: 'active', status: 'active', repo_dirty: false, memory_freshness_days: 0, introspection_date: null, next_step: null },
              environment_model: { waiting_conditions: [], dependencies: [], open_tensions: [], external_systems: [] },
              action_priors: { hard_blocks: [], preferred_modes: ['observe'], active_risks: [] },
              sources: { beliefs: { count: 1 }, memory: { days: 1, latest_day: '2026-03-27' }, logs: { entries: 1 }, pending_beliefs: { count: 0 }, status: { exists: true } },
            })),
            build: jest.fn().mockResolvedValue(ok({
              version: 2,
              generated_at: '2026-03-27T08:00:00.000Z',
              workspace_day: '2026-03-27',
              confidence: 0.8,
              self_model: { agency_level: 'L2', invariants: [], goals: [], review_pressure: 0, active_limitations: [] },
              human_model: { preferences: [], constraints: [], active_requests: [] },
              workspace_model: { active_project: null, mode: 'active', status: 'active', repo_dirty: false, memory_freshness_days: 0, introspection_date: null, next_step: null },
              environment_model: { waiting_conditions: [], dependencies: [], open_tensions: [], external_systems: [] },
              action_priors: { hard_blocks: [], preferred_modes: ['observe'], active_risks: [] },
              sources: { beliefs: { count: 1 }, memory: { days: 1, latest_day: '2026-03-27' }, logs: { entries: 1 }, pending_beliefs: { count: 0 }, status: { exists: true } },
            })),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            getLatest: jest.fn().mockResolvedValue(ok({
              timestamp: '2026-03-27T08:05:00.000Z',
              dimensions: {
                coherence: { score: 0.8, posture: 'stable', contradictions: 0 },
                calibration: { ece: 0.1, overconfident: false, sample_size: 10 },
                knowledge: { total: 5, gaps_open: 0, gaps_high_impact: 0, extraction_rate: 1 },
                beliefs: { total: 8, active: 8, avg_confidence: 0.9, decay_rate: 0, promotion_rate: 0 },
                intentions: { active: 1, completion_rate: 1, stale_count: 0, avg_duration_ms: 0 },
                deliberation: { total: 1, safety_pass_rate: 1, avg_options: 2 },
                episodes: { total: 3, success_rate: 1, trend: 'stable' },
                pipeline: { avg_duration_ms: 10, error_rate: 0, throughput: 1 },
                world_model: { confidence: 0.8, freshness_hours: 1 },
                llm: { daily_tokens_used: 0, budget_utilization: 0, cache_hit_rate: 0 },
              },
              health_score: 0.84,
              weak_dimensions: [],
            })),
            snapshot: jest.fn(),
          },
        },
        {
          provide: DiagnosisService,
          useValue: {
            analyze: jest.fn().mockResolvedValue(ok({
              snapshot_id: 'snap',
              diagnoses: [],
              summary: 'No significant issues detected',
              created_at: '2026-03-27T08:06:00.000Z',
            })),
          },
        },
      ],
    }).compile();

    service = module.get(AdapterService);
    db = module.get(SurrealService);
    worldModel = module.get(WorldModelService);
    metrics = module.get(MetricsService);
    diagnosis = module.get(DiagnosisService);
  });

  it('returns normalized adapter health state', async () => {
    db.query
      .mockResolvedValueOnce(ok([{ key: 'log-batch', value: { cursor: '2026-03-27#2', batchId: '2026-03-27#2' }, updated_at: '2026-03-27T08:10:00.000Z' }]))
      .mockResolvedValueOnce(ok([{ key: 'beliefs-snapshot', value: { snapshotId: 'beliefs@abc', generatedAt: '2026-03-27T08:09:00.000Z' }, updated_at: '2026-03-27T08:09:00.000Z' }]))
      .mockResolvedValueOnce(ok([{ timestamp: '2026-03-27T08:00:00.000Z' }]))
      .mockResolvedValueOnce(ok([{ timestamp: '2026-03-27T08:05:00.000Z' }]))
      .mockResolvedValueOnce(ok([{ timestamp: '2026-03-27T08:06:00.000Z' }]));

    const health = await service.getHealth();
    expect(health.ok).toBe(true);
    expect(health.service).toBe('cognitive-runtime');
    expect(health.importState.lastLogCursor).toBe('2026-03-27#2');
    expect(health.importState.lastBeliefSnapshotId).toBe('beliefs@abc');
    expect(health.readModels.metricsGeneratedAt).toBe('2026-03-27T08:05:00.000Z');
  });

  it('imports log batches idempotently and maps unsupported types to event', async () => {
    db.query
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ id: 'adapter_log_entry:1' }]));

    const result = await service.importLogBatch({
      source: 'master-runtime',
      batchId: '2026-03-27#1',
      entries: [
        {
          sourceId: '2026-03-27#1',
          timestamp: '2026-03-27T08:15:00.000Z',
          type: 'process_status',
          payload: {
            description: 'nightly completed',
            context: { process_status: { status: 'completed' } },
          },
        },
        {
          sourceId: '2026-03-27#1',
          timestamp: '2026-03-27T08:15:00.000Z',
          type: 'process_status',
          payload: {
            description: 'nightly completed',
            context: { process_status: { status: 'completed' } },
          },
        },
      ],
    });

    expect(result.accepted).toBe(1);
    expect(result.deduplicated).toBe(1);
    expect(db.create).toHaveBeenCalledWith(
      'activity_log',
      expect.objectContaining({
        type: 'event',
        description: 'nightly completed',
      }),
    );
    expect(db.execute).toHaveBeenCalled();
  });

  it('imports beliefs snapshot by creating or updating belief records', async () => {
    db.query
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ id: 'belief:1', belief_id: 'I2' }]));

    const result = await service.importBeliefsSnapshot({
      snapshotId: 'beliefs@abc',
      generatedAt: '2026-03-27T08:20:00.000Z',
      beliefs: [
        {
          belief_id: 'I1',
          content: 'Invariant one',
          confidence: 1,
          belief_class: 'axiom',
          decay_mode: 'no_decay',
          status: 'active',
        },
        {
          belief_id: 'I2',
          content: 'Invariant two',
          confidence: 0.9,
          belief_class: 'axiom',
          decay_mode: 'slow',
          status: 'active',
        },
      ],
    });

    expect(result.deduplicated).toBe(false);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(db.create).toHaveBeenCalledWith(
      'adapter_snapshot',
      expect.objectContaining({
        snapshot_id: 'beliefs@abc',
        snapshot_type: 'beliefs',
      }),
    );
  });

  it('reads latest diagnosis and generates one on demand when missing', async () => {
    db.query.mockResolvedValueOnce(ok([]));

    const result = await service.getLatestDiagnosis();
    expect(result.ok).toBe(true);
    expect(result.diagnosis.summary).toBe('No significant issues detected');
    expect(diagnosis.analyze).toHaveBeenCalled();
  });
});
