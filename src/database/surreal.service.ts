import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Result, ok, err } from "neverthrow";
import { DatabaseError } from "../common/types/result.types";
import Surreal from "surrealdb";
import * as fs from "fs";
import * as path from "path";

import { SurrealConfig } from "../common/types/database.types";

@Injectable()
export class SurrealService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SurrealService.name);
  private db: Surreal;
  private connected = false;
  private config: SurrealConfig;
  private liveQueries: string[] = [];

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.db = new Surreal();
    const surealConf = this.configService?.get("surreal");
    this.config = {
      url:
        surealConf?.url ||
        process.env.SURREAL_URL ||
        "http://127.0.0.1:8000/rpc",
      namespace: surealConf?.namespace || process.env.SURREAL_NS || "deus",
      database: surealConf?.database || process.env.SURREAL_DB || "runtime",
      username: surealConf?.username || process.env.SURREAL_USER || "root",
      password: surealConf?.password || process.env.SURREAL_PASS || "root",
    };
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    for (const id of this.liveQueries) {
      try {
        await this.db.query(`KILL $id`, { id });
      } catch {}
    }
    await this.disconnect();
  }

  async connect(config?: Partial<SurrealConfig>): Promise<void> {
    if (config) this.config = { ...this.config, ...config };
    try {
      // SurrealDB SDK connect options are loosely typed; versionCheck is a valid but untyped option
      await this.db.connect(this.config.url, { versionCheck: false } as Record<
        string,
        unknown
      >);
      await this.db.signin({
        username: this.config.username,
        password: this.config.password,
      });
      await this.db.use({
        namespace: this.config.namespace,
        database: this.config.database,
      });
      await this.ensureNamespaceAndDatabase();
      await this.db.use({
        namespace: this.config.namespace,
        database: this.config.database,
      });
      this.connected = true;
      this.logger.log(
        `Connected to SurrealDB at ${this.config.url} (${this.config.namespace}/${this.config.database})`,
      );
    } catch (error) {
      this.connected = false;
      this.logger.error(`Failed to connect to SurrealDB: ${error}`);
      throw new DatabaseError("Failed to connect to SurrealDB", error);
    }
  }

  private async ensureNamespaceAndDatabase(): Promise<void> {
    const ns = this.escapeIdentifier(this.config.namespace);
    const db = this.escapeIdentifier(this.config.database);
    await this.db.query(
      `DEFINE NAMESPACE IF NOT EXISTS ${ns}; DEFINE DATABASE IF NOT EXISTS ${db};`,
    );
  }

  private escapeIdentifier(value: string): string {
    const safe = String(value ?? "").replace(/`/g, "");
    return `\`${safe}\``;
  }

  async disconnect(): Promise<void> {
    try {
      await this.db.close();
      this.connected = false;
      this.logger.log("Disconnected from SurrealDB");
    } catch (error) {
      this.logger.warn(`Error disconnecting: ${error}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- Core CRUD ---

  async query<T = unknown>(
    sql: string,
    vars?: Record<string, unknown>,
  ): Promise<Result<T[], DatabaseError>> {
    try {
      const results = await this.db.query<T[][]>(sql, vars);
      const data =
        Array.isArray(results) && results.length > 0
          ? ((Array.isArray(results[0]) ? results[0] : [results[0]]) as T[])
          : [];
      return ok(data);
    } catch (error) {
      this.logger.error(`Query failed: ${sql} — ${error}`);
      return err(new DatabaseError(`Query failed: ${error}`, error));
    }
  }

  async queryRaw<T = unknown>(
    sql: string,
    vars?: Record<string, unknown>,
  ): Promise<Result<T, DatabaseError>> {
    try {
      const results = await this.db.query<T[]>(sql, vars);
      return ok(results as unknown as T);
    } catch (error) {
      this.logger.error(`Query failed: ${sql} — ${error}`);
      return err(new DatabaseError(`Query failed: ${error}`, error));
    }
  }

  async execute(
    sql: string,
    vars?: Record<string, unknown>,
  ): Promise<Result<unknown, DatabaseError>> {
    try {
      const result = await this.db.query(sql, vars);
      return ok(result);
    } catch (error) {
      return err(new DatabaseError(`Execute failed: ${error}`, error));
    }
  }

  async select<T>(table: string): Promise<Result<T[], DatabaseError>> {
    try {
      const results = (await this.db.select(table)) as unknown as T[];
      return ok(Array.isArray(results) ? results : [results]);
    } catch (error) {
      return err(
        new DatabaseError(`Select from ${table} failed: ${error}`, error),
      );
    }
  }

  async create<T>(table: string, data: T): Promise<Result<T, DatabaseError>> {
    try {
      // SurrealDB SDK expects loosely typed data for create/merge operations
      const result = await this.db.create(
        table,
        this.coerceDatetimes(data) as Record<string, unknown>,
      );
      const record = Array.isArray(result) ? result[0] : result;
      return ok(record as unknown as T);
    } catch (error) {
      return err(
        new DatabaseError(`Create in ${table} failed: ${error}`, error),
      );
    }
  }

  async update<T>(
    id: string,
    data: Partial<T>,
  ): Promise<Result<T, DatabaseError>> {
    try {
      const result = await this.db.merge(
        id,
        this.coerceDatetimes(data) as Record<string, unknown>,
      );
      return ok(result as unknown as T);
    } catch (error) {
      return err(new DatabaseError(`Update ${id} failed: ${error}`, error));
    }
  }

  async batchUpdate(
    sql: string,
    vars?: Record<string, unknown>,
  ): Promise<Result<number, DatabaseError>> {
    try {
      const results = await this.db.query(sql, vars);
      const arr =
        Array.isArray(results) && results.length > 0 ? results[0] : [];
      return ok(Array.isArray(arr) ? arr.length : 0);
    } catch (error) {
      return err(new DatabaseError(`Batch update failed: ${error}`, error));
    }
  }

  async remove(id: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.delete(id);
      return ok(undefined);
    } catch (error) {
      return err(new DatabaseError(`Delete ${id} failed: ${error}`, error));
    }
  }

  // --- SurrealDB-native features ---

  async relate(
    from: string,
    relation: string,
    to: string,
    data?: Record<string, unknown>,
  ): Promise<Result<unknown, DatabaseError>> {
    const vars: Record<string, unknown> = { ...data };
    const setClause = data
      ? " SET " +
        Object.keys(data)
          .map((k) => `${k} = $${k}`)
          .join(", ")
      : "";
    return this.execute(
      `RELATE ${from} -> ${relation} -> ${to}${setClause}`,
      vars,
    );
  }

  async transaction(
    statements: string[],
    vars?: Record<string, unknown>,
  ): Promise<Result<unknown, DatabaseError>> {
    const sql = `BEGIN TRANSACTION;\n${statements.join(";\n")};\nCOMMIT TRANSACTION;`;
    return this.execute(sql, vars);
  }

  async live(
    table: string,
    callback: (data: any) => void,
  ): Promise<Result<string, DatabaseError>> {
    try {
      const queryUuid = await this.db.live(table, (action, result) => {
        callback({
          action,
          result,
          table,
          timestamp: new Date().toISOString(),
        });
      });
      const id = String(queryUuid);
      this.liveQueries.push(id);
      this.logger.log(`LIVE SELECT on ${table} started (${id})`);
      return ok(id);
    } catch (error) {
      return err(
        new DatabaseError(`LIVE SELECT on ${table} failed: ${error}`, error),
      );
    }
  }

  async killLive(queryId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.query(`KILL $id`, { id: queryId });
      this.liveQueries = this.liveQueries.filter((id) => id !== queryId);
      return ok(undefined);
    } catch (error) {
      return err(new DatabaseError(`Kill live query failed: ${error}`, error));
    }
  }

  // --- Migrations ---

  async runMigration(
    migrationPath: string,
  ): Promise<Result<void, DatabaseError>> {
    try {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      const statements = this.parseSqlStatements(sql);
      let applied = 0;
      let failed = 0;

      for (const stmt of statements) {
        try {
          await this.db.query(stmt);
          applied++;
        } catch (error: any) {
          failed++;
          this.logger.warn(
            `Migration stmt failed (${path.basename(migrationPath)}): ${error.message?.slice(0, 120)}`,
          );
        }
      }

      this.logger.log(
        `Migration applied: ${path.basename(migrationPath)} (${applied} ok, ${failed} failed)`,
      );
      return ok(undefined);
    } catch (error) {
      return err(new DatabaseError(`Migration failed: ${error}`, error));
    }
  }

  /**
   * Parse SQL respecting braces (for DEFINE FUNCTION bodies).
   * Splits on `;` only when brace depth is 0.
   */
  private parseSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of sql) {
      if (char === "{") depth++;
      if (char === "}") depth--;
      if (char === ";" && depth === 0) {
        const trimmed = current.trim();
        if (trimmed.length > 0 && !trimmed.startsWith("--")) {
          statements.push(trimmed);
        }
        current = "";
      } else {
        current += char;
      }
    }

    const trimmed = current.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("--")) {
      statements.push(trimmed);
    }

    return statements;
  }

  async ping(): Promise<Result<boolean, DatabaseError>> {
    try {
      await this.db.query("RETURN true");
      return ok(true);
    } catch (error) {
      return err(new DatabaseError(`Ping failed: ${error}`, error));
    }
  }

  /**
   * SurrealDB 3.0 doesn't coerce ISO strings to datetime.
   * Recursively convert ISO date strings to Date objects for SCHEMAFULL tables.
   */
  private coerceDatetimes<T>(data: T): T {
    if (data === null || data === undefined) return data;
    if (data instanceof Date) return data;
    if (
      typeof data === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(data)
    ) {
      return new Date(data) as unknown as T;
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.coerceDatetimes(item)) as unknown as T;
    }
    if (typeof data === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        result[key] = this.coerceDatetimes(value);
      }
      return result as T;
    }
    return data;
  }
}
