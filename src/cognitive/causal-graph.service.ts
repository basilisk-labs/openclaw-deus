import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { GoalPrediction } from '../common/types/cognitive.types';
import { CausalNode, CausalEdge, CausalGraph } from '../common/types/cognitive-config.types';
import { CognitiveConfigService } from './cognitive-config.service';

@Injectable()
export class CausalGraphService {
  private readonly logger = new Logger(CausalGraphService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  /**
   * Build causal graph from beliefs + policy decisions + outcomes.
   */
  async build(): Promise<Result<CausalGraph, DomainError>> {
    const nodes: CausalNode[] = [];
    const edges: CausalEdge[] = [];

    // Beliefs as nodes
    const beliefs = await this.db.query<{ belief_id: string; content: string; confidence: number }>(
      `SELECT belief_id, content, confidence FROM belief WHERE status = 'active'`,
    );
    if (beliefs.isOk()) {
      for (const b of beliefs.value) {
        nodes.push({ id: `belief:${b.belief_id}`, type: 'belief', label: b.content, confidence: b.confidence });
      }
    }

    // Policy decisions as action nodes
    const decisions = await this.db.query<{ id: string; action_type: string; decision: string; ripeness_score: number }>(
      'SELECT id, action_type, decision, ripeness_score, evaluated_at FROM policy_decision ORDER BY evaluated_at DESC LIMIT $limit',
      { limit: this.config.get('query.causal_decision_limit') },
    );
    if (decisions.isOk()) {
      for (const d of decisions.value) {
        const nodeId = `action:${d.id}`;
        nodes.push({ id: nodeId, type: 'action', label: `${d.action_type}:${d.decision}`, confidence: d.ripeness_score || 0.5 });
      }
    }

    // Build edges: beliefs that support graph relations
    const supports = await this.db.query<{ in_id: string; out_id: string; weight: number }>(
      `SELECT in AS in_id, out AS out_id, 0.8 AS weight FROM supports`,
    );
    if (supports.isOk()) {
      for (const s of supports.value) {
        edges.push({ from: String(s.in_id), to: String(s.out_id), weight: s.weight });
      }
    }

    // Contradiction edges (negative weight)
    const contradictions = await this.db.query<{ in_id: string; out_id: string; degree: number }>(
      `SELECT in AS in_id, out AS out_id, degree FROM tensions`,
    );
    if (contradictions.isOk()) {
      for (const c of contradictions.value) {
        edges.push({ from: String(c.in_id), to: String(c.out_id), weight: -(c.degree || 0.5) });
      }
    }

    return ok({ nodes, edges });
  }

  /**
   * Value of Information: how much would resolving a belief's uncertainty
   * improve downstream predictions?
   */
  computeVOI(beliefId: string, graph: CausalGraph): number {
    const node = graph.nodes.find(n => n.id === `belief:${beliefId}`);
    if (!node) return 0;

    const currentUncertainty = 1 - node.confidence;
    if (currentUncertainty < 0.05) return 0; // already very certain

    // Find downstream nodes
    const downstream = this.getDescendants(`belief:${beliefId}`, graph);
    if (downstream.length === 0) return currentUncertainty; // no downstream = raw uncertainty

    // VOI = sum of (uncertainty reduction × edge weight) for downstream
    let totalImprovement = 0;
    for (const desc of downstream) {
      const edge = graph.edges.find(e => e.from === `belief:${beliefId}` && e.to === desc.id);
      const edgeWeight = edge ? Math.abs(edge.weight) : 0.3;
      const descUncertainty = 1 - desc.confidence;
      const improvement = descUncertainty * currentUncertainty * edgeWeight;
      totalImprovement += improvement;
    }

    return totalImprovement / downstream.length;
  }

  /**
   * Top-K beliefs by Value of Information.
   * "What should I learn next to be most useful?"
   */
  getTopVOIBeliefs(graph: CausalGraph, k = 5): Array<{ beliefId: string; voi: number; label: string }> {
    return graph.nodes
      .filter(n => n.type === 'belief')
      .map(n => ({
        beliefId: n.id.replace('belief:', ''),
        voi: this.computeVOI(n.id.replace('belief:', ''), graph),
        label: n.label,
      }))
      .sort((a, b) => b.voi - a.voi)
      .slice(0, k);
  }

  /**
   * Predict goal success probability by traversing causal paths.
   */
  predictGoalSuccess(goalBeliefId: string, graph: CausalGraph): GoalPrediction {
    const goalNode = graph.nodes.find(n => n.id === `belief:${goalBeliefId}`);
    if (!goalNode) {
      return { goal_id: goalBeliefId, success_probability: 0.5, blockers: ['goal_not_in_graph'], suggested_next_action: 'gather more data' };
    }

    // Find supporting beliefs (incoming edges with positive weight)
    const supporters = graph.edges
      .filter(e => e.to === goalNode.id && e.weight > 0)
      .map(e => ({ node: graph.nodes.find(n => n.id === e.from), weight: e.weight }))
      .filter(s => s.node);

    // Find blockers (incoming edges with negative weight)
    const blockers = graph.edges
      .filter(e => e.to === goalNode.id && e.weight < 0)
      .map(e => graph.nodes.find(n => n.id === e.from)?.label || e.from);

    // Success = product of supporter confidences × weights
    let successProb = goalNode.confidence;
    for (const s of supporters) {
      if (s.node) {
        successProb *= (s.node.confidence * s.weight);
      }
    }
    successProb = Math.max(0.05, Math.min(0.95, successProb));

    return {
      goal_id: goalBeliefId,
      success_probability: Math.round(successProb * 1000) / 1000,
      blockers,
      suggested_next_action: blockers.length > 0 ? `Address: ${blockers[0]}` : 'Continue current approach',
    };
  }

  private getDescendants(nodeId: string, graph: CausalGraph): CausalNode[] {
    const visited = new Set<string>();
    const result: CausalNode[] = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const outgoing = graph.edges.filter(e => e.from === current);
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          const node = graph.nodes.find(n => n.id === edge.to);
          if (node) {
            result.push(node);
            queue.push(edge.to);
          }
        }
      }
    }

    return result;
  }
}
