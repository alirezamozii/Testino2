export interface SqlStatement {
  sql: string;
  bind?: Array<unknown>;
}

export type DatabaseRequest =
  | { id: string; type: "open"; ownerKey?: string }
  | { id: string; type: "query"; statement: SqlStatement }
  | { id: string; type: "raw"; statement: SqlStatement }
  | { id: string; type: "batch"; statements: SqlStatement[] }
  | { id: string; type: "health" }
  | { id: string; type: "close" };

export type DatabaseReply =
  | { id: string; ok: true; rows?: Record<string, unknown>[]; storage?: "opfs" | "native" | "memory"; schemaVersion?: number }
  | { id: string; ok: false; error: string; code?: string };
