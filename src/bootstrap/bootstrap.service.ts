import { Injectable, Logger, Optional } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import {
  DomainError,
  ValidationError,
  FileSystemError,
  DatabaseError,
} from "../common/types/result.types";
import { SurrealService } from "../database/surreal.service";
import {
  IDENTITY_FILES,
  BELIEFS_SEED_FILE,
} from "../common/constants/paths.constants";
import { Belief } from "../common/types/belief.types";
import {
  BootstrapCheck,
  BootstrapReport,
} from "../common/types/bootstrap.types";
import { IntrospectionService } from "../introspection/introspection.service";
import { WorldModelService } from "../world-model/world-model.service";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly db: SurrealService,
    @Optional() private readonly introspection?: IntrospectionService,
    @Optional() private readonly worldModel?: WorldModelService,
  ) {}

  async validate(
    workspaceRoot?: string,
  ): Promise<Result<BootstrapReport, DomainError>> {
    const root = workspaceRoot || process.cwd();
    const checks: BootstrapCheck[] = [];

    // Check identity files
    for (const file of IDENTITY_FILES) {
      const filePath = path.join(root, file);
      const exists = fs.existsSync(filePath);
      checks.push({
        name: `identity:${file}`,
        ok: exists,
        detail: exists ? `${file} found` : `${file} missing at ${filePath}`,
      });
    }

    // Check beliefs seed file
    const seedPath = path.join(root, BELIEFS_SEED_FILE);
    const seedResult = this.validateSeedFile(seedPath);
    checks.push(seedResult);

    // Check SurrealDB connectivity
    const pingResult = await this.db.ping();
    checks.push({
      name: "database:connectivity",
      ok: pingResult.isOk(),
      detail: pingResult.isOk()
        ? "SurrealDB connected"
        : `SurrealDB unreachable: ${pingResult.error.message}`,
    });

    const allPassed = checks.every((c) => c.ok);
    return ok({
      timestamp: new Date().toISOString(),
      checks,
      allPassed,
      seeded: false,
    });
  }

  async seedFromCoreJsonl(
    workspaceRoot?: string,
    force = false,
  ): Promise<Result<{ seeded: number; skipped: number }, DomainError>> {
    const root = workspaceRoot || process.cwd();
    const seedPath = path.join(root, BELIEFS_SEED_FILE);

    if (!fs.existsSync(seedPath)) {
      return err(new FileSystemError("Seed file not found", seedPath));
    }

    // Check if already seeded
    if (!force) {
      const existing = await this.db.query<Belief[]>(
        "SELECT * FROM belief LIMIT 1",
      );
      if (existing.isOk() && existing.value.length > 0) {
        this.logger.log("Database already seeded, skipping");
        return ok({ seeded: 0, skipped: 1 });
      }
    }

    // Parse JSONL
    const content = fs.readFileSync(seedPath, "utf-8").trim();
    const lines = content.split("\n").filter(Boolean);
    let seeded = 0;

    for (const line of lines) {
      try {
        const belief = JSON.parse(line) as Belief;
        const result = await this.db.create("belief", {
          belief_id: belief.belief_id,
          content: belief.content,
          confidence: belief.confidence,
          evidence_set: belief.evidence_set || [],
          source_type: belief.source_type,
          belief_class: belief.belief_class,
          decay_mode: belief.decay_mode || "no_decay",
          confidence_floor: belief.confidence_floor ?? 1.0,
          review_threshold: belief.review_threshold ?? 1.0,
          context_scope: belief.context_scope || "universal",
          status: belief.status || "active",
          drift_history: belief.drift_history || [],
          ontological_anchor: belief.ontological_anchor || null,
          inference_trace: belief.inference_trace || [],
          archivable: belief.archivable ?? true,
          refresh_strategy: belief.refresh_strategy || null,
          timestamp_created: new Date(belief.timestamp_created || Date.now()),
          timestamp_updated: new Date(belief.timestamp_updated || Date.now()),
        });

        if (result.isOk()) seeded++;
        else
          this.logger.warn(
            `Failed to seed belief ${belief.belief_id}: ${result.error.message}`,
          );
      } catch (e) {
        this.logger.warn(`Failed to parse seed line: ${e}`);
      }
    }

    this.logger.log(`Seeded ${seeded} beliefs from ${seedPath}`);

    // Self-modification proposal: establish cognitive baseline on first boot
    if (seeded > 0) {
      await this.establishCognitiveBaseline();
    }

    return ok({ seeded, skipped: 0 });
  }

  /**
   * Run introspection + world model build after first seed.
   * Ensures coherence_score and posture are computed from day one.
   * (Proposed by DiagnosisService — cognitive self-modification)
   */
  private async establishCognitiveBaseline(): Promise<void> {
    if (this.introspection) {
      this.logger.log(
        "Establishing cognitive baseline: running introspection...",
      );
      const result = await this.introspection.run("full");
      if (result.isOk()) {
        this.logger.log(
          `Baseline coherence: ${result.value.coherence_score} (${result.value.posture})`,
        );
      } else {
        this.logger.warn(
          `Baseline introspection failed: ${result.error.message}`,
        );
      }
    }

    if (this.worldModel) {
      this.logger.log(
        "Establishing cognitive baseline: building world model...",
      );
      const result = await this.worldModel.build();
      if (result.isOk()) {
        this.logger.log(
          `Baseline world model: confidence=${result.value.confidence}`,
        );
      } else {
        this.logger.warn(
          `Baseline world model failed: ${result.error.message}`,
        );
      }
    }
  }

  async runMigrations(): Promise<Result<void, DomainError>> {
    const migrationsDir = this.resolveMigrationsDir();
    if (!migrationsDir) {
      return err(
        new FileSystemError(
          "Migrations directory not found",
          path.join(process.cwd(), "src", "database", "migrations"),
        ),
      );
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".surql"))
      .sort();

    for (const file of files) {
      const result = await this.db.runMigration(path.join(migrationsDir, file));
      if (result.isErr()) return err(result.error);
    }

    return ok(undefined);
  }

  async ensureTablesExist(
    tableNames: string[],
  ): Promise<Result<void, DomainError>> {
    for (const tableName of tableNames) {
      const result = await this.db.query(`SELECT * FROM ${tableName} LIMIT 0`);
      if (result.isErr()) {
        return err(
          new DatabaseError(
            `Required table is missing or unreadable: ${tableName}`,
            result.error,
          ),
        );
      }
    }

    return ok(undefined);
  }

  async isSeeded(): Promise<Result<boolean, DomainError>> {
    const result = await this.db.query<Belief[]>(
      "SELECT * FROM belief LIMIT 1",
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value.length > 0);
  }

  private validateSeedFile(seedPath: string): BootstrapCheck {
    if (!fs.existsSync(seedPath)) {
      return {
        name: "seed:core.jsonl",
        ok: false,
        detail: `Seed file missing: ${seedPath}`,
      };
    }

    try {
      const content = fs.readFileSync(seedPath, "utf-8").trim();
      const lines = content.split("\n").filter(Boolean);
      let valid = 0;

      for (const line of lines) {
        const obj = JSON.parse(line);
        if (!obj.belief_id || !obj.content || obj.confidence === undefined) {
          return {
            name: "seed:core.jsonl",
            ok: false,
            detail: `Invalid belief entry: missing required fields (belief_id, content, confidence)`,
          };
        }
        valid++;
      }

      return {
        name: "seed:core.jsonl",
        ok: true,
        detail: `${valid} valid beliefs`,
      };
    } catch (e) {
      return {
        name: "seed:core.jsonl",
        ok: false,
        detail: `Parse error: ${e}`,
      };
    }
  }

  private resolveMigrationsDir(): string | null {
    const candidates = [
      path.join(__dirname, "..", "database", "migrations"),
      path.join(process.cwd(), "dist", "database", "migrations"),
      path.join(process.cwd(), "src", "database", "migrations"),
      path.join(process.cwd(), "database", "migrations"),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }
}
