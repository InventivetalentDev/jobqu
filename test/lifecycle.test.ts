import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const entry = path.resolve(__dirname, "../src/index.js");

const runScript = (body: string) => {
    const result = spawnSync(process.execPath, [
        "-e", `const { JobQueue } = require(${ JSON.stringify(entry) });\n${ body }`
    ], { timeout: 5_000, encoding: "utf8" });
    assert.equal(result.signal, null,
        `process had to be killed - it never exited on its own. stdout: ${ result.stdout }`);
    assert.equal(result.status, 0, `process exited ${ result.status }: ${ result.stderr }`);
    return result.stdout.trim();
};

test("an idle queue does not keep the process alive", () => {
    runScript(`new JobQueue(key => Promise.resolve(key), 50);`);
});

test("a queued job keeps the process alive until it has run", () => {
    const out = runScript(`
        const queue = new JobQueue(key => Promise.resolve("ran:" + key), 300);
        queue.add("k").then(value => console.log(value));
    `);

    assert.equal(out, "ran:k", "the process exited before running the queued job");
});

test("the queue wakes back up for jobs added after it drained", () => {
    // the timer stops once "a" is done, so adding "b" has to arm it again
    const out = runScript(`
        const queue = new JobQueue(key => Promise.resolve("ran:" + key), 100);
        queue.add("a").then(value => console.log(value));
        setTimeout(() => queue.add("b").then(value => console.log(value)), 400);
    `);

    assert.deepEqual(out.split("\n"), ["ran:a", "ran:b"]);
});

test("unref() lets the process exit even with a job queued", () => {
    const out = runScript(`
        const queue = new JobQueue(key => Promise.resolve("ran:" + key), 300).unref();
        queue.add("k").then(value => console.log(value));
    `);

    assert.equal(out, "", "unref()'d queue should not have held the process open for the job");
});

test("end() lets the process exit", () => {
    runScript(`const queue = new JobQueue(key => Promise.resolve(key), 50); queue.end();`);
});
