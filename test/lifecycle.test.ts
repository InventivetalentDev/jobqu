import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const entry = path.resolve(__dirname, "../src/index.js");

const runScript = (body: string) => spawnSync(process.execPath, [
    "-e", `const { JobQueue } = require(${ JSON.stringify(entry) });\n${ body }`
], { timeout: 5_000, encoding: "utf8" });

test("a running queue keeps the process alive", () => {
    const result = runScript(`new JobQueue(key => Promise.resolve(key), 50);`);

    assert.equal(result.signal, "SIGTERM", `expected the process to be killed by the timeout, got ${ result.status }`);
});

test("unref() lets the process exit while the queue is idle", () => {
    const result = runScript(`new JobQueue(key => Promise.resolve(key), 50).unref();`);

    assert.equal(result.status, 0, `process did not exit on its own: ${ result.stderr }`);
    assert.equal(result.signal, null);
});

test("end() lets the process exit", () => {
    const result = runScript(`const q = new JobQueue(key => Promise.resolve(key), 50); q.end();`);

    assert.equal(result.status, 0, `process did not exit on its own: ${ result.stderr }`);
    assert.equal(result.signal, null);
});
