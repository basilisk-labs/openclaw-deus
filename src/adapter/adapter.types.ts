import { Belief } from "../common/types/belief.types";
import { DiagnosisResult } from "../metrics/diagnosis.types";
import { CognitiveSnapshot } from "../metrics/metrics.types";
import { WorldModel } from "../common/types/world-model.types";

export interface AdapterImportLogEntry {
  sourceId: string;
  timestamp?: string | null;
  type?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface AdapterImportLogBatchRequest {
  batchId?: string | null;
  source: string;
  entries: AdapterImportLogEntry[];
}

export interface AdapterImportBeliefsSnapshotRequest {
  snapshotId: string;
  generatedAt?: string | null;
  beliefs: Record<string, unknown>[];
}

export interface AdapterImportMemoryDay {
  dayKey: string;
  content: string;
}

export interface AdapterImportMemorySnapshotRequest {
  snapshotId: string;
  generatedAt?: string | null;
  dayCount?: number | null;
  latestDayKey?: string | null;
  days: AdapterImportMemoryDay[];
}

export interface AdapterImportStatusSnapshotRequest {
  snapshotId: string;
  generatedAt?: string | null;
  exists: boolean;
  focusState?: Record<string, unknown> | null;
  flat?: Record<string, unknown> | null;
  raw?: string | null;
}

export interface AdapterImportIntrospectionSummaryRequest {
  snapshotId: string;
  generatedAt?: string | null;
  exists: boolean;
  summary?: Record<string, unknown> | null;
}

export interface AdapterImportState {
  lastLogCursor: string | null;
  lastLogBatchId: string | null;
  lastBeliefSnapshotId: string | null;
  lastBeliefSnapshotAt: string | null;
  lastMemorySnapshotId: string | null;
  lastMemorySnapshotAt: string | null;
  lastStatusSnapshotId: string | null;
  lastStatusSnapshotAt: string | null;
  lastIntrospectionSnapshotId: string | null;
  lastIntrospectionSnapshotAt: string | null;
}

export interface AdapterReadModelState {
  worldModelGeneratedAt: string | null;
  metricsGeneratedAt: string | null;
  diagnosisGeneratedAt: string | null;
}

export interface AdapterHealthResponse {
  ok: true;
  service: "cognitive-runtime";
  version: "1";
  dbConnected: boolean;
  importState: AdapterImportState;
  readModels: AdapterReadModelState;
}

export interface AdapterLogBatchImportResponse {
  ok: true;
  source: string;
  batchId: string | null;
  accepted: number;
  deduplicated: number;
  cursor: string | null;
  importedAt: string;
}

export interface AdapterBeliefsSnapshotImportResponse {
  ok: true;
  snapshotId: string;
  generatedAt: string;
  created: number;
  updated: number;
  deduplicated: boolean;
  importedAt: string;
}

export interface AdapterMemorySnapshotImportResponse {
  ok: true;
  snapshotId: string;
  generatedAt: string;
  dayCount: number;
  latestDayKey: string | null;
  deduplicated: boolean;
  importedAt: string;
}

export interface AdapterStatusSnapshotImportResponse {
  ok: true;
  snapshotId: string;
  generatedAt: string;
  exists: boolean;
  deduplicated: boolean;
  importedAt: string;
}

export interface AdapterIntrospectionSummaryImportResponse {
  ok: true;
  snapshotId: string;
  generatedAt: string;
  exists: boolean;
  deduplicated: boolean;
  importedAt: string;
}

export interface AdapterReadModelResponse<T> {
  ok: true;
  generatedAt: string | null;
  sourceFreshnessMs: number | null;
}

export interface AdapterWorldModelLatestResponse extends AdapterReadModelResponse<WorldModel> {
  model: WorldModel;
}

export interface AdapterMetricsLatestResponse extends AdapterReadModelResponse<CognitiveSnapshot> {
  metrics: CognitiveSnapshot;
}

export interface AdapterDiagnosisLatestResponse extends AdapterReadModelResponse<DiagnosisResult> {
  diagnosis: DiagnosisResult;
}

export interface AdapterImportCursorRecord {
  id?: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface AdapterLogEntryRecord {
  id?: string;
  source_id: string;
  batch_id?: string | null;
  source_runtime: string;
  entry_type: string;
  timestamp?: string | null;
  payload: Record<string, unknown>;
  imported_at: string;
}

export interface AdapterSnapshotRecord {
  id?: string;
  snapshot_id: string;
  snapshot_type: string;
  source_runtime: string;
  generated_at: string;
  payload: Record<string, unknown>;
  imported_at: string;
}

export interface NormalizedImportedBelief extends Belief {
  source_runtime?: string;
  source_snapshot_id?: string;
}
