import {
  BELIEF_CLASSES,
  BELIEF_STATUSES,
  BeliefClass,
  DECAY_MODES,
  DecayMode,
  BeliefStatus,
} from "../common/types/belief.types";
import { ACTIVITY_TYPES, ActivityType } from "../common/types/memory.types";
import {
  AdapterImportLogEntry,
  NormalizedImportedBelief,
} from "./adapter.types";

const BELIEF_CLASS_ALIASES: Record<string, BeliefClass> = {
  invariant: "axiom",
  identity: "self_model",
  preference: "user_model",
};

const SUPPORTED_BELIEF_CLASSES = new Set<string>(BELIEF_CLASSES);
const SUPPORTED_DECAY_MODES = new Set<string>(DECAY_MODES);
const SUPPORTED_BELIEF_STATUSES = new Set<string>(BELIEF_STATUSES);
const SUPPORTED_ACTIVITY_TYPES = new Set<string>(ACTIVITY_TYPES);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asIsoTimestamp(value: unknown, fallback: string): string {
  const text = asNonEmptyString(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : fallback;
}

function asPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => asNonEmptyString(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];
}

function clampConfidence(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeBeliefClass(value: unknown): BeliefClass {
  const normalized = asNonEmptyString(value);
  if (!normalized) return "operational";
  if (SUPPORTED_BELIEF_CLASSES.has(normalized)) {
    return normalized as BeliefClass;
  }
  return BELIEF_CLASS_ALIASES[normalized] || "operational";
}

function normalizeDecayMode(value: unknown): DecayMode {
  const normalized = asNonEmptyString(value);
  if (normalized && SUPPORTED_DECAY_MODES.has(normalized)) {
    return normalized as DecayMode;
  }
  return "normal";
}

function normalizeBeliefStatus(value: unknown): BeliefStatus {
  const normalized = asNonEmptyString(value);
  if (normalized && SUPPORTED_BELIEF_STATUSES.has(normalized)) {
    return normalized as BeliefStatus;
  }
  return "active";
}

export function normalizeImportedActivityType(value: unknown): ActivityType {
  const normalized = asNonEmptyString(value);
  if (normalized && SUPPORTED_ACTIVITY_TYPES.has(normalized)) {
    return normalized as ActivityType;
  }
  return "event";
}

export function buildImportedActivityRecord(
  source: string,
  batchId: string | null,
  entry: AdapterImportLogEntry,
  importedAt: string,
) {
  const payload = asPlainObject(entry.payload);
  const nestedContext = asPlainObject(payload.context);
  const description =
    asNonEmptyString(payload.description) ||
    asNonEmptyString(entry.type) ||
    `Imported ${source} runtime entry`;
  const timestamp = asIsoTimestamp(
    entry.timestamp ?? payload.timestamp,
    importedAt,
  );
  const sourceId = asNonEmptyString(entry.sourceId);
  if (!sourceId) {
    throw new Error("Imported log entry is missing sourceId.");
  }

  return {
    raw: {
      source_id: sourceId,
      batch_id: batchId,
      source_runtime: source,
      entry_type: asNonEmptyString(entry.type) || "unknown",
      timestamp,
      payload: {
        ...payload,
        source_id: sourceId,
      },
      imported_at: importedAt,
    },
    domain: {
      type: normalizeImportedActivityType(entry.type ?? payload.type),
      description,
      context: {
        ...nestedContext,
        adapter_import: {
          source_runtime: source,
          source_id: sourceId,
          original_type:
            asNonEmptyString(entry.type) ||
            asNonEmptyString(payload.type) ||
            "unknown",
          batch_id: batchId,
        },
      },
      agent: asNonEmptyString(payload.agent) || "DEUS",
      day_key: timestamp.slice(0, 10),
      timestamp,
    },
  };
}

export function normalizeImportedBelief(
  snapshotId: string,
  source: string,
  raw: Record<string, unknown>,
  importedAt: string,
): NormalizedImportedBelief {
  const beliefId = asNonEmptyString(raw.belief_id);
  const content = asNonEmptyString(raw.content);
  if (!beliefId || !content) {
    throw new Error("Imported belief must include belief_id and content.");
  }

  return {
    belief_id: beliefId,
    content,
    confidence: clampConfidence(raw.confidence, 0.5),
    evidence_set: asStringArray(raw.evidence_set),
    source_type:
      asNonEmptyString(raw.source_type) || "imported_canonical_runtime",
    belief_class: normalizeBeliefClass(raw.belief_class),
    decay_mode: normalizeDecayMode(raw.decay_mode),
    confidence_floor: clampConfidence(raw.confidence_floor, 0),
    review_threshold: clampConfidence(raw.review_threshold, 1),
    context_scope: asNonEmptyString(raw.context_scope) || "canonical_runtime",
    status: normalizeBeliefStatus(raw.status),
    drift_history: Array.isArray(raw.drift_history) ? raw.drift_history : [],
    ontological_anchor: asNonEmptyString(raw.ontological_anchor) || undefined,
    inference_trace: asStringArray(raw.inference_trace),
    archivable: typeof raw.archivable === "boolean" ? raw.archivable : true,
    refresh_strategy: asNonEmptyString(raw.refresh_strategy) || undefined,
    timestamp_created: asIsoTimestamp(raw.timestamp_created, importedAt),
    timestamp_updated: asIsoTimestamp(raw.timestamp_updated, importedAt),
    source_runtime: source,
    source_snapshot_id: snapshotId,
  };
}
