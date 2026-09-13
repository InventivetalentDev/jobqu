// Runs the compiled test suite.
//
// `node --test` only expands glob patterns from Node 21, and only accepts a directory
// before Node 22, so neither form works across the versions CI covers. Resolving the
// file list here and passing explicit paths works on all of them, on any platform.

const { readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const dir = path.join(__dirname, "..", "dist", "test");

let files;
try {
    files = readdirSync(dir)
        .filter(name => name.endsWith(".test.js"))
        .map(name => path.join(dir, name));
} catch (err) {
    console.error(`Could not read ${ dir } - run the build first.`);
    console.error(err.message);
    process.exit(1);
}

if (files.length === 0) {
    console.error(`No compiled tests found in ${ dir } - run the build first.`);
    process.exit(1);
}

const { status, error } = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
if (error) {
    throw error;
}
process.exit(status === null ? 1 : status);
