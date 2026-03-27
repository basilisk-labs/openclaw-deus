import { Test, TestingModule } from "@nestjs/testing";
import { ok } from "neverthrow";
import { AdapterService } from "./adapter.service";
import { SurrealService } from "../database/surreal.service";
import { WorldModelService } from "../world-model/world-model.service";
import { MetricsService } from "../metrics/metrics.service";
import { DiagnosisService } from "../metrics/diagnosis.service";

const WORLD_MODEL_FIXTURE = {
  version: 2,
  generated_at: "2026-03-27T08:00:00.000Z",
  workspace_day: "2026-03-27",
  confidence: 0.8,
  self_model: {
    agency_level: "L2",
    invariants: [],
    goals: [],
    review_pressure: 0,
    active_limitations: [],
  },
  human_model: { preferences: [], constraints: [], active_requests: [] },
  workspace_model: {
    active_project: null,
    mode: "active",
    status: "active",
    repo_dirty: false,
    memory_freshness_days: 0,
    introspection_date: null,
    next_step: null,
  },
  environment_model: {
    waiting_conditions: [],
    dependencies: [],
    open_tensions: [],
    external_systems: [],
  },
  action_priors: {
    hard_blocks: [],
    preferred_modes: ["observe"],
    active_risks: [],
  },
  sources: {
    beliefs: { count: 1 },
    memory: { days: 1, latest_day: "2026-03-27" },
    logs: { entries: 1 },
    pending_beliefs: { count: 0 },
    status: { exists: true },
  },
};

const METRICS_FIXTURE = {
  timestamp: "2026-03-27T08:05:00.000Z",
  dimensions: {
    coherence: { score: 0.8, posture: "stable", contradictions: 0 },
    calibration: { ece: 0.1, overconfident: false, sample_size: 10 },
    knowledge: {
      total: 5,
      gaps_open: 0,
      gaps_high_impact: 0,
      extraction_rate: 1,
    },
    beliefs: {
      total: 8,
      active: 8,
      avg_confidence: 0.9,
      decay_rate: 0,
      promotion_rate: 0,
    },
    intentions: {
      active: 1,
      completion_rate: 1,
      stale_count: 0,
      avg_duration_ms: 0,
    },
    deliberation: { total: 1, safety_pass_rate: 1, avg_options: 2 },
    episodes: { total: 3, success_rate: 1, trend: "stable" },
    pipeline: { avg_duration_ms: 10, error_rate: 0, throughput: 1 },
    world_model: { confidence: 0.8, freshness_hours: 1 },
    llm: { daily_tokens_used: 0, budget_utilization: 0, cache_hit_rate: 0 },
  },
  health_score: 0.84,
  weak_dimensions: [],
};

const DIAGNOSIS_FIXTURE = {
  snapshot_id: "snap",
  diagnoses: [],
  summary: "No significant issues detected",
  created_at: "2026-03-27T08:06:00.000Z",
};

describe("AdapterService", () => {
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
            getLatest: jest
              .fn()
              .mockResolvedValue(ok({ ...WORLD_MODEL_FIXTURE })),
            build: jest.fn().mockResolvedValue(ok({ ...WORLD_MODEL_FIXTURE })),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            getLatest: jest.fn().mockResolvedValue(ok({ ...METRICS_FIXTURE })),
            snapshot: jest.fn().mockResolvedValue(ok({ ...METRICS_FIXTURE })),
          },
        },
        {
          provide: DiagnosisService,
          useValue: {
            analyze: jest.fn().mockResolvedValue(ok({ ...DIAGNOSIS_FIXTURE })),
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

  it("returns normalized adapter health state", async () => {
    db.query
      .mockResolvedValueOnce(
        ok([
          {
            key: "log-batch",
            value: { cursor: "2026-03-27#2", batchId: "2026-03-27#2" },
            updated_at: "2026-03-27T08:10:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(
        ok([
          {
            key: "beliefs-snapshot",
            value: {
              snapshotId: "beliefs@abc",
              generatedAt: "2026-03-27T08:09:00.000Z",
            },
            updated_at: "2026-03-27T08:09:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(
        ok([
          {
            key: "memory-snapshot",
            value: {
              snapshotId: "memory@abc",
              generatedAt: "2026-03-27T08:08:00.000Z",
            },
            updated_at: "2026-03-27T08:08:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(
        ok([
          {
            key: "status-snapshot",
            value: {
              snapshotId: "status@abc",
              generatedAt: "2026-03-27T08:07:00.000Z",
            },
            updated_at: "2026-03-27T08:07:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(
        ok([
          {
            key: "introspection-summary",
            value: {
              snapshotId: "introspection@abc",
              generatedAt: "2026-03-27T08:06:00.000Z",
            },
            updated_at: "2026-03-27T08:06:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(ok([{ timestamp: "2026-03-27T08:00:00.000Z" }]))
      .mockResolvedValueOnce(ok([{ timestamp: "2026-03-27T08:05:00.000Z" }]))
      .mockResolvedValueOnce(ok([{ timestamp: "2026-03-27T08:06:00.000Z" }]));

    const health = await service.getHealth();
    expect(health.ok).toBe(true);
    expect(health.service).toBe("cognitive-runtime");
    expect(health.importState.lastLogCursor).toBe("2026-03-27#2");
    expect(health.importState.lastBeliefSnapshotId).toBe("beliefs@abc");
    expect(health.importState.lastMemorySnapshotId).toBe("memory@abc");
    expect(health.importState.lastStatusSnapshotId).toBe("status@abc");
    expect(health.importState.lastIntrospectionSnapshotId).toBe(
      "introspection@abc",
    );
    expect(health.readModels.metricsGeneratedAt).toBe(
      "2026-03-27T08:05:00.000Z",
    );
  });

  it("imports log batches idempotently and maps unsupported types to event", async () => {
    db.query
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ id: "adapter_log_entry:1" }]));

    const result = await service.importLogBatch({
      source: "master-runtime",
      batchId: "2026-03-27#1",
      entries: [
        {
          sourceId: "2026-03-27#1",
          timestamp: "2026-03-27T08:15:00.000Z",
          type: "process_status",
          payload: {
            description: "nightly completed",
            context: { process_status: { status: "completed" } },
          },
        },
        {
          sourceId: "2026-03-27#1",
          timestamp: "2026-03-27T08:15:00.000Z",
          type: "process_status",
          payload: {
            description: "nightly completed",
            context: { process_status: { status: "completed" } },
          },
        },
      ],
    });

    expect(result.accepted).toBe(1);
    expect(result.deduplicated).toBe(1);
    expect(db.create).toHaveBeenCalledWith(
      "activity_log",
      expect.objectContaining({
        type: "event",
        description: "nightly completed",
      }),
    );
    expect(db.execute).toHaveBeenCalled();
  });

  it("imports beliefs snapshot by creating or updating belief records", async () => {
    db.query
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ id: "belief:1", belief_id: "I2" }]));

    const result = await service.importBeliefsSnapshot({
      snapshotId: "beliefs@abc",
      generatedAt: "2026-03-27T08:20:00.000Z",
      beliefs: [
        {
          belief_id: "I1",
          content: "Invariant one",
          confidence: 1,
          belief_class: "axiom",
          decay_mode: "no_decay",
          status: "active",
        },
        {
          belief_id: "I2",
          content: "Invariant two",
          confidence: 0.9,
          belief_class: "axiom",
          decay_mode: "slow",
          status: "active",
        },
      ],
    });

    expect(result.deduplicated).toBe(false);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(db.create).toHaveBeenCalledWith(
      "adapter_snapshot",
      expect.objectContaining({
        snapshot_id: "beliefs@abc",
        snapshot_type: "beliefs",
      }),
    );
  });

  it("imports memory, status, and introspection snapshots into adapter storage", async () => {
    db.query
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]));

    const memory = await service.importMemorySnapshot({
      snapshotId: "memory@abc",
      generatedAt: "2026-03-27T08:21:00.000Z",
      dayCount: 2,
      latestDayKey: "2026-03-27",
      days: [
        { dayKey: "2026-03-27", content: "# Memory" },
        { dayKey: "2026-03-26", content: "# Earlier" },
      ],
    });
    const status = await service.importStatusSnapshot({
      snapshotId: "status@abc",
      generatedAt: "2026-03-27T08:22:00.000Z",
      exists: true,
      focusState: {
        activeProject: "projects/threads-bot",
        mode: "focus",
        status: "blocked",
        nextStep: "inspect queue",
      },
      flat: { status: "blocked" },
      raw: "STATUS.md content",
    });
    const introspection = await service.importIntrospectionSummary({
      snapshotId: "introspection@abc",
      generatedAt: "2026-03-27T08:23:00.000Z",
      exists: true,
      summary: {
        date: "2026-03-27",
        coherence: 0.74,
        beliefs: 12,
        memory_today: true,
      },
    });

    expect(memory.dayCount).toBe(2);
    expect(status.exists).toBe(true);
    expect(introspection.exists).toBe(true);
    expect(db.create).toHaveBeenCalledWith(
      "adapter_snapshot",
      expect.objectContaining({
        snapshot_id: "memory@abc",
        snapshot_type: "memory",
      }),
    );
    expect(db.create).toHaveBeenCalledWith(
      "adapter_snapshot",
      expect.objectContaining({
        snapshot_id: "status@abc",
        snapshot_type: "status",
      }),
    );
    expect(db.create).toHaveBeenCalledWith(
      "adapter_snapshot",
      expect.objectContaining({
        snapshot_id: "introspection@abc",
        snapshot_type: "introspection",
      }),
    );
    expect(db.create).toHaveBeenCalledWith(
      "introspection_report",
      expect.objectContaining({
        posture: "review",
      }),
    );
  });

  it("rebuilds stale world model and enriches it from imported snapshots", async () => {
    worldModel.getLatest.mockResolvedValueOnce(
      ok({
        ...WORLD_MODEL_FIXTURE,
        generated_at: "2026-03-27T08:00:00.000Z",
        workspace_model: { ...WORLD_MODEL_FIXTURE.workspace_model },
        sources: {
          ...WORLD_MODEL_FIXTURE.sources,
          memory: { days: 0, latest_day: null },
          logs: { entries: 0 },
        },
      }),
    );
    worldModel.build.mockResolvedValueOnce(
      ok({
        ...WORLD_MODEL_FIXTURE,
        generated_at: "2026-03-27T08:30:00.000Z",
        workspace_model: { ...WORLD_MODEL_FIXTURE.workspace_model },
      }),
    );
    db.query
      .mockResolvedValueOnce(ok([{ timestamp: "2026-03-27T09:00:00.000Z" }]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(
        ok([
          {
            snapshot_type: "memory",
            generated_at: "2026-03-27T09:00:00.000Z",
            payload: { day_count: 3, latest_day_key: "2026-03-27" },
          },
        ]),
      )
      .mockResolvedValueOnce(
        ok([
          {
            snapshot_type: "status",
            generated_at: "2026-03-27T09:00:00.000Z",
            payload: {
              exists: true,
              focus_state: {
                activeProject: "projects/threads-bot",
                mode: "focus",
                status: "blocked",
                nextStep: "inspect queue",
              },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        ok([
          {
            snapshot_type: "introspection",
            generated_at: "2026-03-27T09:00:00.000Z",
            payload: { summary: { date: "2026-03-27" } },
          },
        ]),
      )
      .mockResolvedValueOnce(ok([{ count: 12 }]));

    const result = await service.getLatestWorldModel();

    expect(worldModel.build).toHaveBeenCalled();
    expect(result.model.sources.memory.days).toBe(3);
    expect(result.model.sources.logs.entries).toBe(12);
    expect(result.model.workspace_model.active_project).toBe(
      "projects/threads-bot",
    );
    expect(result.model.workspace_model.status).toBe("blocked");
    expect(result.model.workspace_model.next_step).toBe("inspect queue");
    expect(result.model.workspace_model.introspection_date).toBe("2026-03-27");
  });

  it("refreshes stale metrics before generating diagnosis", async () => {
    metrics.snapshot.mockResolvedValueOnce(
      ok({
        ...METRICS_FIXTURE,
        timestamp: "2026-03-27T09:01:00.000Z",
      }),
    );
    diagnosis.analyze.mockResolvedValueOnce(
      ok({
        ...DIAGNOSIS_FIXTURE,
        created_at: "2026-03-27T09:02:00.000Z",
      }),
    );
    db.query
      .mockResolvedValueOnce(
        ok([
          {
            snapshot_id: "snap-old",
            diagnoses: [],
            summary: "cached",
            created_at: "2026-03-27T08:06:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(ok([{ timestamp: "2026-03-27T09:00:00.000Z" }]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]));

    const result = await service.getLatestDiagnosis();

    expect(metrics.snapshot).toHaveBeenCalled();
    expect(diagnosis.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: "2026-03-27T09:01:00.000Z",
      }),
    );
    expect(result.generatedAt).toBe("2026-03-27T09:02:00.000Z");
  });

  it("reads latest diagnosis and generates one on demand when missing", async () => {
    db.query
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]));

    const result = await service.getLatestDiagnosis();
    expect(result.ok).toBe(true);
    expect(result.diagnosis.summary).toBe("No significant issues detected");
    expect(diagnosis.analyze).toHaveBeenCalled();
  });
});
