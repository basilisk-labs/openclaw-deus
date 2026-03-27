import { ok, err } from 'neverthrow';
import { ActiveCognitionService } from '../cognition/active-cognition.service';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockDb = {
  query: jest.fn().mockResolvedValue(ok([])),
  create: jest.fn().mockResolvedValue(ok({})),
};

const mockTraceGraph = {
  reactivate: jest.fn().mockResolvedValue(undefined),
  createTrace: jest.fn().mockResolvedValue(ok({ trace_id: 'T_abstract_1' })),
  link: jest.fn().mockResolvedValue(undefined),
};

const mockCausalGraph = {
  build: jest.fn().mockResolvedValue(ok({ nodes: [], edges: [] })),
  getTopVOIBeliefs: jest.fn().mockReturnValue([]),
};

function createService(): ActiveCognitionService {
  return new ActiveCognitionService(
    mockDb as any,
    mockTraceGraph as any,
    mockCausalGraph as any,
  );
}

describe('ActiveCognitionService', () => {
  let svc: ActiveCognitionService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = createService();
  });

  // ═══════════════════════════════════════════
  // replayEpisode
  // ═══════════════════════════════════════════

  describe('replayEpisode()', () => {
    it('returns empty signals when no episodes exist', async () => {
      mockDb.query.mockResolvedValueOnce(ok([]));
      const signals = await svc.replayEpisode(1);
      expect(signals).toEqual([]);
    });

    it('generates replay signal for a successful episode', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          episode_id: 'ep1',
          summary: 'completed task X',
          outcome: 'success',
          intention_id: 'int1',
          lessons: [],
        }]))
        .mockResolvedValueOnce(ok([{ trace_id: 'T_ep1' }]));

      const signals = await svc.replayEpisode(5);
      expect(signals.length).toBeGreaterThanOrEqual(1);
      expect(signals[0].agent_id).toBe('dreaming');
      expect(signals[0].type).toBe('perception');
      expect(signals[0].confidence).toBe(0.4);
      expect(signals[0].novelty_cost).toBe(0);
      expect(signals[0].content).toContain('success');
    });

    it('generates replay signal for a failed episode', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          episode_id: 'ep_fail',
          summary: 'failed attempt',
          outcome: 'failure',
          lessons: [],
        }]))
        .mockResolvedValueOnce(ok([]));

      const signals = await svc.replayEpisode(5);
      expect(signals.length).toBe(1);
      expect(signals[0].content).toContain('failure');
    });

    it('reactivates related traces', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          episode_id: 'ep1',
          summary: 'task',
          outcome: 'success',
          lessons: [],
        }]))
        .mockResolvedValueOnce(ok([{ trace_id: 'T_rel_1' }, { trace_id: 'T_rel_2' }]));

      await svc.replayEpisode(5);
      expect(mockTraceGraph.reactivate).toHaveBeenCalledTimes(2);
      expect(mockTraceGraph.reactivate).toHaveBeenCalledWith('T_rel_1', 0.3, 0);
      expect(mockTraceGraph.reactivate).toHaveBeenCalledWith('T_rel_2', 0.3, 0);
    });

    it('generates lesson signals from episode', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          episode_id: 'ep_learn',
          summary: 'learned something',
          outcome: 'success',
          lessons: [
            { content: 'always check first', confidence: 0.8 },
            { content: 'be careful with X', confidence: 0.6 },
          ],
        }]))
        .mockResolvedValueOnce(ok([]));

      const signals = await svc.replayEpisode(5);
      // 1 replay signal + 2 lesson signals
      expect(signals.length).toBe(3);
      expect(signals[1].type).toBe('prediction');
      expect(signals[1].content).toContain('always check first');
      expect(signals[1].confidence).toBe(0.8);
      expect(signals[2].content).toContain('be careful with X');
    });

    it('round-robins through episodes', async () => {
      const episodes = [
        { episode_id: 'ep1', summary: 'first', outcome: 'success', lessons: [] },
        { episode_id: 'ep2', summary: 'second', outcome: 'failure', lessons: [] },
      ];
      mockDb.query.mockResolvedValue(ok(episodes));

      const signals1 = await svc.replayEpisode(1);
      expect(signals1[0].content).toContain('first');

      const signals2 = await svc.replayEpisode(2);
      expect(signals2[0].content).toContain('second');

      // Wrap around
      const signals3 = await svc.replayEpisode(3);
      expect(signals3[0].content).toContain('first');
    });

    it('returns err gracefully when db fails', async () => {
      mockDb.query.mockResolvedValueOnce(err({ code: 'DB_ERROR', message: 'fail' }));
      const signals = await svc.replayEpisode(1);
      expect(signals).toEqual([]);
    });

    it('sets targets to related trace IDs', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          episode_id: 'ep1', summary: 'task', outcome: 'success', lessons: [],
        }]))
        .mockResolvedValueOnce(ok([{ trace_id: 'T_1' }, { trace_id: 'T_2' }]));

      const signals = await svc.replayEpisode(5);
      expect(signals[0].targets).toEqual(['T_1', 'T_2']);
    });
  });

  // ═══════════════════════════════════════════
  // generateCuriosity
  // ═══════════════════════════════════════════

  describe('generateCuriosity()', () => {
    it('returns empty signals when causal graph is empty', async () => {
      const signals = await svc.generateCuriosity(1);
      expect(signals).toEqual([]);
    });

    it('generates curiosity signal for high VOI beliefs', async () => {
      mockCausalGraph.build.mockResolvedValueOnce(ok({
        nodes: [{ id: 'b1', type: 'belief', label: 'test', confidence: 0.5 }],
        edges: [],
      }));
      mockCausalGraph.getTopVOIBeliefs.mockReturnValueOnce([
        { beliefId: 'b1', label: 'uncertain thing', voi: 0.5 },
      ]);
      // knowledge_gap query
      mockDb.query.mockResolvedValueOnce(ok([]));

      const signals = await svc.generateCuriosity(5);
      expect(signals.length).toBe(1);
      expect(signals[0].agent_id).toBe('curiosity');
      expect(signals[0].type).toBe('affect');
      expect(signals[0].content).toContain('uncertain thing');
      expect(signals[0].payload.curiosity).toBe(true);
    });

    it('filters out low VOI beliefs (< 0.15)', async () => {
      mockCausalGraph.build.mockResolvedValueOnce(ok({
        nodes: [{ id: 'b1', type: 'belief', label: 'low', confidence: 0.9 }],
        edges: [],
      }));
      mockCausalGraph.getTopVOIBeliefs.mockReturnValueOnce([
        { beliefId: 'b1', label: 'known thing', voi: 0.05 },
      ]);
      mockDb.query.mockResolvedValueOnce(ok([]));

      const signals = await svc.generateCuriosity(5);
      expect(signals).toEqual([]);
    });

    it('generates curiosity for knowledge gaps with high impact', async () => {
      // build must return non-empty nodes to avoid early return
      mockCausalGraph.build.mockResolvedValueOnce(ok({
        nodes: [{ id: 'n1', type: 'belief', label: 'x', confidence: 0.5 }],
        edges: [],
      }));
      mockCausalGraph.getTopVOIBeliefs.mockReturnValueOnce([]); // no VOI signals
      // knowledge_gap query
      mockDb.query.mockResolvedValueOnce(ok([
        { description: 'missing domain info', domain: 'tech', impact: 0.8 },
      ]));

      const signals = await svc.generateCuriosity(5);
      expect(signals.length).toBe(1);
      expect(signals[0].content).toContain('missing domain info');
      expect(signals[0].payload.domain).toBe('tech');
    });

    it('ignores knowledge gaps with low impact (< 0.6)', async () => {
      mockCausalGraph.build.mockResolvedValueOnce(ok({
        nodes: [{ id: 'n1', type: 'belief', label: 'x', confidence: 0.5 }],
        edges: [],
      }));
      mockCausalGraph.getTopVOIBeliefs.mockReturnValueOnce([]);
      mockDb.query.mockResolvedValueOnce(ok([
        { description: 'minor gap', domain: 'misc', impact: 0.3 },
      ]));

      const signals = await svc.generateCuriosity(5);
      expect(signals).toEqual([]);
    });

    it('combines VOI and knowledge gap signals', async () => {
      mockCausalGraph.build.mockResolvedValueOnce(ok({
        nodes: [{ id: 'b1', type: 'belief', label: 'uncertain', confidence: 0.5 }],
        edges: [],
      }));
      mockCausalGraph.getTopVOIBeliefs.mockReturnValueOnce([
        { beliefId: 'b1', label: 'uncertain', voi: 0.3 },
      ]);
      mockDb.query.mockResolvedValueOnce(ok([
        { description: 'big gap', domain: 'tech', impact: 0.9 },
      ]));

      const signals = await svc.generateCuriosity(5);
      expect(signals.length).toBe(2);
    });

    it('handles causal graph build error gracefully', async () => {
      // build returns err → early return from try block, but knowledge gaps still queried
      // Actually, err causes `return signals` inside the try, so knowledge gaps are NOT reached.
      // But if build throws, the catch catches it and execution continues to knowledge gaps.
      mockCausalGraph.build.mockRejectedValueOnce(new Error('build failed'));
      mockDb.query.mockResolvedValueOnce(ok([]));
      const signals = await svc.generateCuriosity(5);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // activeInference
  // ═══════════════════════════════════════════

  describe('activeInference()', () => {
    it('returns empty signals when no strong chains exist', async () => {
      mockDb.query.mockResolvedValueOnce(ok([]));
      const signals = await svc.activeInference(5);
      expect(signals).toEqual([]);
    });

    it('generates inference signal when conclusion is weaker than expected', async () => {
      mockDb.query
        // chains query
        .mockResolvedValueOnce(ok([{
          premise_a: 'all humans are mortal',
          conclusion: 'socrates is mortal',
          strength: 0.8,
          a_id: 'T_premise',
          b_id: 'T_conclusion',
        }]))
        // conclusion trace query — weight lower than expected (0.8 * 0.7 = 0.56 expected, 0.2 actual)
        .mockResolvedValueOnce(ok([{ weight: 0.2, confidence: 0.3 }]));

      const signals = await svc.activeInference(5);
      expect(signals.length).toBe(1);
      expect(signals[0].agent_id).toBe('inference');
      expect(signals[0].type).toBe('prediction');
      expect(signals[0].content).toContain('strongly implies');
      expect(signals[0].targets).toContain('T_premise');
      expect(signals[0].targets).toContain('T_conclusion');
    });

    it('does not generate signal when conclusion weight matches edge strength', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          premise_a: 'A',
          conclusion: 'B',
          strength: 0.6,
          a_id: 'T_a',
          b_id: 'T_b',
        }]))
        // weight matches: 0.6 * 0.7 = 0.42, actual = 0.5 → not weak
        .mockResolvedValueOnce(ok([{ weight: 0.5, confidence: 0.7 }]));

      const signals = await svc.activeInference(5);
      expect(signals).toEqual([]);
    });

    it('handles db error on chains query', async () => {
      mockDb.query.mockResolvedValueOnce(err({ code: 'ERR', message: 'fail' }));
      const signals = await svc.activeInference(5);
      expect(signals).toEqual([]);
    });

    it('inference confidence is proportional to edge strength', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          premise_a: 'strong premise',
          conclusion: 'weak conclusion',
          strength: 0.9,
          a_id: 'T_strong',
          b_id: 'T_weak',
        }]))
        .mockResolvedValueOnce(ok([{ weight: 0.1, confidence: 0.2 }]));

      const signals = await svc.activeInference(5);
      expect(signals[0].confidence).toBeCloseTo(0.9 * 0.6, 2);
    });
  });

  // ═══════════════════════════════════════════
  // detectSchemas
  // ═══════════════════════════════════════════

  describe('detectSchemas()', () => {
    it('returns empty signals when no hot edges', async () => {
      // hotEdges query
      mockDb.query.mockResolvedValueOnce(ok([]));
      const signals = await svc.detectSchemas(5);
      expect(signals).toEqual([]);
    });

    it('generates schema signal for co-activation count > 3 (but <= 5)', async () => {
      // co_activation_count = 4 → schema signal but NO materialization (needs > 5)
      mockDb.query
        .mockResolvedValueOnce(ok([{
          a_content: 'round ball xyz',
          b_content: 'round plate abc',
          co_activation_count: 4,
          weight: 0.7,
          a_id: 'T_ball',
          b_id: 'T_plate',
        }]))
        // detectPropertyAbstractions active traces query
        .mockResolvedValueOnce(ok([]));

      const signals = await svc.detectSchemas(5);
      expect(signals.length).toBe(1);
      expect(signals[0].agent_id).toBe('schema');
      expect(signals[0].type).toBe('strategy');
      expect(signals[0].content).toContain('Pattern');
      expect(signals[0].payload.schema).toBe(true);
    });

    it('does not generate signal for co_activation_count <= 3', async () => {
      mockDb.query
        .mockResolvedValueOnce(ok([{
          a_content: 'alpha', b_content: 'beta',
          co_activation_count: 3, weight: 0.5,
          a_id: 'T_a', b_id: 'T_b',
        }]))
        // detectPropertyAbstractions active traces query
        .mockResolvedValueOnce(ok([]));

      const signals = await svc.detectSchemas(5);
      expect(signals).toEqual([]);
    });

    it('confidence caps at 0.9', async () => {
      mockDb.query
        // hotEdges query — co_activation_count=20 > 5 so materializeAbstraction runs
        .mockResolvedValueOnce(ok([{
          a_content: 'frequent alpha', b_content: 'frequent beta',
          co_activation_count: 20, weight: 0.9,
          a_id: 'T_fa', b_id: 'T_fb',
        }]))
        // existing abstraction check (shared word = "frequent") — return existing to skip creation
        .mockResolvedValueOnce(ok([{ trace_id: 'T_exists' }]))
        // detectPropertyAbstractions active traces query
        .mockResolvedValueOnce(ok([]));

      const signals = await svc.detectSchemas(5);
      expect(signals[0].confidence).toBeLessThanOrEqual(0.9);
    });
  });

  // ═══════════════════════════════════════════
  // materializeAbstraction (indirect via detectSchemas)
  // ═══════════════════════════════════════════

  describe('materializeAbstraction (via detectSchemas)', () => {
    it('creates abstract trace for co_activation_count > 5 with shared words', async () => {
      // hotEdges query: co_activation_count > 5, shared word = "round" (len > 3)
      mockDb.query
        .mockResolvedValueOnce(ok([{
          a_content: 'round ball object',
          b_content: 'round plate object',
          co_activation_count: 7,
          weight: 0.8,
          a_id: 'T_ball',
          b_id: 'T_plate',
        }]))
        // existing abstraction check — not found
        .mockResolvedValueOnce(ok([]))
        // detectPropertyAbstractions active traces query
        .mockResolvedValueOnce(ok([]));

      mockTraceGraph.createTrace.mockResolvedValueOnce(ok({ trace_id: 'T_abstract_round' }));

      await svc.detectSchemas(5);

      expect(mockTraceGraph.createTrace).toHaveBeenCalledWith(expect.objectContaining({
        source_type: 'signal',
        initial_weight: 0.7,
      }));
      // Should link instances to abstract hub (4 links: 2 forward + 2 backward)
      expect(mockTraceGraph.link).toHaveBeenCalled();
    });

    it('does not create duplicate abstraction', async () => {
      mockDb.query
        // hotEdges query
        .mockResolvedValueOnce(ok([{
          a_content: 'round ball object',
          b_content: 'round plate object',
          co_activation_count: 7,
          weight: 0.8,
          a_id: 'T_ball',
          b_id: 'T_plate',
        }]))
        // existing abstraction check returns existing → skip materialization
        .mockResolvedValueOnce(ok([{ trace_id: 'T_already_exists' }]))
        // detectPropertyAbstractions active traces query
        .mockResolvedValueOnce(ok([]));

      await svc.detectSchemas(5);
      expect(mockTraceGraph.createTrace).not.toHaveBeenCalled();
    });

    it('skips abstraction when no shared words longer than 3 chars', async () => {
      mockDb.query
        // hotEdges query — no shared words > 3 chars between a and b
        .mockResolvedValueOnce(ok([{
          a_content: 'alpha bravo charlie',
          b_content: 'delta foxtrot gamma',
          co_activation_count: 7,
          weight: 0.8,
          a_id: 'T_ab',
          b_id: 'T_gd',
        }]))
        // detectPropertyAbstractions active traces query
        .mockResolvedValueOnce(ok([]));

      await svc.detectSchemas(5);
      // No shared words → materializeAbstraction returns early → no createTrace
      expect(mockTraceGraph.createTrace).not.toHaveBeenCalled();
    });
  });
});
