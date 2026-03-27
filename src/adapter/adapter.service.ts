import { Injectable } from "@nestjs/common";
import { SurrealService } from "../database/surreal.service";
import { WorldModelService } from "../world-model/world-model.service";
import { MetricsService } from "../metrics/metrics.service";
import { DiagnosisService } from "../metrics/diagnosis.service";
import {
  AdapterBeliefsSnapshotImportResponse,
  AdapterDiagnosisLatestResponse,
  AdapterHealthResponse,
  AdapterImportBeliefsSnapshotRequest,
  AdapterImportCursorRecord,
  AdapterImportIntrospectionSummaryRequest,
  AdapterImportLogBatchRequest,
  AdapterImportMemorySnapshotRequest,
  AdapterImportStatusSnapshotRequest,
  AdapterIntrospectionSummaryImportResponse,
  AdapterLogBatchImportResponse,
  AdapterLogEntryRecord,
  AdapterMemorySnapshotImportResponse,
  AdapterMetricsLatestResponse,
  AdapterReadModelState,
  AdapterSnapshotRecord,
  AdapterStatusSnapshotImportResponse,
  AdapterWorldModelLatestResponse,
  NormalizedImportedBelief,
} from "./adapter.types";
import {
  buildImportedActivityRecord,
  normalizeImportedBelief,
} from "./adapter-normalize";
import { DiagnosisResult } from "../metrics/diagnosis.types";
import { CognitiveSnapshot } from "../metrics/metrics.types";
import { WorldModel } from "../common/types/world-model.types";
import { IntrospectionPosture } from "../common/types/introspection.types";

const ADAPTER_SERVICE_NAME = "cognitive-runtime";
const ADAPTER_VERSION = "1";
const LOG_CURSOR_KEY = "log-batch";
const BELIEFS_CURSOR_KEY = "beliefs-snapshot";
const MEMORY_CURSOR_KEY = "memory-snapshot";
const STATUS_CURSOR_KEY = "status-snapshot";
const INTROSPECTION_CURSOR_KEY = "introspection-summary";

@Injectable()
export class AdapterService {
  constructor(
    private readonly db: SurrealService,
    private readonly worldModel: WorldModelService,
    private readonly metrics: MetricsService,
    private readonly diagnosis: DiagnosisService,
  ) {}

  async getHealth(): Promise<AdapterHealthResponse> {
    const dbConnected = this.db.isConnected();
    const [
      logCursor,
      beliefsCursor,
      memoryCursor,
      statusCursor,
      introspectionCursor,
      worldModelTs,
      metricsTs,
      diagnosisTs,
    ] = await Promise.all([
      this.readImportCursor(LOG_CURSOR_KEY),
      this.readImportCursor(BELIEFS_CURSOR_KEY),
      this.readImportCursor(MEMORY_CURSOR_KEY),
      this.readImportCursor(STATUS_CURSOR_KEY),
      this.readImportCursor(INTROSPECTION_CURSOR_KEY),
      this.readLatestTimestamp("world_model", "generated_at"),
      this.readLatestTimestamp("cognitive_snapshot", "timestamp"),
      this.readLatestTimestamp("diagnosis", "created_at"),
    ]);

    return {
      ok: true,
      service: ADAPTER_SERVICE_NAME,
      version: ADAPTER_VERSION,
      dbConnected,
      importState: {
        lastLogCursor: this.readStringField(logCursor?.value?.cursor),
        lastLogBatchId: this.readStringField(logCursor?.value?.batchId),
        lastBeliefSnapshotId: this.readStringField(
          beliefsCursor?.value?.snapshotId,
        ),
        lastBeliefSnapshotAt: this.readStringField(
          beliefsCursor?.value?.generatedAt,
        ),
        lastMemorySnapshotId: this.readStringField(
          memoryCursor?.value?.snapshotId,
        ),
        lastMemorySnapshotAt: this.readStringField(
          memoryCursor?.value?.generatedAt,
        ),
        lastStatusSnapshotId: this.readStringField(
          statusCursor?.value?.snapshotId,
        ),
        lastStatusSnapshotAt: this.readStringField(
          statusCursor?.value?.generatedAt,
        ),
        lastIntrospectionSnapshotId: this.readStringField(
          introspectionCursor?.value?.snapshotId,
        ),
        lastIntrospectionSnapshotAt: this.readStringField(
          introspectionCursor?.value?.generatedAt,
        ),
      },
      readModels: {
        worldModelGeneratedAt: worldModelTs,
        metricsGeneratedAt: metricsTs,
        diagnosisGeneratedAt: diagnosisTs,
      },
    };
  }

  async importLogBatch(
    dto: AdapterImportLogBatchRequest,
  ): Promise<AdapterLogBatchImportResponse> {
    if (!dto || typeof dto !== "object") {
      throw new Error("Log batch payload must be an object.");
    }
    if (!dto.source || typeof dto.source !== "string") {
      throw new Error("Log batch payload must include source.");
    }
    if (!Array.isArray(dto.entries)) {
      throw new Error("Log batch payload must include entries array.");
    }

    const importedAt = new Date().toISOString();
    let accepted = 0;
    let deduplicated = 0;

    for (const entry of dto.entries) {
      const record = buildImportedActivityRecord(
        dto.source,
        dto.batchId ? String(dto.batchId) : null,
        entry,
        importedAt,
      );
      const existing = await this.readImportedLog(record.raw.source_id);
      if (existing) {
        deduplicated += 1;
        continue;
      }

      const rawCreate = await this.db.create<AdapterLogEntryRecord>(
        "adapter_log_entry",
        record.raw,
      );
      if (rawCreate.isErr()) {
        throw rawCreate.error;
      }

      const activityCreate = await this.db.create(
        "activity_log",
        record.domain,
      );
      if (activityCreate.isErr()) {
        throw activityCreate.error;
      }

      accepted += 1;
    }

    const cursor =
      dto.entries.length > 0
        ? dto.entries[dto.entries.length - 1].sourceId
        : null;
    await this.writeImportCursor(LOG_CURSOR_KEY, {
      cursor,
      batchId: dto.batchId ? String(dto.batchId) : null,
      source: dto.source,
    });

    return {
      ok: true,
      source: dto.source,
      batchId: dto.batchId ? String(dto.batchId) : null,
      accepted,
      deduplicated,
      cursor,
      importedAt,
    };
  }

  async importBeliefsSnapshot(
    dto: AdapterImportBeliefsSnapshotRequest,
  ): Promise<AdapterBeliefsSnapshotImportResponse> {
    if (!dto || typeof dto !== "object") {
      throw new Error("Beliefs snapshot payload must be an object.");
    }
    if (!dto.snapshotId || typeof dto.snapshotId !== "string") {
      throw new Error("Beliefs snapshot payload must include snapshotId.");
    }
    if (!Array.isArray(dto.beliefs)) {
      throw new Error("Beliefs snapshot payload must include beliefs array.");
    }

    const importedAt = new Date().toISOString();
    const generatedAt = this.normalizeTimestamp(dto.generatedAt, importedAt);
    const existingSnapshot = await this.readSnapshot(dto.snapshotId);
    if (existingSnapshot) {
      await this.writeImportCursor(BELIEFS_CURSOR_KEY, {
        snapshotId: dto.snapshotId,
        generatedAt,
      });
      return {
        ok: true,
        snapshotId: dto.snapshotId,
        generatedAt,
        created: 0,
        updated: 0,
        deduplicated: true,
        importedAt,
      };
    }

    let created = 0;
    let updated = 0;
    const normalizedBeliefs: NormalizedImportedBelief[] = dto.beliefs.map(
      (belief) =>
        normalizeImportedBelief(
          dto.snapshotId,
          "master-runtime",
          belief,
          importedAt,
        ),
    );

    for (const belief of normalizedBeliefs) {
      const existing = await this.readBeliefByBeliefId(belief.belief_id);
      if (existing) {
        const result = await this.db.update(existing.id!, belief);
        if (result.isErr()) throw result.error;
        updated += 1;
        continue;
      }

      const result = await this.db.create("belief", belief);
      if (result.isErr()) throw result.error;
      created += 1;
    }

    const snapshotResult = await this.db.create<AdapterSnapshotRecord>(
      "adapter_snapshot",
      {
        snapshot_id: dto.snapshotId,
        snapshot_type: "beliefs",
        source_runtime: "master-runtime",
        generated_at: generatedAt,
        payload: {
          belief_count: normalizedBeliefs.length,
          belief_ids: normalizedBeliefs.map((belief) => belief.belief_id),
        },
        imported_at: importedAt,
      },
    );
    if (snapshotResult.isErr()) {
      throw snapshotResult.error;
    }

    await this.writeImportCursor(BELIEFS_CURSOR_KEY, {
      snapshotId: dto.snapshotId,
      generatedAt,
      beliefCount: normalizedBeliefs.length,
    });

    return {
      ok: true,
      snapshotId: dto.snapshotId,
      generatedAt,
      created,
      updated,
      deduplicated: false,
      importedAt,
    };
  }

  async importMemorySnapshot(
    dto: AdapterImportMemorySnapshotRequest,
  ): Promise<AdapterMemorySnapshotImportResponse> {
    if (!dto || typeof dto !== "object") {
      throw new Error("Memory snapshot payload must be an object.");
    }
    if (!dto.snapshotId || typeof dto.snapshotId !== "string") {
      throw new Error("Memory snapshot payload must include snapshotId.");
    }
    if (!Array.isArray(dto.days)) {
      throw new Error("Memory snapshot payload must include days array.");
    }

    const importedAt = new Date().toISOString();
    const generatedAt = this.normalizeTimestamp(dto.generatedAt, importedAt);
    const existingSnapshot = await this.readSnapshot(dto.snapshotId);
    if (existingSnapshot) {
      await this.writeImportCursor(MEMORY_CURSOR_KEY, {
        snapshotId: dto.snapshotId,
        generatedAt,
        dayCount: this.normalizeCount(dto.dayCount, dto.days.length),
        latestDayKey: this.normalizeString(dto.latestDayKey),
      });
      return {
        ok: true,
        snapshotId: dto.snapshotId,
        generatedAt,
        dayCount: this.normalizeCount(dto.dayCount, dto.days.length),
        latestDayKey: this.normalizeString(dto.latestDayKey),
        deduplicated: true,
        importedAt,
      };
    }

    const snapshotResult = await this.db.create<AdapterSnapshotRecord>(
      "adapter_snapshot",
      {
        snapshot_id: dto.snapshotId,
        snapshot_type: "memory",
        source_runtime: "master-runtime",
        generated_at: generatedAt,
        payload: {
          day_count: this.normalizeCount(dto.dayCount, dto.days.length),
          latest_day_key: this.normalizeString(dto.latestDayKey),
          days: dto.days.map((day) => ({
            day_key: this.normalizeString(day?.dayKey),
            content: typeof day?.content === "string" ? day.content : "",
          })),
        },
        imported_at: importedAt,
      },
    );
    if (snapshotResult.isErr()) {
      throw snapshotResult.error;
    }

    await this.writeImportCursor(MEMORY_CURSOR_KEY, {
      snapshotId: dto.snapshotId,
      generatedAt,
      dayCount: this.normalizeCount(dto.dayCount, dto.days.length),
      latestDayKey: this.normalizeString(dto.latestDayKey),
    });

    return {
      ok: true,
      snapshotId: dto.snapshotId,
      generatedAt,
      dayCount: this.normalizeCount(dto.dayCount, dto.days.length),
      latestDayKey: this.normalizeString(dto.latestDayKey),
      deduplicated: false,
      importedAt,
    };
  }

  async importStatusSnapshot(
    dto: AdapterImportStatusSnapshotRequest,
  ): Promise<AdapterStatusSnapshotImportResponse> {
    if (!dto || typeof dto !== "object") {
      throw new Error("Status snapshot payload must be an object.");
    }
    if (!dto.snapshotId || typeof dto.snapshotId !== "string") {
      throw new Error("Status snapshot payload must include snapshotId.");
    }

    const importedAt = new Date().toISOString();
    const generatedAt = this.normalizeTimestamp(dto.generatedAt, importedAt);
    const existingSnapshot = await this.readSnapshot(dto.snapshotId);
    if (existingSnapshot) {
      await this.writeImportCursor(STATUS_CURSOR_KEY, {
        snapshotId: dto.snapshotId,
        generatedAt,
      });
      return {
        ok: true,
        snapshotId: dto.snapshotId,
        generatedAt,
        exists: dto.exists === true,
        deduplicated: true,
        importedAt,
      };
    }

    const snapshotResult = await this.db.create<AdapterSnapshotRecord>(
      "adapter_snapshot",
      {
        snapshot_id: dto.snapshotId,
        snapshot_type: "status",
        source_runtime: "master-runtime",
        generated_at: generatedAt,
        payload: {
          exists: dto.exists === true,
          focus_state: this.normalizeObject(dto.focusState),
          flat: this.normalizeObject(dto.flat),
          raw: typeof dto.raw === "string" ? dto.raw : "",
        },
        imported_at: importedAt,
      },
    );
    if (snapshotResult.isErr()) {
      throw snapshotResult.error;
    }

    await this.writeImportCursor(STATUS_CURSOR_KEY, {
      snapshotId: dto.snapshotId,
      generatedAt,
    });

    return {
      ok: true,
      snapshotId: dto.snapshotId,
      generatedAt,
      exists: dto.exists === true,
      deduplicated: false,
      importedAt,
    };
  }

  async importIntrospectionSummary(
    dto: AdapterImportIntrospectionSummaryRequest,
  ): Promise<AdapterIntrospectionSummaryImportResponse> {
    if (!dto || typeof dto !== "object") {
      throw new Error("Introspection summary payload must be an object.");
    }
    if (!dto.snapshotId || typeof dto.snapshotId !== "string") {
      throw new Error("Introspection summary payload must include snapshotId.");
    }

    const importedAt = new Date().toISOString();
    const generatedAt = this.normalizeTimestamp(dto.generatedAt, importedAt);
    const existingSnapshot = await this.readSnapshot(dto.snapshotId);
    if (existingSnapshot) {
      await this.writeImportCursor(INTROSPECTION_CURSOR_KEY, {
        snapshotId: dto.snapshotId,
        generatedAt,
      });
      return {
        ok: true,
        snapshotId: dto.snapshotId,
        generatedAt,
        exists: dto.exists === true,
        deduplicated: true,
        importedAt,
      };
    }

    const summary = this.normalizeObject(dto.summary);
    const posture = this.inferImportedPosture(summary);
    const introspectionRecord = {
      profile: "sleep",
      executed_stages: ["imported_summary"],
      coherence_score: this.normalizeNumber(summary?.coherence, 0.5),
      posture,
      summary: {
        total_beliefs: this.normalizeCount(summary?.beliefs, 0),
        active_beliefs: this.normalizeCount(summary?.beliefs, 0),
        low_confidence_count: 0,
        avg_confidence: 0.5,
        contradictions_found: 0,
        memory_freshness_days: this.deriveMemoryFreshnessDays(summary),
        posture,
        coherence_score: this.normalizeNumber(summary?.coherence, 0.5),
      },
      stage_outputs: {
        imported_summary: summary || {},
      },
      generated_at: generatedAt,
    };

    const snapshotResult = await this.db.create<AdapterSnapshotRecord>(
      "adapter_snapshot",
      {
        snapshot_id: dto.snapshotId,
        snapshot_type: "introspection",
        source_runtime: "master-runtime",
        generated_at: generatedAt,
        payload: {
          exists: dto.exists === true,
          summary: summary || {},
        },
        imported_at: importedAt,
      },
    );
    if (snapshotResult.isErr()) {
      throw snapshotResult.error;
    }

    const introspectionCreate = await this.db.create(
      "introspection_report",
      introspectionRecord,
    );
    if (introspectionCreate.isErr()) {
      throw introspectionCreate.error;
    }

    await this.writeImportCursor(INTROSPECTION_CURSOR_KEY, {
      snapshotId: dto.snapshotId,
      generatedAt,
    });

    return {
      ok: true,
      snapshotId: dto.snapshotId,
      generatedAt,
      exists: dto.exists === true,
      deduplicated: false,
      importedAt,
    };
  }

  async getLatestWorldModel(): Promise<AdapterWorldModelLatestResponse> {
    let result = await this.worldModel.getLatest();
    if (result.isErr()) {
      throw result.error;
    }
    const latestImportAt = await this.readLatestAdapterImportTimestamp();
    if (
      !result.value ||
      this.isReadModelStale(result.value.generated_at, latestImportAt)
    ) {
      result = await this.worldModel.build();
      if (result.isErr()) {
        throw result.error;
      }
    }

    const model = await this.enrichWorldModelFromImports(
      result.value as WorldModel,
    );
    return {
      ok: true,
      generatedAt: model.generated_at,
      sourceFreshnessMs: this.getFreshnessMs(model.generated_at),
      model,
    };
  }

  async getLatestMetrics(): Promise<AdapterMetricsLatestResponse> {
    let result = await this.metrics.getLatest();
    if (result.isErr()) {
      throw result.error;
    }
    const latestImportAt = await this.readLatestAdapterImportTimestamp();
    if (
      !result.value ||
      this.isReadModelStale(result.value.timestamp, latestImportAt)
    ) {
      result = await this.metrics.snapshot();
      if (result.isErr()) {
        throw result.error;
      }
    }

    const metrics = result.value as CognitiveSnapshot;
    return {
      ok: true,
      generatedAt: metrics.timestamp,
      sourceFreshnessMs: this.getFreshnessMs(metrics.timestamp),
      metrics,
    };
  }

  async getLatestDiagnosis(): Promise<AdapterDiagnosisLatestResponse> {
    let diagnosis = await this.readLatestDiagnosis();
    const latestImportAt = await this.readLatestAdapterImportTimestamp();
    const stale =
      !diagnosis || this.isReadModelStale(diagnosis.created_at, latestImportAt);
    if (stale) {
      const snapshot = await this.resolveLatestMetricsSnapshot(latestImportAt);
      if (!diagnosis) {
        const generated = await this.diagnosis.analyzeRuleOnly(snapshot);
        if (generated.isErr()) {
          throw generated.error;
        }
        diagnosis = generated.value;
      } else {
        this.triggerAsyncDiagnosisRefresh(snapshot);
      }
    }

    if (!diagnosis) {
      throw new Error("Diagnosis read-model could not be prepared.");
    }

    return {
      ok: true,
      generatedAt: diagnosis.created_at,
      sourceFreshnessMs: this.getFreshnessMs(diagnosis.created_at),
      diagnosis,
    };
  }

  private async resolveLatestMetricsSnapshot(
    latestImportAt: string | null,
  ): Promise<CognitiveSnapshot> {
    const metrics = await this.metrics.getLatest();
    let snapshot = metrics.isOk() ? metrics.value : null;
    if (
      !snapshot ||
      this.isReadModelStale(snapshot.timestamp, latestImportAt)
    ) {
      const fresh = await this.metrics.snapshot();
      if (fresh.isErr()) {
        throw fresh.error;
      }
      snapshot = fresh.value;
    }
    return snapshot;
  }

  private triggerAsyncDiagnosisRefresh(snapshot: CognitiveSnapshot): void {
    setImmediate(() => {
      this.diagnosis.analyze(snapshot).catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : String(error ?? "unknown");
        // Keep read endpoints fast; live refresh failures stay advisory.
        console.warn(
          `[cognitive-runtime] async diagnosis refresh failed: ${message}`,
        );
      });
    });
  }

  private async enrichWorldModelFromImports(
    model: WorldModel,
  ): Promise<WorldModel> {
    const enriched: WorldModel = JSON.parse(JSON.stringify(model));
    const [memorySnapshot, statusSnapshot, introspectionSnapshot, logCount] =
      await Promise.all([
        this.readLatestSnapshotByType("memory"),
        this.readLatestSnapshotByType("status"),
        this.readLatestSnapshotByType("introspection"),
        this.readActivityLogCount(),
      ]);

    if (memorySnapshot?.payload) {
      const payload = this.normalizeObject(memorySnapshot.payload);
      const dayCount = this.normalizeCount(payload?.day_count, null);
      const latestDayKey = this.normalizeString(payload?.latest_day_key);
      if (dayCount !== null) {
        enriched.sources.memory.days = dayCount;
      }
      if (latestDayKey) {
        enriched.sources.memory.latest_day = latestDayKey;
        enriched.workspace_model.memory_freshness_days =
          this.deriveDayFreshness(latestDayKey);
      }
    }

    if (statusSnapshot?.payload) {
      const payload = this.normalizeObject(statusSnapshot.payload);
      const focusState = this.normalizeObject(payload?.focus_state);
      const exists =
        typeof payload?.exists === "boolean" ? payload.exists : true;
      enriched.sources.status.exists = exists;
      if (focusState) {
        enriched.workspace_model.active_project =
          this.normalizeString(focusState.activeProject) ||
          enriched.workspace_model.active_project;
        enriched.workspace_model.mode =
          this.normalizeString(focusState.mode) ||
          enriched.workspace_model.mode;
        enriched.workspace_model.status =
          this.normalizeString(focusState.status) ||
          enriched.workspace_model.status;
        enriched.workspace_model.next_step =
          this.normalizeString(focusState.nextStep) ||
          enriched.workspace_model.next_step;
      }
    }

    if (introspectionSnapshot?.payload) {
      const payload = this.normalizeObject(introspectionSnapshot.payload);
      const summary = this.normalizeObject(payload?.summary);
      enriched.workspace_model.introspection_date =
        this.normalizeString(summary?.date) ||
        introspectionSnapshot.generated_at ||
        enriched.workspace_model.introspection_date;
    }

    enriched.sources.logs.entries = logCount;
    return enriched;
  }

  private async readImportCursor(
    key: string,
  ): Promise<AdapterImportCursorRecord | null> {
    const result = await this.db.query<AdapterImportCursorRecord>(
      "SELECT * FROM adapter_import_cursor WHERE key = $key LIMIT 1",
      { key },
    );
    if (result.isErr()) {
      return null;
    }
    return result.value[0] || null;
  }

  private async writeImportCursor(
    key: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.db.execute(
      `UPSERT adapter_import_cursor SET key = $key, value = $value, updated_at = time::now() WHERE key = $key`,
      { key, value },
    );
    if (result.isErr()) {
      throw result.error;
    }
  }

  private async readImportedLog(
    sourceId: string,
  ): Promise<AdapterLogEntryRecord | null> {
    const result = await this.db.query<AdapterLogEntryRecord>(
      "SELECT * FROM adapter_log_entry WHERE source_id = $sourceId LIMIT 1",
      { sourceId },
    );
    if (result.isErr()) {
      throw result.error;
    }
    return result.value[0] || null;
  }

  private async readSnapshot(
    snapshotId: string,
  ): Promise<AdapterSnapshotRecord | null> {
    const result = await this.db.query<AdapterSnapshotRecord>(
      "SELECT * FROM adapter_snapshot WHERE snapshot_id = $snapshotId LIMIT 1",
      { snapshotId },
    );
    if (result.isErr()) {
      throw result.error;
    }
    return result.value[0] || null;
  }

  private async readBeliefByBeliefId(
    beliefId: string,
  ): Promise<NormalizedImportedBelief | null> {
    const result = await this.db.query<NormalizedImportedBelief>(
      "SELECT * FROM belief WHERE belief_id = $beliefId LIMIT 1",
      { beliefId },
    );
    if (result.isErr()) {
      throw result.error;
    }
    return result.value[0] || null;
  }

  private async readLatestDiagnosis(): Promise<DiagnosisResult | null> {
    const result = await this.db.query<DiagnosisResult>(
      "SELECT * FROM diagnosis ORDER BY created_at DESC LIMIT 1",
    );
    if (result.isErr()) {
      throw result.error;
    }
    return result.value[0] || null;
  }

  private async readLatestSnapshotByType(
    snapshotType: string,
  ): Promise<AdapterSnapshotRecord | null> {
    const result = await this.db.query<AdapterSnapshotRecord>(
      "SELECT * FROM adapter_snapshot WHERE snapshot_type = $snapshotType ORDER BY imported_at DESC LIMIT 1",
      { snapshotType },
    );
    if (result.isErr()) {
      throw result.error;
    }
    return result.value[0] || null;
  }

  private async readLatestTimestamp(
    table: string,
    field: string,
  ): Promise<string | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT ${field} AS timestamp FROM ${table} ORDER BY ${field} DESC LIMIT 1`,
    );
    if (result.isErr()) {
      return null;
    }
    const value = result.value[0]?.timestamp;
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return null;
  }

  private async readLatestAdapterImportTimestamp(): Promise<string | null> {
    const [cursorTs, snapshotTs, logTs] = await Promise.all([
      this.readLatestTimestamp("adapter_import_cursor", "updated_at"),
      this.readLatestTimestamp("adapter_snapshot", "imported_at"),
      this.readLatestTimestamp("adapter_log_entry", "imported_at"),
    ]);

    return (
      [cursorTs, snapshotTs, logTs]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) || null
    );
  }

  private async readActivityLogCount(): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      "SELECT count() AS count FROM activity_log GROUP ALL",
    );
    if (result.isErr()) {
      return 0;
    }
    return this.normalizeCount(result.value[0]?.count, 0);
  }

  private isReadModelStale(
    generatedAt: string | null | undefined,
    latestImportAt: string | null,
  ): boolean {
    if (!generatedAt || !latestImportAt) {
      return false;
    }
    if (
      Number.isNaN(Date.parse(generatedAt)) ||
      Number.isNaN(Date.parse(latestImportAt))
    ) {
      return false;
    }
    return new Date(generatedAt).getTime() < new Date(latestImportAt).getTime();
  }

  private getFreshnessMs(timestamp: string | null): number | null {
    if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
      return null;
    }
    return Math.max(0, Date.now() - new Date(timestamp).getTime());
  }

  private normalizeTimestamp(
    value: string | null | undefined,
    fallback: string,
  ): string {
    return value && !Number.isNaN(Date.parse(value)) ? value : fallback;
  }

  private readStringField(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private normalizeObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : null;
  }

  private normalizeString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private normalizeCount(value: unknown, fallback: number | null): number {
    const numeric =
      typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
    return fallback ?? 0;
  }

  private normalizeNumber(value: unknown, fallback: number): number {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private inferImportedPosture(
    summary: Record<string, unknown> | null,
  ): IntrospectionPosture {
    const coherence = this.normalizeNumber(summary?.coherence, 0.5);
    if (coherence >= 0.75) {
      return "stable";
    }
    if (coherence >= 0.45) {
      return "review";
    }
    return "repair";
  }

  private deriveMemoryFreshnessDays(
    summary: Record<string, unknown> | null,
  ): number {
    if (summary?.memory_today === true) {
      return 0;
    }
    if (summary?.memory_yesterday === true) {
      return 1;
    }
    return 999;
  }

  private deriveDayFreshness(dayKey: string): number {
    const midnightUtc = new Date(`${dayKey}T00:00:00.000Z`);
    const diffMs = Date.now() - midnightUtc.getTime();
    return Math.max(0, Math.floor(diffMs / 86_400_000));
  }
}
