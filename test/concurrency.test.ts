import { test } from "node:test";
import * as assert from "node:assert/strict";
import { JobQueue, MultiJobQueue } from "../src";

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
    const queue = new InspectableQueue(key => new Promise((resolve, reject) => {
        jobs.set(key, { resolve, reject });
    }), { interval: 20, maxPerRun: 1, maxActive: 2 });
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
});

test("maxActive counts keys across batches and limits each batch to available capacity", async t => {
    const batches: number[][] = [];
    const finish: Array<() => void> = [];
    const queue = new MultiJobQueue<number, number>(keys => new Promise(resolve => {
        batches.push(keys);
        finish.push(() => resolve(new Map(keys.map(key => [key, key]))));
    }), { interval: 10, maxPerRun: 2, maxActive: 3 });
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
