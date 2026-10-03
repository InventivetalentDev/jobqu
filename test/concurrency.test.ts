import { test } from "node:test";
import * as assert from "node:assert/strict";
import { JobCancelledError, JobQueue, MultiJobQueue } from "../src";

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 2000;
    while (!condition()) {
        assert.ok(Date.now() < deadline, "queue did not make progress");
        await delay(5);
    }
};

class InspectableQueue extends JobQueue<number, number> {
    get scheduled() { return this.task !== undefined; }
}

test("maxActive pauses dispatch without polling and resumes after success or failure", async t => {
    const jobs = new Map<number, { resolve: (value: number) => void; reject: (error: Error) => void }>();
    const times: number[] = [];
    const queue = new InspectableQueue(key => new Promise((resolve, reject) => {
        times.push(Date.now());
        jobs.set(key, { resolve, reject });
    }), 20, 1, { maxActive: 2 });
    t.after(() => queue.end());
    const pending = Promise.allSettled([0, 1, 2, 3].map(key => queue.add(key)));

    await waitFor(() => jobs.size === 2);
    await delay(50);
    assert.equal(jobs.size, 2);
    assert.equal(queue.activeSize, 2);
    assert.equal(queue.size, 2);
    assert.equal(queue.scheduled, false);
    jobs.get(0)!.reject(new Error("failed"));
    await waitFor(() => jobs.size === 3);
    assert.equal(queue.activeSize, 2);
    jobs.get(1)!.resolve(1);
    await waitFor(() => jobs.size === 4);
    assert.equal(queue.activeSize, 2);
    jobs.get(2)!.resolve(2);
    jobs.get(3)!.resolve(3);

    const results = await pending;
    assert.equal(results[0].status, "rejected");
    assert.deepEqual(results.slice(1), [1, 2, 3].map(value => ({ status: "fulfilled", value })));
    assert.equal(queue.activeSize, 0);
    assert.ok(times.slice(1).every((time, index) => time - times[index] >= 19), "dispatch respects its interval");
});

test("maxActive counts keys across batches and limits each batch to available capacity", async t => {
    const batches: number[][] = [];
    const finish: Array<() => void> = [];
    const queue = new MultiJobQueue<number, number>(keys => new Promise(resolve => {
        batches.push(keys);
        finish.push(() => resolve(new Map(keys.map(key => [key, key]))));
    }), 10, 2, { maxActive: 3 });
    t.after(() => queue.end());
    const pending = Promise.all([0, 1, 2, 3, 4].map(key => queue.add(key)));
    await waitFor(() => batches.length === 2);
    assert.deepEqual(batches, [[0, 1], [2]]);
    assert.equal(queue.activeSize, 3);
    await delay(30);
    assert.equal(batches.length, 2);
    finish[0]();
    await waitFor(() => batches.length === 3);
    assert.deepEqual(batches[2], [3, 4]);
    assert.equal(queue.activeSize, 3);
    finish[1]();
    finish[2]();
    assert.deepEqual(await pending, [0, 1, 2, 3, 4]);
});

test("ending a saturated queue rejects waiting jobs and lets the active job finish", async () => {
    let finish: ((value: number) => void) | undefined;
    const started: number[] = [];
    const queue = new JobQueue<number, number>(key => new Promise(resolve => {
        started.push(key);
        finish = resolve;
    }), 10, 1, { maxActive: 1 });
    const active = queue.add(0);
    const queued = queue.add(1);
    const rejected = assert.rejects(queued, (error: unknown) => error instanceof JobCancelledError && error.reason === "ended");
    await waitFor(() => finish !== undefined);
    queue.end();
    await rejected;
    finish!(0);
    assert.equal(await active, 0);
    await assert.rejects(queue.add(2), JobCancelledError);
    assert.deepEqual(started, [0]);
});

test("maxActive rejects invalid limits without changing the default constructor", () => {
    for (const value of [0, -2, 1.5, Infinity, NaN]) {
        assert.throws(() => new JobQueue(async key => key, 10, 1, { maxActive: value }), RangeError);
    }
    const queue = new JobQueue(async key => key);
    queue.end();
});
