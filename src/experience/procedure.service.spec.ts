import { Test, TestingModule } from "@nestjs/testing";
import { ok } from "neverthrow";
import { ProcedureService } from "./procedure.service";
import { SurrealService } from "../database/surreal.service";
import { CognitiveConfigService } from "../cognitive/cognitive-config.service";
import { LLM_PORT } from "../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../llm/llm-decision-policy.service";
import { mockCognitiveConfig } from "../__mocks__/cognitive-config.mock";

describe("ProcedureService", () => {
  let service: ProcedureService;
  const db = {
    query: jest.fn(),
    create: jest.fn().mockResolvedValue(ok({ procedure_id: "PROC001" })),
  };
  const llm = {
    isAvailable: jest.fn(),
    complete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcedureService,
        { provide: SurrealService, useValue: db },
        { provide: LLM_PORT, useValue: llm },
        {
          provide: LlmDecisionPolicyService,
          useValue: { buildRequest: jest.fn().mockReturnValue({}) },
        },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
      ],
    }).compile();

    service = module.get(ProcedureService);
  });

  it("returns empty list when LLM is unavailable", async () => {
    db.query.mockResolvedValueOnce(
      ok([
        {
          episode_id: "EP001",
          summary: "One",
          lessons: [{ content: "a", kind: "procedural" }],
        },
        {
          episode_id: "EP002",
          summary: "Two",
          lessons: [{ content: "b", kind: "procedural" }],
        },
      ]),
    );
    llm.isAvailable.mockReturnValue(false);

    const result = await service.extractFromEpisodes();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });
});
