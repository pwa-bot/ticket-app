import assert from "node:assert/strict";
import test from "node:test";
import {
  clearQueryCache,
  fetchWithQueryCache,
  readFreshQueryCache,
  readQueryCache,
} from "@/lib/space-query-cache";

test("fetchWithQueryCache de-dupes in-flight requests", async () => {
  clearQueryCache();

  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true, calls };
  };

  const [a, b] = await Promise.all([
    fetchWithQueryCache("attention:all", fetcher),
    fetchWithQueryCache("attention:all", fetcher),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(readQueryCache("attention:all"), a);
});

test("readFreshQueryCache returns stale misses and force bypasses in-flight cache", async () => {
  clearQueryCache();

  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { value: calls };
  };

  const first = await fetchWithQueryCache("tickets:all", fetcher);
  assert.equal(first.value, 1);
  assert.equal(readFreshQueryCache("tickets:all", 1_000)?.value, 1);

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(readFreshQueryCache("tickets:all", 1), undefined);

  const forced = await fetchWithQueryCache("tickets:all", fetcher, { force: true });
  assert.equal(forced.value, 2);
  assert.equal(calls, 2);
});
