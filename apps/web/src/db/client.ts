import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy-load the database connection to avoid build-time errors
let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const sql = neon(process.env.DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

// For convenience, export a getter (use getDb() in code that may run at build time)
export const db = {
  get query() {
    return getDb().query;
  },
  insert: (...args: Parameters<NeonHttpDatabase<typeof schema>["insert"]>) => getDb().insert(...args),
  update: (...args: Parameters<NeonHttpDatabase<typeof schema>["update"]>) => getDb().update(...args),
  delete: (...args: Parameters<NeonHttpDatabase<typeof schema>["delete"]>) => getDb().delete(...args),
};

export { schema };
