import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export class AtlasDatabase {
  readonly db: DatabaseSync;

  constructor(file = process.env.ATLAS_DB_PATH ?? path.join(process.cwd(), "data", "atlas.db")) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA foreign_keys = ON");
    const migrationDir = path.join(process.cwd(), "migrations");
    for (const migration of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
      this.db.exec(readFileSync(path.join(migrationDir, migration), "utf8"));
    }
  }

  all<T>(sql: string, ...params: any[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  get<T>(sql: string, ...params: any[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: any[]): void {
    this.db.prepare(sql).run(...params);
  }

  transaction<T>(callback: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
