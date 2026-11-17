import test from "node:test";
import assert from "node:assert/strict";
import { emptyLedger } from "./model.ts";
import {
  CloudConflict,
  encodeLedger,
  decodeLedger,
  readCloud,
  writeCloud,
  DATA_REPOSITORY,
} from "./cloud.ts";

const sha = "a".repeat(40);
const token = "github_pat_test_only";

test("GitHub storage preserves Chinese, emoji and complete ledger values", () => {
  const ledger = emptyLedger();
  ledger.categories[0].name = "云端账本 ☁️𠮷";
  assert.deepEqual(decodeLedger(encodeLedger(ledger)), ledger);
  assert.throws(() => decodeLedger(btoa('{"version":1}')));
});

test("read validates the private file before exposing a ledger", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(new URL(url).host, "api.github.com");
      assert.equal(
        new URL(url).pathname,
        `/repos/${DATA_REPOSITORY}/contents/ledger.json`,
      );
      assert.equal(options.cache, "no-store");
      return Response.json({
        type: "file",
        sha,
        encoding: "base64",
        content: encodeLedger(emptyLedger()),
      });
    },
  );
  assert.deepEqual(await readCloud(token), {
    ledger: emptyLedger(),
    revision: sha,
  });
});

test("writes send the expected file SHA and never include the token in the content", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      assert.equal(options.method, "PUT");
      const body = JSON.parse(options.body as string);
      assert.equal(body.sha, sha);
      assert.equal(body.branch, "main");
      assert.equal(
        (options.headers as Record<string, string>).Authorization,
        `Bearer ${token}`,
      );
      assert.equal((options.body as string).includes(token), false);
      assert.deepEqual(decodeLedger(body.content), emptyLedger());
      return Response.json({ content: { sha: "b".repeat(40) } });
    },
  );
  assert.equal(
    (await writeCloud(emptyLedger(), sha, token)).revision,
    "b".repeat(40),
  );
});

test("stale writes are rejected without retrying with a newer SHA", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 409 });
  });
  await assert.rejects(writeCloud(emptyLedger(), sha, token), CloudConflict);
  assert.equal(calls, 1);
});

test("network failures and unauthorized reads never claim a successful save", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("offline");
  });
  await assert.rejects(writeCloud(emptyLedger(), sha, token), /保存未确认/);
  fetchMock.mock.mockImplementation(
    async () => new Response("", { status: 401 }),
  );
  await assert.rejects(readCloud(token), /令牌已失效/);
});
