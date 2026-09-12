import type { ClockPort } from "@/platform/clock";
import type { SqlStatement } from "./protocol";

export interface CommandContext {
  ownerId: string;
  operationId: string;
  expectedRevision?: number;
  clock?: ClockPort;
}

export interface DatabaseHealth {
  ok: boolean;
  storage: "opfs" | "native" | "memory";
  schemaVersion: number;
}

export interface DatabasePort {
  open(ownerKey?: string): Promise<void>;
  query<T extends Record<string, unknown>>(sql: string, bind?: SqlStatement["bind"]): Promise<T[]>;
  execute(sql: string, bind?: SqlStatement["bind"]): Promise<void>;
  batch(statements: SqlStatement[]): Promise<void>;
  transaction<T>(callback: (trx: DatabasePort) => Promise<T>): Promise<T>;
  close(): void | Promise<void>;
  health(): Promise<DatabaseHealth>;
  exportSnapshot?(): Promise<Uint8Array>;
}

export interface MediaMetadata {
  id: string;
  sha256: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  availability: "local" | "remote" | "both" | "missing";
}

export interface MediaPort {
  ingest(file: File | Blob, role?: string): Promise<MediaMetadata>;
  get(mediaId: string): Promise<Blob | Uint8Array | null>;
  removeUnreferenced(): Promise<number>;
  exportManifest(): Promise<MediaMetadata[]>;
}
