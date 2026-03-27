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
  AdapterImportLogBatchRequest,
  AdapterLogBatchImportResponse,
  AdapterLogEntryRecord,
  AdapterMetricsLatestResponse,
  AdapterReadModelState,
  AdapterSnapshotRecord,
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

const ADAPTER_SERVICE_NAME = "cognitive-runtime";
const ADAPTER_VERSION = "1";
const LOG_CURSOR_KEY = "log-batch";
const BELIEFS_CURSOR_KEY = "beliefs-snapshot";

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
    const [logCursor, beliefsCursor, worldModelTs, metricsTs, diagnosisTs] =
      await Promise.all([
        this.readImportCursor(LOG_CURSOR_KEY),
        this.readImportCursor(BELIEFS_CURSOR_KEY),
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

  async getLatestWorldModel(): Promise<AdapterWorldModelLatestResponse> {
    let result = await this.worldModel.getLatest();
    if (result.isErr()) {
      throw result.error;
    }
    if (!result.value) {
      result = await this.worldModel.build();
      if (result.isErr()) {
        throw result.error;
      }
    }

    const model = result.value as WorldModel;
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
    if (!result.value) {
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
    if (!diagnosis) {
      const metrics = await this.metrics.getLatest();
      let snapshot = metrics.isOk() ? metrics.value : null;
      if (!snapshot) {
        const fresh = await this.metrics.snapshot();
        if (fresh.isErr()) {
          throw fresh.error;
        }
        snapshot = fresh.value;
      }
      const generated = await this.diagnosis.analyze(snapshot);
      if (generated.isErr()) {
        throw generated.error;
      }
      diagnosis = generated.value;
    }

    return {
      ok: true,
      generatedAt: diagnosis.created_at,
      sourceFreshnessMs: this.getFreshnessMs(diagnosis.created_at),
      diagnosis,
    };
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
}
