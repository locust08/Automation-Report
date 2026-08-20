import crypto from "node:crypto";
import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { z } from "zod";

export type TikTokReceiptLockOperation =
  | "preview"
  | "create"
  | "activation-preview"
  | "activate";

export type TikTokReceiptLockExecutionMode =
  | "SINGLE_PERSISTENT_HOST"
  | "MULTI_HOST_OR_EPHEMERAL";

const ownerSchema = z.object({
  schemaVersion: z.literal(1),
  token: z.string().uuid(),
  pid: z.number().int().positive(),
  hostname: z.string().min(1),
  operation: z.enum(["preview", "create", "activation-preview", "activate"]),
  acquiredAt: z.string().datetime(),
}).strict();

export type TikTokReceiptLock = {
  revisionId: string;
  token: string;
  databasePath: string;
  ownerPath: string;
  database: InstanceType<typeof Database>;
  released: boolean;
};

function validateRevisionId(revisionId: string) {
  if (!/^ttrev_[a-f0-9]{20}$/.test(revisionId)) throw new Error("Invalid TikTok setup revision ID");
}

export function getTikTokReceiptLockPaths(revisionId: string, root = process.cwd()) {
  validateRevisionId(revisionId);
  const directory = getTikTokSetupStateDirectory(root);
  const prefix = path.join(directory, `receipt_${revisionId}.lock`);
  return {
    directory,
    databasePath: `${prefix}.sqlite`,
    ownerPath: `${prefix}.json`,
  };
}

export function getTikTokSetupStateDirectory(root = process.cwd()) {
  return path.join(root, "outputs", "state", "tiktok_ads", "setup_launcher");
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, "r");
  try {
    try {
      await handle.sync();
    } catch (error) {
      if (
        process.platform !== "win32"
        || !(error instanceof Error)
        || !("code" in error)
        || error.code !== "EPERM"
      ) {
        throw error;
      }
    }
  } finally {
    await handle.close();
  }
}

async function durableAtomicWrite(pathname: string, contents: string, token: string) {
  const temporary = `${pathname}.${token}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  try {
    await rename(temporary, pathname);
    await syncDirectory(path.dirname(pathname));
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function writeOwner(pathname: string, owner: z.infer<typeof ownerSchema>) {
  await durableAtomicWrite(pathname, `${JSON.stringify(owner, null, 2)}\n`, owner.token);
}

export async function acquireTikTokReceiptLock(params: {
  revisionId: string;
  operation: TikTokReceiptLockOperation;
  executionMode: TikTokReceiptLockExecutionMode;
  root?: string;
  now?: () => Date;
  timeoutMs?: number;
}) {
  if (params.executionMode !== "SINGLE_PERSISTENT_HOST") {
    throw new Error(
      "TikTok setup local receipt locking requires explicit SINGLE_PERSISTENT_HOST execution; multi-host, serverless, and ephemeral execution require a shared transactional receipt backend",
    );
  }
  const paths = getTikTokReceiptLockPaths(params.revisionId, params.root);
  await mkdir(paths.directory, { recursive: true });
  const database = new Database(paths.databasePath, {
    timeout: params.timeoutMs ?? 100,
  });
  await chmod(paths.databasePath, 0o600);
  try {
    database.pragma("synchronous = FULL");
    database.exec("BEGIN EXCLUSIVE");
    database.exec(`
      CREATE TABLE IF NOT EXISTS receipt_initialization (
        revision_id TEXT PRIMARY KEY,
        initialized_at TEXT NOT NULL
      )
    `);
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    database.close();
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "SQLITE_BUSY") {
      throw new Error(`TikTok setup receipt is locked by another writer: ${params.revisionId}`);
    }
    throw error;
  }

  const token = crypto.randomUUID();
  const lock: TikTokReceiptLock = {
    revisionId: params.revisionId,
    token,
    databasePath: paths.databasePath,
    ownerPath: paths.ownerPath,
    database,
    released: false,
  };
  try {
    await writeOwner(paths.ownerPath, ownerSchema.parse({
      schemaVersion: 1,
      token,
      pid: process.pid,
      hostname: os.hostname(),
      operation: params.operation,
      acquiredAt: (params.now?.() ?? new Date()).toISOString(),
    }));
    return lock;
  } catch (error) {
    database.exec("ROLLBACK");
    database.close();
    throw error;
  }
}

export async function hasTikTokInitializedReceipt(lock: TikTokReceiptLock) {
  await assertTikTokReceiptLockOwned(lock);
  const row = lock.database.prepare(
    "SELECT revision_id FROM receipt_initialization WHERE revision_id = ?",
  ).get(lock.revisionId) as { revision_id?: string } | undefined;
  return row?.revision_id === lock.revisionId;
}

export async function markTikTokReceiptInitialized(
  lock: TikTokReceiptLock,
  initializedAt: string,
) {
  await assertTikTokReceiptLockOwned(lock);
  lock.database.prepare(`
    INSERT INTO receipt_initialization (revision_id, initialized_at)
    VALUES (?, ?)
    ON CONFLICT(revision_id) DO NOTHING
  `).run(lock.revisionId, initializedAt);
}

export async function assertTikTokReceiptLockOwned(lock: TikTokReceiptLock) {
  if (lock.released || !lock.database.inTransaction) {
    throw new Error(`TikTok setup receipt lock is no longer held: ${lock.revisionId}`);
  }
  let owner: z.infer<typeof ownerSchema>;
  try {
    owner = ownerSchema.parse(JSON.parse(await readFile(lock.ownerPath, "utf8")));
  } catch {
    throw new Error(`TikTok setup receipt lock ownership is unavailable: ${lock.revisionId}`);
  }
  if (owner.token !== lock.token) {
    throw new Error(`TikTok setup receipt lock ownership changed: ${lock.revisionId}`);
  }
}

export async function releaseTikTokReceiptLock(lock: TikTokReceiptLock) {
  if (lock.released) return;
  let ownershipError: unknown;
  let transactionError: unknown;
  try {
    await assertTikTokReceiptLockOwned(lock);
    await unlink(lock.ownerPath);
    await syncDirectory(path.dirname(lock.ownerPath));
  } catch (error) {
    ownershipError = error;
  } finally {
    try {
      if (lock.database.inTransaction) {
        lock.database.exec(ownershipError ? "ROLLBACK" : "COMMIT");
      }
    } catch (error) {
      transactionError = error;
    }
    try {
      lock.database.close();
    } catch (error) {
      transactionError ??= error;
    }
    lock.released = true;
  }
  if (ownershipError) throw ownershipError;
  if (transactionError) throw transactionError;
}

export async function withTikTokReceiptLock<T>(params: {
  revisionId: string;
  operation: TikTokReceiptLockOperation;
  executionMode: TikTokReceiptLockExecutionMode;
  root?: string;
  now?: () => Date;
  timeoutMs?: number;
  run: (lock: TikTokReceiptLock) => Promise<T>;
}) {
  const lock = await acquireTikTokReceiptLock(params);
  try {
    return await params.run(lock);
  } finally {
    await releaseTikTokReceiptLock(lock);
  }
}
