import { test } from "node:test";
import * as assert from "node:assert/strict";
import { JobCancelledError, JobQueue } from "../src";

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

test("collects all adds for a key into a single runner call", async t => {
    let runs = 0;
    const queue = new JobQueue<string, string>(key => {
        const id = ++runs;
        return delay(10).then(() => `${ key }#${ id }`);
    }, 40);
    t.after(() => queue.end());

    const [a, b, c] = await Promise.all([queue.add("x"), queue.add("x"), queue.add("y")]);

    assert.equal(a, b, "both adds for the same key resolve with the same value");
    assert.notEqual(a, c);
    assert.equal(runs, 2, "one runner call per key");
});

test("a rejecting runner rejects every add for that key", async t => {
    const queue = new JobQueue<string, string>(() => Promise.reject(new Error("nope")), 20);
    t.after(() => queue.end());

    const first = queue.add("k");
    const second = queue.add("k");

    await assert.rejects(first, /nope/);
    await assert.rejects(second, /nope/);
});

test("a runner that throws synchronously rejects the job and leaves the queue running", async t => {
    const queue = new JobQueue<string, string>(key => {
        if (key === "boom") {
            throw new Error("sync boom");
        }
        return Promise.resolve(`ok:${ key }`);
    }, 20);
    t.after(() => queue.end());

    await assert.rejects(queue.add("boom"), /sync boom/);
    assert.equal(await queue.add("fine"), "ok:fine", "queue still ticks after the runner threw");
});

test("maxPerRun does not stall behind a key that is still running", async t => {
    const started: string[] = [];
    const queue = new JobQueue<string, string>(key => {
        started.push(key);
        return delay(key === "slow" ? 500 : 5).then(() => key);
    }, 20, 1);
    t.after(() => queue.end());

    queue.add("slow").catch(() => { /* still in flight when the test ends */ });
    await delay(30); // let "slow" get picked up first

    assert.equal(await queue.add("fast"), "fast", "'fast' ran while 'slow' was still in flight");
    assert.deepEqual(started, ["slow", "fast"]);
});

test("jobs added while a key is in flight get their own run", async t => {
    let runs = 0;
    const queue = new JobQueue<string, string>(() => {
        const id = ++runs;
        return delay(120).then(() => `run#${ id }`);
    }, 20);
    t.after(() => queue.end());

    const first = queue.add("k");
    await delay(60); // run#1 is now in flight
    const second = queue.add("k");

    assert.equal(await first, "run#1");
    assert.equal(await second, "run#2", "the later add is not served a value that predates it");
    assert.equal(runs, 2);
});

test("remove() rejects a queued job", async t => {
    const queue = new JobQueue<string, string>(key => Promise.resolve(key), 10_000);
    t.after(() => queue.end());

    const job = queue.add("k");

    assert.equal(queue.remove("k"), true);
    assert.equal(queue.remove("k"), false, "removing again reports nothing was queued");
    assert.equal(queue.size, 0);
    await assert.rejects(job, (err: unknown) =>
        err instanceof JobCancelledError && err.reason === "removed");
});

test("remove() does not disturb a run that is already in flight", async t => {
    let runs = 0;
    const queue = new JobQueue<string, string>(() => {
        const id = ++runs;
        return delay(120).then(() => `run#${ id }`);
    }, 20);
    t.after(() => queue.end());

    const first = queue.add("k");
    await delay(60); // run#1 is now in flight

    assert.equal(queue.remove("k"), false, "nothing is queued - the job is already running");
    const second = queue.add("k");

    assert.equal(await first, "run#1");
    assert.equal(await second, "run#2", "the re-added job gets a fresh run, not the old value");
    assert.equal(runs, 2, "no duplicate concurrent run for the same key");
});

test("clear() rejects every queued job", async t => {
    const queue = new JobQueue<string, string>(key => Promise.resolve(key), 10_000);
    t.after(() => queue.end());

    const a = queue.add("a");
    const b = queue.add("b");
    queue.clear();

    assert.equal(queue.size, 0);
    for (const job of [a, b]) {
        await assert.rejects(job, (err: unknown) =>
            err instanceof JobCancelledError && err.reason === "cleared");
    }
});

test("end() rejects queued jobs and every later add", async t => {
    const queue = new JobQueue<string, string>(key => Promise.resolve(key), 10_000);

    const queued = queue.add("k");
    queue.end();

    await assert.rejects(queued, (err: unknown) =>
        err instanceof JobCancelledError && err.reason === "ended");
    await assert.rejects(queue.add("later"), (err: unknown) =>
        err instanceof JobCancelledError && err.reason === "ended");
});

test("end() lets a run that is already in flight settle", async t => {
    const queue = new JobQueue<string, string>(key => delay(40).then(() => `ok:${ key }`), 20);

    const job = queue.add("k");
    await delay(30); // now in flight
    queue.end();

    assert.equal(await job, "ok:k");
});

test("size and activeSize report queued and in-flight keys", async t => {
    const queue = new JobQueue<string, string>(key => delay(120).then(() => key), 20);
    t.after(() => queue.end());

    queue.add("a").catch(() => {});
    assert.equal(queue.size, 1);
    assert.equal(queue.activeSize, 0);
    assert.deepEqual(Array.from(queue.keys()), ["a"]);

    await delay(40); // dispatched
    assert.equal(queue.size, 0);
    assert.equal(queue.activeSize, 1);
});
