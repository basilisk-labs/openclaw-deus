import { Test, TestingModule } from "@nestjs/testing";
import { EpisodeService } from "./episode.service";
import { SurrealService } from "../database/surreal.service";
import { EventsService } from "../events/events.service";
import { LLM_PORT } from "../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../llm/llm-decision-policy.service";
import { GraphLinkingService } from "../cognitive/graph-linking.service";
import { mockEventsService } from "../__mocks__/events.mock";
import { ok } from "neverthrow";

describe("EpisodeService", () => {
  let service: EpisodeService;
  let db: jest.Mocked<SurrealService>;
  let graphLinking: jest.Mocked<GraphLinkingService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EpisodeService,
        {
          provide: SurrealService,
          useValue: {
            create: jest
              .fn()
              .mockResolvedValue(
                ok({ id: "episode:test", episode_id: "EP001" }),
              ),
            query: jest.fn().mockResolvedValue(ok([])),
            execute: jest.fn().mockResolvedValue(ok(undefined)),
          },
        },
        { provide: EventsService, useValue: mockEventsService },
        {
          provide: LLM_PORT,
          useValue: {
            isAvailable: jest.fn().mockReturnValue(false),
            complete: jest.fn(),
          },
        },
        {
          provide: LlmDecisionPolicyService,
          useValue: { buildRequest: jest.fn() },
        },
        {
          provide: GraphLinkingService,
          useValue: {
            linkEpisodeToIntention: jest.fn().mockResolvedValue(ok(undefined)),
          },
        },
      ],
    }).compile();

    service = module.get(EpisodeService);
    db = module.get(SurrealService);
    graphLinking = module.get(GraphLinkingService);
  });

  describe("createFromCompletion — episode creation", () => {
    it("should return ok result when creating episode", async () => {
      const result = await service.createFromCompletion(
        "INT001",
        "Fixed the login bug",
        "success",
      );
      expect(result.isOk()).toBe(true);
    });

    it("should persist episode to database with correct table", async () => {
      await service.createFromCompletion("INT001", "Fixed the bug", "success");
      expect(db.create).toHaveBeenCalledWith(
        "episode",
        expect.objectContaining({
          intention_id: "INT001",
          outcome: "success",
          kind: "task_execution",
        }),
      );
    });

    it("should generate sequential episode IDs", async () => {
      await service.createFromCompletion("INT001", "First", "success");
      await service.createFromCompletion("INT001", "Second", "failure");
      const calls = db.create.mock.calls;
      expect(calls[0][1]).toHaveProperty("episode_id", "EP001");
      expect(calls[1][1]).toHaveProperty("episode_id", "EP002");
    });

    it("should set created_at and updated_at timestamps", async () => {
      const before = new Date().toISOString();
      await service.createFromCompletion("INT001", "test", "success");
      const persisted = db.create.mock.calls[0][1] as Record<string, unknown>;
      expect(persisted.created_at).toBeDefined();
      expect(persisted.updated_at).toBeDefined();
    });

    it("should fallback to provided outcome when LLM unavailable", async () => {
      await service.createFromCompletion("INT001", "context", "failure");
      const persisted = db.create.mock.calls[0][1] as Record<string, unknown>;
      expect(persisted.outcome).toBe("failure");
    });

    it("should default outcome to success when LLM unavailable and no outcome given", async () => {
      await service.createFromCompletion("INT001", "context");
      const persisted = db.create.mock.calls[0][1] as Record<string, unknown>;
      expect(persisted.outcome).toBe("success");
    });

    it("should produce empty lessons array in fallback mode", async () => {
      await service.createFromCompletion("INT001", "context", "success");
      const persisted = db.create.mock.calls[0][1] as Record<string, unknown>;
      expect(persisted.lessons).toEqual([]);
    });

    it("should emit episode.created event on success", async () => {
      await service.createFromCompletion("INT001", "context", "success");
      expect(mockEventsService.emit).toHaveBeenCalledWith(
        "episode.created",
        expect.objectContaining({
          outcome: "success",
        }),
      );
    });
  });

  describe("createFromCompletion — predecessor linking", () => {
    it("should set predecessor_episode_id when prior episodes exist", async () => {
      db.query.mockResolvedValue(
        ok([
          {
            episode_id: "EP_PREV",
            intention_id: "INT001",
            outcome: "partial_success",
            created_at: "2026-01-01T00:00:00Z",
          },
        ] as any),
      );

      await service.createFromCompletion("INT001", "Follow-up work", "success");
      const persisted = db.create.mock.calls[0][1] as Record<string, unknown>;
      expect(persisted.predecessor_episode_id).toBe("EP_PREV");
    });

    it("should leave predecessor undefined when no prior episodes", async () => {
      db.query.mockResolvedValue(ok([]));
      await service.createFromCompletion("INT001", "First episode", "success");
      const persisted = db.create.mock.calls[0][1] as Record<string, unknown>;
      expect(persisted.predecessor_episode_id).toBeUndefined();
    });

    it("should call graphLinking to link episode to intention", async () => {
      await service.createFromCompletion("INT001", "context", "success");
      expect(graphLinking.linkEpisodeToIntention).toHaveBeenCalledWith(
        expect.stringMatching(/^EP\d+$/),
        "INT001",
      );
    });
  });

  describe("getSuccessRate", () => {
    it("should return 0.5 when no episodes exist", async () => {
      db.query.mockResolvedValue(ok([]));
      const result = await service.getSuccessRate();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(0.5);
    });

    it("should compute rate from total and successes", async () => {
      db.query.mockResolvedValue(ok([{ total: 10, successes: 8 }] as any));
      const result = await service.getSuccessRate();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(0.8);
    });

    it("should return 0.5 when total is zero", async () => {
      db.query.mockResolvedValue(ok([{ total: 0, successes: 0 }] as any));
      const result = await service.getSuccessRate();
      expect(result._unsafeUnwrap()).toBe(0.5);
    });
  });

  describe("findByIntention", () => {
    it("should query episodes by intention_id", async () => {
      db.query.mockResolvedValue(
        ok([
          { episode_id: "EP001", intention_id: "INT001", outcome: "success" },
        ] as any),
      );
      const result = await service.findByIntention("INT001");
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("intention_id"),
        expect.objectContaining({ id: "INT001" }),
      );
    });
  });

  describe("findRecent", () => {
    it("should query with default limit", async () => {
      db.query.mockResolvedValue(ok([]));
      await service.findRecent();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT"),
        expect.objectContaining({ limit: 20 }),
      );
    });

    it("should respect custom limit", async () => {
      db.query.mockResolvedValue(ok([]));
      await service.findRecent(5);
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ limit: 5 }),
      );
    });
  });
});
