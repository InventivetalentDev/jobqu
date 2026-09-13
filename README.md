## jobqu
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FInventivetalentDev%2Fjobqu.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FInventivetalentDev%2Fjobqu?ref=badge_shield)

Queue to run jobs with unique keys at fixed intervals

```
npm install --save jobqu
```

## Single
Collects all promises for a key & calls the runner function once per key per interval
```typescript
import { JobQueue } from "jobqu";

const queue = new JobQueue<string, string>(function (s: string) {
    console.log("runner: " + s);
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(s + Math.ceil(Math.random() * 100000));
        }, Math.random() * 1000);
    })
});
queue.add("mykey").then(val => {
    console.log("mykey 1: " + val);
});
queue.add("notmykey").then(val => {
    console.log("notmykey 1: " + val);
})
queue.add("mykey").then(val => {
    console.log("mykey 2: " + val);
});
setTimeout(() => {
    queue.add("mykey").then(val => {
        console.log("mykey 3: " + val);
    });
    queue.add("notmykey").then(val => {
        console.log("notmykey 2: " + val);
    })
}, 100);
// mykey 1 == mykey 2 == mykey 3
// notmykey 1 == notmykey 2
setTimeout(() => queue.end(), 5000);

/*
runner: mykey
runner: notmykey
notmykey 1: notmykey26663
notmykey 2: notmykey26663
mykey 1: mykey40915
mykey 2: mykey40915
mykey 3: mykey40915
 */
```

## Multi
Collects all promises for a key & calls the runner function with multiple keys to resolve
```typescript
import { MultiJobQueue } from "jobqu";

const queue = new MultiJobQueue<string, string>(function (sa: string[]) {
    console.log("runner: " + sa);
    return new Promise(resolve => {
        setTimeout(() => {
            let result = new Map<string, string>();
            for (let s of sa) {
                result.set(s, s + Math.ceil(Math.random() * 100000));
            }
            resolve(result);
        }, Math.random() * 1000);
    })
});
queue.add("mykey").then(val => {
    console.log("mykey 1: " + val);
});
queue.add("notmykey").then(val=>{
    console.log("notmykey 1: " + val);
})
queue.add("mykey").then(val => {
    console.log("mykey 2: " + val);
});
setTimeout(() => {
    queue.add("mykey").then(val => {
        console.log("mykey 3: " + val);
    });
    queue.add("notmykey").then(val=>{
        console.log("notmykey 2: " + val);
    })
}, 100);
// mykey 1 == mykey 2 == mykey 3
// notmykey 1 == notmykey 2
setTimeout(() => queue.end(), 5000);

/*
runner: mykey,notmykey
mykey 1: mykey23920
mykey 2: mykey23920
mykey 3: mykey23920
notmykey 1: notmykey18288
notmykey 2: notmykey18288
 */
```


## Options
Both queues take the same constructor arguments:
```typescript
new JobQueue<K, V>(runner, interval?, maxPerRun?)
new MultiJobQueue<K, V>(runner, interval?, maxPerRun?)
```

| Argument | Default | Description |
| --- | --- | --- |
| `runner` | *(required)* | `JobQueue`: `(key: K) => Promise<V>`<br>`MultiJobQueue`: `(keys: K[]) => Promise<Map<K, V>>` |
| `interval` | `1000` | milliseconds between runs |
| `maxPerRun` | `-1` | maximum keys handed to the runner per interval (`-1` for unlimited) |

Runs are always at least `interval` apart, and everything added in the meantime is collected into
the next one. A key that is still running is skipped, so the same key never runs twice at once —
and a slow key never holds up the rest of the queue, even with `maxPerRun` set. Jobs added while
their key is running are collected for the next run rather than resolved with the older value.

## Methods

| Method | Description |
| --- | --- |
| `add(key)` | queue a job, returns `Promise<V>` |
| `remove(key)` | drop a queued job, rejecting its promise; returns whether one was queued |
| `clear()` | drop every queued job, rejecting their promises |
| `end()` | stop the queue task and drop every queued job |
| `unref()` / `ref()` | whether *queued* jobs keep the node process alive (`ref` by default) |
| `size` | number of keys waiting to run |
| `activeSize` | number of keys currently handed to the runner |
| `keys()` | keys waiting to run |

## Errors
Whatever the runner throws or rejects with is passed straight through to every job in that run.
Two errors come from the queue itself:

```typescript
import { JobCancelledError, MissingResultError } from "jobqu";

queue.add("mykey").catch(err => {
    if (err instanceof JobCancelledError) {
        // err.reason is "removed", "cleared" or "ended"
    }
});
```

- **`JobCancelledError`** — the job was dropped by `remove()`, `clear()` or `end()` before it ran,
  or `add()` was called after `end()`. A job already handed to the runner cannot be cancelled and
  settles as usual.
- **`MissingResultError`** — `MultiJobQueue` only: the runner's map had no entry for this key. To
  say "no value", map the key to an explicit value such as `null` instead of leaving it out.

## Stopping
The queue only holds a timer while it has jobs to run. Once it drains it stops ticking entirely, so
an idle queue never keeps the node process alive — and it wakes back up on the next `add()`.

While jobs *are* waiting the timer does keep the process alive, so pending work is not dropped on
the way out. Call `unref()` if not even that should hold the process open:
```typescript
const queue = new JobQueue<string, string>(runner).unref();
```

`end()` stops the queue for good and rejects everything still queued, so awaiting callers are never
left hanging. It cannot be restarted — `add()` rejects once it has ended.


## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FInventivetalentDev%2Fjobqu.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FInventivetalentDev%2Fjobqu?ref=badge_large)