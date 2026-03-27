import { Inject, Injectable, Logger } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import { DomainError } from "../common/types/result.types";
import { SurrealService } from "../database/surreal.service";
import { LLM_PORT } from "../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../llm/llm-decision-policy.service";
import { LLMPort } from "../llm/types/llm-port.types";
import { LlmOperationType, LlmPriority } from "../llm/types/llm.types";
import { CognitiveConfigService } from "../cognitive/cognitive-config.service";
import {
  CognitiveSnapshot,
  DimensionName,
  DIMENSION_THRESHOLDS,
} from "./metrics.types";
import {
  Diagnosis,
  DiagnosisResult,
  DiagnosisSeverity,
  Hypothesis,
  RootCause,
  ParamChange,
} from "./diagnosis.types";

const DIAGNOSIS_SYSTEM_PROMPT = `You are the self-diagnosis module of a cognitive agent called DEUS.
You analyze cognitive metrics snapshots to identify weaknesses and propose improvements.

Your analysis operates at TWO levels:
1. PARAMETER level — a config value is suboptimal (e.g., threshold too high, decay too fast)
2. LOGIC level — the cognitive algorithm itself has a structural weakness (e.g., deliberation ignores temporal context, extraction misses implicit knowledge)

For each weakness found, provide:
- Which dimension is affected
- Severity (low/medium/high/critical)
- Root cause classification (parameter/logic/data/architecture)
- One or more hypotheses for improvement

For parameter hypotheses: specify exact param key, current value, proposed value.
For logic hypotheses: describe the structural change needed, which service/method to modify, and a pseudocode sketch.

Be specific and actionable. Prefer the simplest fix that addresses the root cause.`;

const DIAGNOSIS_TOOL = {
  name: "diagnose",
  description:
    "Analyze cognitive metrics and produce diagnoses with improvement hypotheses",
  input_schema: {
    type: "object" as const,
    properties: {
      diagnoses: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            dimension: { type: "string" as const },
            severity: {
              type: "string" as const,
              enum: ["low", "medium", "high", "critical"],
            },
            description: { type: "string" as const },
            root_cause: {
              type: "string" as const,
              enum: ["parameter", "logic", "data", "architecture"],
            },
            hypotheses: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  type: {
                    type: "string" as const,
                    enum: [
                      "param_adjustment",
                      "logic_extension",
                      "new_stage",
                      "strategy_change",
                    ],
                  },
                  description: { type: "string" as const },
                  target_service: { type: "string" as const },
                  target_method: { type: "string" as const },
                  expected_improvement: { type: "string" as const },
                  confidence: { type: "number" as const },
                  param_changes: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      properties: {
                        key: { type: "string" as const },
                        from: { type: "number" as const },
                        to: { type: "number" as const },
                      },
                      required: ["key", "from", "to"],
                    },
                  },
                  logic_proposal: { type: "string" as const },
                  code_sketch: { type: "string" as const },
                },
                required: [
                  "type",
                  "description",
                  "target_service",
                  "expected_improvement",
                  "confidence",
                ],
              },
            },
          },
          required: [
            "dimension",
            "severity",
            "description",
            "root_cause",
            "hypotheses",
          ],
        },
      },
      summary: { type: "string" as const },
    },
    required: ["diagnoses", "summary"],
  },
};

@Injectable()
export class DiagnosisService {
  private readonly logger = new Logger(DiagnosisService.name);

  constructor(
    private readonly db: SurrealService,
    @Inject(LLM_PORT) private readonly llm: LLMPort,
    private readonly llmDecision: LlmDecisionPolicyService,
    private readonly config: CognitiveConfigService,
  ) {}

  async analyze(
    snapshot: CognitiveSnapshot,
  ): Promise<Result<DiagnosisResult, DomainError>> {
    const now = new Date().toISOString();

    // Always run rule-based diagnosis
    const ruleDiagnoses = this.runRuleBasedDiagnosis(snapshot);

    // If LLM available, run deep diagnosis
    let llmDiagnoses: Diagnosis[] = [];
    if (this.llm.isAvailable()) {
      const llmResult = await this.runLlmDiagnosis(snapshot);
      if (llmResult.isOk()) {
        llmDiagnoses = llmResult.value;
      }
    }

    // Merge: deduplicate by dimension, prefer LLM diagnosis if both exist
    const merged = this.mergeDiagnoses(ruleDiagnoses, llmDiagnoses);

    // Assign IDs to hypotheses
    let hypIdx = 0;
    for (const diag of merged) {
      for (const hyp of diag.hypotheses) {
        hyp.id = `hyp_${Date.now()}_${hypIdx++}`;
      }
      diag.created_at = now;
    }

    const result: DiagnosisResult = {
      snapshot_id: snapshot.id || snapshot.timestamp,
      diagnoses: merged,
      summary:
        merged.length > 0
          ? `Found ${merged.length} issues: ${merged.map((d) => `${d.dimension}(${d.severity})`).join(", ")}`
          : "No significant issues detected",
      created_at: now,
    };

    await this.db.create(
      "diagnosis",
      result as unknown as Record<string, unknown>,
    );
    this.logger.log(`Diagnosis: ${merged.length} issues found`);
    return ok(result);
  }

  /**
   * Rule-based diagnosis: pure metric analysis without LLM.
   */
  runRuleBasedDiagnosis(snapshot: CognitiveSnapshot): Diagnosis[] {
    const diagnoses: Diagnosis[] = [];
    const dims = snapshot.dimensions;

    // Coherence issues
    if (dims.coherence.score < DIMENSION_THRESHOLDS.coherence) {
      const hyps: Hypothesis[] = [];

      // If posture is unknown, no introspection has ever run — that's the root cause
      if (dims.coherence.posture === "unknown") {
        hyps.push({
          id: "",
          type: "logic_extension",
          description:
            "Run introspection on first boot to establish coherence baseline",
          target_service: "NightlyService",
          target_method: "run",
          expected_improvement:
            "Coherence score reflects actual belief state instead of default 0.5",
          confidence: 0.9,
          logic_proposal:
            'BootstrapService should trigger IntrospectionService.run("full") after seeding beliefs. This ensures coherence_score and posture are computed from day one.',
        });
      }

      if (dims.coherence.contradictions > 3) {
        hyps.push({
          id: "",
          type: "param_adjustment",
          description: "Increase contradiction detection sensitivity",
          target_service: "BeliefContradictionService",
          expected_improvement:
            "Reduce contradictions by catching them earlier",
          confidence: 0.6,
          param_changes: [
            {
              key: "similarity.contradiction_content",
              from: this.config.get("similarity.contradiction_content"),
              to: Math.max(
                0.3,
                this.config.get("similarity.contradiction_content") - 0.05,
              ),
            },
          ],
        });
      }
      if (dims.beliefs.avg_confidence < 0.5) {
        hyps.push({
          id: "",
          type: "param_adjustment",
          description: "Slow down belief decay to preserve confidence",
          target_service: "BeliefDecayService",
          expected_improvement: "Higher average belief confidence",
          confidence: 0.5,
          param_changes: [
            {
              key: "decay.rate_normal",
              from: this.config.get("decay.rate_normal"),
              to: Math.max(0.001, this.config.get("decay.rate_normal") * 0.7),
            },
          ],
        });
      }
      diagnoses.push({
        dimension: "coherence",
        severity: dims.coherence.score < 0.4 ? "critical" : "high",
        description: `Coherence ${dims.coherence.score} below threshold (posture: ${dims.coherence.posture})`,
        root_cause: "parameter",
        hypotheses: hyps,
        created_at: "",
      });
    }

    // Calibration issues
    if (dims.calibration.ece > 0.15 && dims.calibration.sample_size >= 10) {
      diagnoses.push({
        dimension: "calibration",
        severity: dims.calibration.ece > 0.25 ? "high" : "medium",
        description: `ECE=${dims.calibration.ece}, ${dims.calibration.overconfident ? "overconfident" : "underconfident"}`,
        root_cause: "parameter",
        hypotheses: [
          {
            id: "",
            type: "param_adjustment",
            description: dims.calibration.overconfident
              ? "Reduce learning rate to temper overconfidence"
              : "Increase learning rate to boost underconfidence",
            target_service: "CognitiveConfigService",
            expected_improvement: "Better calibrated predictions (lower ECE)",
            confidence: 0.7,
            param_changes: [
              {
                key: "bayesian.learning_rate",
                from: this.config.get("bayesian.learning_rate"),
                to: dims.calibration.overconfident
                  ? Math.max(
                      0.05,
                      this.config.get("bayesian.learning_rate") - 0.05,
                    )
                  : Math.min(
                      0.8,
                      this.config.get("bayesian.learning_rate") + 0.05,
                    ),
              },
            ],
          },
        ],
        created_at: "",
      });
    }

    // Episode success rate dropping
    if (dims.episodes.total >= 5 && dims.episodes.success_rate < 0.5) {
      diagnoses.push({
        dimension: "episodes",
        severity: dims.episodes.success_rate < 0.3 ? "critical" : "high",
        description: `Success rate ${dims.episodes.success_rate} — declining performance`,
        root_cause: "logic",
        hypotheses: [
          {
            id: "",
            type: "logic_extension",
            description:
              "Add failure pattern analysis to deliberation: before selecting an approach, check similar past episodes and avoid strategies that failed",
            target_service: "DeliberationService",
            target_method: "deliberate",
            expected_improvement:
              "Higher success rate by learning from past failures",
            confidence: 0.6,
            logic_proposal:
              "Before generating options, query recent failed episodes with similar intentions. Add failure patterns as negative constraints to the LLM deliberation prompt.",
            code_sketch: `// In DeliberationService.deliberate():\nconst failedEpisodes = await this.episodes.findSimilarFailed(intention.description);\nconst avoidPatterns = failedEpisodes.map(e => e.lessons.filter(l => l.kind === 'failure'));\n// Add to system prompt: "Avoid approaches similar to: ..."`,
          },
        ],
        created_at: "",
      });
    }

    // Knowledge gaps accumulating
    if (dims.knowledge.gaps_open > 10) {
      diagnoses.push({
        dimension: "knowledge",
        severity: dims.knowledge.gaps_high_impact > 5 ? "high" : "medium",
        description: `${dims.knowledge.gaps_open} open knowledge gaps (${dims.knowledge.gaps_high_impact} high-impact)`,
        root_cause: "logic",
        hypotheses: [
          {
            id: "",
            type: "new_stage",
            description:
              "Add a knowledge gap triage stage to nightly: auto-close stale gaps, merge duplicates, prioritize by dependency count",
            target_service: "NightlyService",
            expected_improvement:
              "Reduced gap count, better signal-to-noise in knowledge gaps",
            confidence: 0.7,
            logic_proposal:
              "New nightly stage: iterate open gaps, close those older than 14 days with no linked intentions, merge gaps with >0.8 similarity, sort by impact * dependency_count.",
          },
        ],
        created_at: "",
      });
    }

    // Stale intentions
    if (dims.intentions.stale_count > 5) {
      diagnoses.push({
        dimension: "intentions",
        severity: "medium",
        description: `${dims.intentions.stale_count} stale intentions (no update in 3+ days)`,
        root_cause: "logic",
        hypotheses: [
          {
            id: "",
            type: "strategy_change",
            description:
              "Auto-suspend intentions stale > 7 days, auto-abandon > 14 days",
            target_service: "IntentionStackService",
            target_method: "autoAdopt",
            expected_improvement: "Cleaner intention stack, reduced noise",
            confidence: 0.8,
            logic_proposal:
              'In autoAdopt(), add sweep: intentions with status "recognized" and updated_at < 7d → suspend. status "suspended" and updated_at < 14d → abandon.',
          },
        ],
        created_at: "",
      });
    }

    // World model stale
    if (dims.world_model.freshness_hours > 12) {
      const currentStale = this.config.get("worldmodel.stale_after_hours");
      diagnoses.push({
        dimension: "world_model",
        severity: dims.world_model.freshness_hours > 48 ? "high" : "low",
        description: `World model ${Math.round(dims.world_model.freshness_hours)}h old`,
        root_cause:
          dims.world_model.freshness_hours > 100 ? "logic" : "parameter",
        hypotheses:
          dims.world_model.freshness_hours > 100
            ? [
                {
                  id: "",
                  type: "logic_extension" as const,
                  description:
                    "Trigger world model rebuild on every pipeline run, not just nightly",
                  target_service: "CognitivePipelineService",
                  target_method: "processMessage",
                  expected_improvement:
                    "World model always fresh during active use",
                  confidence: 0.7,
                  logic_proposal:
                    "After step 4 (auto-adopt), check if world model is stale. If so, trigger WorldModelService.build() as a non-blocking fire-and-forget.",
                  code_sketch: `// At end of processMessage():\nconst wm = await this.worldModel.getLatest();\nif (!wm.isOk() || !wm.value || !this.worldModel.isFresh(wm.value)) {\n  this.worldModel.build().catch(() => {});\n}`,
                },
              ]
            : [
                {
                  id: "",
                  type: "param_adjustment" as const,
                  description: "Reduce world model staleness threshold",
                  target_service: "CognitiveConfigService",
                  expected_improvement: "More frequent world model rebuilds",
                  confidence: 0.5,
                  param_changes: [
                    {
                      key: "worldmodel.stale_after_hours",
                      from: currentStale,
                      to: Math.max(1, currentStale * 0.85), // 15% reduction — within 20% safety limit
                    },
                  ],
                },
              ],
        created_at: "",
      });
    }

    return diagnoses;
  }

  private async runLlmDiagnosis(
    snapshot: CognitiveSnapshot,
  ): Promise<Result<Diagnosis[], DomainError>> {
    // Gather context
    const [historyResult, episodesResult, nightlyResult] = await Promise.all([
      this.db.query<CognitiveSnapshot>(
        "SELECT * FROM cognitive_snapshot ORDER BY timestamp DESC LIMIT 3",
      ),
      this.db.query<any>(
        "SELECT * FROM episode ORDER BY created_at DESC LIMIT 20",
      ),
      this.db.query<any>(
        "SELECT * FROM nightly_run ORDER BY started_at DESC LIMIT 1",
      ),
    ]);

    const history = historyResult.isOk() ? historyResult.value : [];
    const episodes = episodesResult.isOk() ? episodesResult.value : [];
    const latestNightly = nightlyResult.isOk() ? nightlyResult.value[0] : null;

    const configDump = this.config
      .getAll()
      .filter((p) => p.tunable)
      .map((p) => `${p.key}: ${p.value} [${p.min}-${p.max}]`)
      .join("\n");

    const userMessage = this.buildDiagnosisPrompt(
      snapshot,
      history,
      episodes,
      latestNightly,
      configDump,
    );

    const llmResult = await this.llm.complete(
      this.llmDecision.buildRequest({
        operationType: LlmOperationType.DIAGNOSIS,
        reason: "metrics_regression_analysis",
        priorityOverride: "medium",
        context: {
          world_snapshot: snapshot,
          recent_commits: history,
          active_traces: episodes,
        },
        prompt: {
          system_prompt: DIAGNOSIS_SYSTEM_PROMPT,
          user_message: userMessage,
          tools: [DIAGNOSIS_TOOL],
          force_tool: "diagnose",
        },
        maxTokens: 2048,
      }),
    );

    if (llmResult.isErr()) return err(llmResult.error);

    const raw = (llmResult.value.output_data || {}) as {
      diagnoses?: any[];
      summary?: string;
    };
    const diagnoses: Diagnosis[] = (raw.diagnoses || []).map((d: any) => ({
      dimension: d.dimension,
      severity: d.severity as DiagnosisSeverity,
      description: d.description,
      root_cause: d.root_cause as RootCause,
      hypotheses: (d.hypotheses || []).map((h: any) => ({
        id: "",
        type: h.type,
        description: h.description,
        target_service: h.target_service,
        target_method: h.target_method,
        expected_improvement: h.expected_improvement,
        confidence: h.confidence || 0.5,
        param_changes: h.param_changes as ParamChange[] | undefined,
        logic_proposal: h.logic_proposal,
        code_sketch: h.code_sketch,
      })),
      created_at: "",
    }));

    return ok(diagnoses);
  }

  private buildDiagnosisPrompt(
    snapshot: CognitiveSnapshot,
    history: CognitiveSnapshot[],
    episodes: any[],
    latestNightly: any,
    configDump: string,
  ): string {
    const trend =
      history.length >= 2
        ? `\nHealth trend: ${history.map((s) => `${s.health_score}`).join(" → ")}`
        : "";

    const episodeSummary =
      episodes.length > 0
        ? `\n\nRecent episodes (last 20):\n${episodes.map((e) => `- [${e.outcome}] ${e.description || e.intention_id}`).join("\n")}`
        : "";

    const nightlySummary = latestNightly
      ? `\n\nLast nightly: ${(latestNightly.summary as unknown as Record<string, unknown>)?.passed || "?"}/${(latestNightly.summary as unknown as Record<string, unknown>)?.total_stages || "?"} stages passed`
      : "";

    return `Current cognitive snapshot:
Health score: ${snapshot.health_score}
Weak dimensions: ${snapshot.weak_dimensions.join(", ") || "none"}
${trend}

Dimensions:
${JSON.stringify(snapshot.dimensions, null, 2)}
${episodeSummary}
${nightlySummary}

Tunable config parameters:
${configDump}

Analyze these metrics and identify weaknesses. For each, determine if the root cause is a parameter issue or a logic/architecture issue. Propose specific, actionable hypotheses.`;
  }

  private mergeDiagnoses(rule: Diagnosis[], llm: Diagnosis[]): Diagnosis[] {
    const byDimension = new Map<string, Diagnosis>();

    // Rule-based first
    for (const d of rule) {
      byDimension.set(d.dimension, d);
    }

    // LLM overrides or adds
    for (const d of llm) {
      const existing = byDimension.get(d.dimension);
      if (existing) {
        // Merge hypotheses, prefer LLM for logic diagnoses
        if (d.root_cause === "logic" || d.root_cause === "architecture") {
          existing.hypotheses.push(...d.hypotheses);
          if (d.severity > existing.severity) {
            existing.severity = d.severity;
          }
          existing.description = `${existing.description}; LLM: ${d.description}`;
        } else {
          // For parameter diagnoses, LLM might add new param hypotheses
          existing.hypotheses.push(
            ...d.hypotheses.filter(
              (h) =>
                !existing.hypotheses.some(
                  (eh) => eh.description === h.description,
                ),
            ),
          );
        }
      } else {
        byDimension.set(d.dimension, d);
      }
    }

    return Array.from(byDimension.values());
  }
}
