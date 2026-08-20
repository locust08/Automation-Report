import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertTikTokReceiptLockOwned,
  getTikTokReceiptLockPaths,
  withTikTokReceiptLock as withTikTokReceiptLockOnSingleHost,
} from "../../lib/tiktok/setup-receipt-lock";

const REVISION_A = "ttrev_aaaaaaaaaaaaaaaaaaaa";
const REVISION_B = "ttrev_bbbbbbbbbbbbbbbbbbbb";

function withTikTokReceiptLock<T>(
  params: Omit<Parameters<typeof withTikTokReceiptLockOnSingleHost<T>>[0], "executionMode">,
) {
  return withTikTokReceiptLockOnSingleHost({
    ...params,
    executionMode: "SINGLE_PERSISTENT_HOST",
  });
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tiktok-receipt-lock-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function waitUntilEntered(promise: Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out waiting for lock callback")), 1_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("excludes a concurrent writer for the same revision within a bounded timeout", async () => {
  await withRoot(async (root) => {
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const first = withTikTokReceiptLock({
      revisionId: REVISION_A,
      operation: "create",
      root,
      timeoutMs: 25,
      run: async (lock) => {
        await assertTikTokReceiptLockOwned(lock);
        firstEntered.resolve();
        await releaseFirst.promise;
        return "first";
      },
    });

    await waitUntilEntered(firstEntered.promise);
    try {
      await assert.rejects(
        withTikTokReceiptLock({
          revisionId: REVISION_A,
          operation: "activate",
          root,
          timeoutMs: 25,
          run: async () => "second",
        }),
        /receipt is locked by another writer/,
      );
    } finally {
      releaseFirst.resolve();
      assert.equal(await first, "first");
    }
  });
});

test("allows different revisions to hold their locks at the same time", async () => {
  await withRoot(async (root) => {
    const firstEntered = deferred();
    const secondEntered = deferred();
    const releaseBoth = deferred();
    const first = withTikTokReceiptLock({
      revisionId: REVISION_A,
      operation: "preview",
      root,
      timeoutMs: 25,
      run: async () => {
        firstEntered.resolve();
        await releaseBoth.promise;
        return "first";
      },
    });

    await waitUntilEntered(firstEntered.promise);
    const second = withTikTokReceiptLock({
      revisionId: REVISION_B,
      operation: "activation-preview",
      root,
      timeoutMs: 25,
      run: async () => {
        secondEntered.resolve();
        await releaseBoth.promise;
        return "second";
      },
    });

    try {
      await waitUntilEntered(secondEntered.promise);
    } finally {
      releaseBoth.resolve();
    }
    assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  });
});

test("releases the revision lock when its callback throws", async () => {
  await withRoot(async (root) => {
    await assert.rejects(
      withTikTokReceiptLock({
        revisionId: REVISION_A,
        operation: "create",
        root,
        run: async () => {
          throw new Error("callback failed");
        },
      }),
      /callback failed/,
    );

    let replacementEntered = false;
    await withTikTokReceiptLock({
      revisionId: REVISION_A,
      operation: "activate",
      root,
      timeoutMs: 25,
      run: async (lock) => {
        replacementEntered = true;
        await assertTikTokReceiptLockOwned(lock);
      },
    });
    assert.equal(replacementEntered, true);
  });
});

test("recovers a stale owner sidecar when no SQLite writer is alive", async () => {
  await withRoot(async (root) => {
    const paths = getTikTokReceiptLockPaths(REVISION_A, root);
    assert.equal(
      paths.databasePath.includes(path.join("outputs", "state", "tiktok_ads", "setup_launcher")),
      true,
    );
    await mkdir(paths.directory, { recursive: true });
    const staleToken = "00000000-0000-4000-8000-000000000001";
    await writeFile(paths.ownerPath, `${JSON.stringify({
      schemaVersion: 1,
      token: staleToken,
      pid: 999_999,
      hostname: "stale-host",
      operation: "create",
      acquiredAt: "2025-01-01T00:00:00.000Z",
    })}\n`, { mode: 0o600 });

    await withTikTokReceiptLock({
      revisionId: REVISION_A,
      operation: "preview",
      root,
      now: () => new Date("2026-08-18T01:00:00.000Z"),
      run: async (lock) => {
        await assertTikTokReceiptLockOwned(lock);
        const currentOwner = JSON.parse(await readFile(paths.ownerPath, "utf8")) as {
          token: string;
          operation: string;
          acquiredAt: string;
        };
        assert.notEqual(currentOwner.token, staleToken);
        assert.equal(currentOwner.token, lock.token);
        assert.equal(currentOwner.operation, "preview");
        assert.equal(currentOwner.acquiredAt, "2026-08-18T01:00:00.000Z");
      },
    });

    await assert.rejects(readFile(paths.ownerPath, "utf8"), { code: "ENOENT" });
  });
});

test("fails closed outside explicit single-persistent-host execution", async () => {
  await withRoot(async (root) => {
    let entered = false;
    await assert.rejects(
      withTikTokReceiptLockOnSingleHost({
        revisionId: REVISION_A,
        operation: "create",
        executionMode: "MULTI_HOST_OR_EPHEMERAL",
        root,
        run: async () => {
          entered = true;
        },
      }),
      /requires explicit SINGLE_PERSISTENT_HOST execution/,
    );
    assert.equal(entered, false);
    const paths = getTikTokReceiptLockPaths(REVISION_A, root);
    await assert.rejects(readFile(paths.ownerPath, "utf8"), { code: "ENOENT" });
  });
});

test("owner-token tampering is fenced and never removes the replacement owner", async () => {
  await withRoot(async (root) => {
    const paths = getTikTokReceiptLockPaths(REVISION_A, root);
    const replacementToken = "00000000-0000-4000-8000-000000000002";
    await assert.rejects(
      withTikTokReceiptLock({
        revisionId: REVISION_A,
        operation: "create",
        root,
        run: async (lock) => {
          await writeFile(lock.ownerPath, `${JSON.stringify({
            schemaVersion: 1,
            token: replacementToken,
            pid: process.pid,
            hostname: "replacement-owner",
            operation: "activate",
            acquiredAt: "2026-08-18T01:00:00.000Z",
          })}\n`, { mode: 0o600 });
          await assertTikTokReceiptLockOwned(lock);
        },
      }),
      /lock ownership changed/,
    );
    const replacement = JSON.parse(await readFile(paths.ownerPath, "utf8")) as { token: string };
    assert.equal(replacement.token, replacementToken);
  });
});
