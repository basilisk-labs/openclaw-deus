import { CausalGraphService } from '../causal-graph.service';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';
import { CausalGraph } from '../../common/types/cognitive-config.types';

const mockDb = {
  query: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }),
};

function createService(): CausalGraphService {
  return new CausalGraphService(mockDb as any, mockCognitiveConfig as any);
}

/** Helper to build a test graph */
function makeGraph(
  nodes: CausalGraph['nodes'] = [],
  edges: CausalGraph['edges'] = [],
): CausalGraph {
  return { nodes, edges };
}

describe('CausalGraphService', () => {
  let svc: CausalGraphService;

  beforeEach(() => {
    svc = createService();
    jest.clearAllMocks();
  });

  // --- computeVOI ---
  describe('computeVOI()', () => {
    it('returns 0 for unknown belief', () => {
      const graph = makeGraph();
      expect(svc.computeVOI('nonexistent', graph)).toBe(0);
    });

    it('returns > 0 for uncertain belief with downstream nodes', () => {
      const graph = makeGraph(
        [
          { id: 'belief:a', type: 'belief', label: 'A', confidence: 0.5 },
          { id: 'belief:b', type: 'belief', label: 'B', confidence: 0.5 },
        ],
        [{ from: 'belief:a', to: 'belief:b', weight: 0.8 }],
      );
      const voi = svc.computeVOI('a', graph);
      expect(voi).toBeGreaterThan(0);
    });
  });

  // --- predictGoalSuccess ---
  describe('predictGoalSuccess()', () => {
    it('returns ~0.5 for goal not in graph', () => {
      const graph = makeGraph();
      const pred = svc.predictGoalSuccess('missing', graph);
      expect(pred.success_probability).toBeCloseTo(0.5, 1);
      expect(pred.blockers).toContain('goal_not_in_graph');
    });

    it('includes blockers for negative edges', () => {
      const graph = makeGraph(
        [
          { id: 'belief:goal1', type: 'belief', label: 'Goal', confidence: 0.8 },
          { id: 'belief:blocker', type: 'belief', label: 'BlockerLabel', confidence: 0.6 },
        ],
        [{ from: 'belief:blocker', to: 'belief:goal1', weight: -0.7 }],
      );
      const pred = svc.predictGoalSuccess('goal1', graph);
      expect(pred.blockers).toContain('BlockerLabel');
    });
  });

  // --- getTopVOIBeliefs ---
  describe('getTopVOIBeliefs()', () => {
    it('returns sorted by VOI descending', () => {
      const graph = makeGraph(
        [
          { id: 'belief:low', type: 'belief', label: 'Low', confidence: 0.95 },
          { id: 'belief:high', type: 'belief', label: 'High', confidence: 0.3 },
          { id: 'belief:downstream', type: 'belief', label: 'Down', confidence: 0.4 },
        ],
        [{ from: 'belief:high', to: 'belief:downstream', weight: 0.9 }],
      );
      const top = svc.getTopVOIBeliefs(graph, 10);
      // 'high' has downstream + uncertainty => highest VOI
      // verify descending order
      for (let i = 1; i < top.length; i++) {
        expect(top[i - 1].voi).toBeGreaterThanOrEqual(top[i].voi);
      }
    });

    it('respects k parameter', () => {
      const nodes = Array.from({ length: 10 }, (_, i) => ({
        id: `belief:b${i}`, type: 'belief' as const, label: `B${i}`, confidence: 0.5,
      }));
      const graph = makeGraph(nodes, []);
      const top3 = svc.getTopVOIBeliefs(graph, 3);
      expect(top3).toHaveLength(3);
    });
  });

  // --- getDescendants ---
  describe('getDescendants()', () => {
    it('returns empty for leaf node', () => {
      const graph = makeGraph(
        [{ id: 'belief:leaf', type: 'belief', label: 'Leaf', confidence: 0.8 }],
        [],
      );
      const desc = (svc as any).getDescendants('belief:leaf', graph);
      expect(desc).toHaveLength(0);
    });

    it('follows outgoing edges', () => {
      const graph = makeGraph(
        [
          { id: 'belief:root', type: 'belief', label: 'Root', confidence: 0.5 },
          { id: 'belief:child', type: 'belief', label: 'Child', confidence: 0.5 },
          { id: 'belief:grandchild', type: 'belief', label: 'GC', confidence: 0.5 },
        ],
        [
          { from: 'belief:root', to: 'belief:child', weight: 0.5 },
          { from: 'belief:child', to: 'belief:grandchild', weight: 0.5 },
        ],
      );
      const desc = (svc as any).getDescendants('belief:root', graph);
      expect(desc).toHaveLength(2);
      const ids = desc.map((n: any) => n.id);
      expect(ids).toContain('belief:child');
      expect(ids).toContain('belief:grandchild');
    });
  });

  // --- build() with empty DB ---
  describe('build()', () => {
    it('returns empty nodes + edges when DB returns empty', async () => {
      const result = await svc.build();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nodes).toHaveLength(0);
        expect(result.value.edges).toHaveLength(0);
      }
    });
  });
});
