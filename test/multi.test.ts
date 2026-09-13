import { test } from "node:test";
import * as assert from "node:assert/strict";
import { JobCancelledError, MissingResultError, MultiJobQueue } from "../src";

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const resolveAll = (keys: string[]) => {
    const result = new Map<string, string>();
    for (const key of keys) {
        result.set(key, key.toUpperCase());
    }
    return Promise.resolve(result);
};

test("passes every queued key to the runner in one call", async t => {
    const batches: string[][] = [];
    const queue = new MultiJobQueue<string, string>(keys => {
        batches.push([...keys].sort());
        return resolveAll(keys);
    }, 40);
    t.after(() => queue.end());

    const [a, b, alsoA] = await Promise.all([queue.add("a"), queue.add("b"), queue.add("a")]);

    assert.equal(a, "A");
    assert.equal(b, "B");
    assert.equal(alsoA, "A");
    assert.deepEqual(batches, [["a", "b"]], "one runner call covering both keys");
});

test("rejects keys the runner left out of the returned map", async t => {
    const queue = new MultiJobQueue<string, string>(keys => {
        const result = new Map<string, string>();
        for (const key of keys) {
            if (key !== "missing") {
                result.set(key, key.toUpperCase());
            }
        }
        return Promise.resolve(result);
    }, 30);
    t.after(() => queue.end());

    const present = queue.add("here");
    const absent = queue.add("missing");

    assert.equal(await present, "HERE");
    await assert.rejects(absent, (err: unknown) =>
        err instanceof MissingResultError && err.key === "missing");
});

test("a key mapped to an explicit undefined still resolves", async t => {
    const queue = new MultiJobQueue<string, string | undefined>(keys => {
        const result = new Map<string, string | undefined>();
        for (const key of keys) {
            result.set(key, undefined);
        }
        return Promise.resolve(result);
    }, 30);
    t.after(() => queue.end());

    assert.equal(await queue.add("k"), undefined);
});

test("a rejecting runner rejects every key in the batch", async t => {
    const queue = new MultiJobQueue<string, string>(() => Promise.reject(new Error("nope")), 20);
    t.after(() => queue.end());

    await assert.rejects(queue.add("a"), /nope/);
});

test("a runner that throws synchronously rejects the batch and leaves the queue running", async t => {
    let first = true;
    const queue = new MultiJobQueue<string, string>(keys => {
        if (first) {
            first = false;
            throw new Error("sync boom");
        }
        return resolveAll(keys);
    }, 20);
    t.after(() => queue.end());

    await assert.rejects(queue.add("a"), /sync boom/);
    assert.equal(await queue.add("b"), "B", "queue still ticks after the runner threw");
});

test("a runner that resolves a non-map rejects the batch", async t => {
    const queue = new MultiJobQueue<string, string>(
        () => Promise.resolve(undefined as unknown as Map<string, string>), 20);
    t.after(() => queue.end());

    await assert.rejects(queue.add("a"), (err: unknown) => err instanceof MissingResultError);
});

test("maxPerRun caps the batch size without stalling", async t => {
    const batches: string[][] = [];
    const queue = new MultiJobQueue<string, string>(keys => {
        batches.push([...keys].sort());
        return delay(5).then(() => {
            const result = new Map<string, string>();
            for (const key of keys) {
                result.set(key, key.toUpperCase());
            }
            return result;
        });
    }, 20, 2);
    t.after(() => queue.end());

    const all = await Promise.all(["a", "b", "c"].map(key => queue.add(key)));

    assert.deepEqual(all, ["A", "B", "C"]);
    assert.ok(batches.every(batch => batch.length <= 2), `batches were ${ JSON.stringify(batches) }`);
    assert.equal(batches.length, 2);
});

test("end() rejects queued jobs and every later add", async t => {
    const queue = new MultiJobQueue<string, string>(resolveAll, 10_000);

    const queued = queue.add("k");
    queue.end();

    await assert.rejects(queued, (err: unknown) =>
        err instanceof JobCancelledError && err.reason === "ended");
    await assert.rejects(queue.add("later"), (err: unknown) =>
        err instanceof JobCancelledError && err.reason === "ended");
});
