export interface PromiseEntry<V> {
    resolve: (value: V) => void;
    reject: (error?: any) => void;
}

/**
 * Why a queued job was cancelled before it ever reached the runner.
 */
export type CancelReason = "removed" | "cleared" | "ended";

/**
 * Rejection handed to jobs that are dropped from the queue before running,
 * i.e. by {@link RunnerBase.remove}, {@link RunnerBase.clear} or {@link RunnerBase.end},
 * and to {@link RunnerBase.add} calls made after the queue has ended.
 */
export class JobCancelledError extends Error {

    constructor(readonly reason: CancelReason) {
        super(reason === "ended"
            ? "Job cancelled: queue has ended"
            : `Job cancelled: ${ reason } from queue before it ran`);
        this.name = "JobCancelledError";
    }

}

export abstract class RunnerBase<K, V> {

    protected readonly queue: Map<K, PromiseEntry<V>[]> = new Map<K, PromiseEntry<V>[]>();
    /** keys currently handed to the runner, guarding against concurrent runs of the same key */
    protected readonly running: Set<K> = new Set<K>();
    protected task?: ReturnType<typeof setTimeout>;
    protected ended: boolean = false;
    private unreffed: boolean = false;
    private lastRunAt: number = Date.now();

    protected constructor(protected readonly interval: number = 1000, protected readonly maxPerRun: number = -1) {
    }

    protected abstract run(): void;

    /**
     * Pick the keys to run this tick and take their entries out of the queue.
     *
     * Entries are captured at dispatch time, so jobs added while a key is in flight
     * are queued for a later run instead of being resolved with a value that predates them.
     */
    protected takeBatch(): Map<K, PromiseEntry<V>[]> {
        const batch = new Map<K, PromiseEntry<V>[]>();
        const limit = this.maxPerRun < 0 ? Infinity : this.maxPerRun;
        if (limit < 1) {
            return batch;
        }
        for (const key of this.queue.keys()) {
            // skip keys still in flight *before* applying the limit, so a slow key
            // can't hold up the rest of the queue
            if (this.running.has(key)) {
                continue;
            }
            batch.set(key, this.queue.get(key)!);
            if (batch.size >= limit) {
                break;
            }
        }
        for (const key of batch.keys()) {
            this.queue.delete(key);
            this.running.add(key);
        }
        return batch;
    }

    /**
     * Mark a key as no longer in flight, allowing it to be run again.
     */
    protected finish(key: K): void {
        this.running.delete(key);
        this.ensureScheduled();
    }

    /**
     * Run one tick, then re-arm the timer if there is anything left to do.
     */
    private tick(): void {
        this.task = undefined;
        this.lastRunAt = Date.now();
        try {
            this.run();
        } finally {
            // always re-arm, so a misbehaving runner can't kill the queue
            this.ensureScheduled();
        }
    }

    /**
     * Whether any queued key is ready to be handed to the runner.
     */
    private hasDispatchableWork(): boolean {
        for (const key of this.queue.keys()) {
            if (!this.running.has(key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Arm the timer, unless it is armed already or there is nothing to dispatch.
     *
     * An idle queue holds no timer at all, so it never keeps the process alive on its own.
     */
    protected ensureScheduled(): void {
        if (this.ended || this.task !== undefined || !this.hasDispatchableWork()) {
            return;
        }
        // hold the run cadence: wait out whatever is left of the interval since the last run
        const delay = Math.max(0, this.interval - (Date.now() - this.lastRunAt));
        this.task = setTimeout(() => this.tick(), delay);
        if (this.unreffed) {
            this.unrefTask();
        }
    }

    private unrefTask(): void {
        const task = this.task as any;
        if (task && typeof task.unref === "function") {
            task.unref();
        }
    }

    private cancelQueued(reason: CancelReason): void {
        const queued = Array.from(this.queue.values());
        this.queue.clear();
        for (const entries of queued) {
            for (const entry of entries) {
                entry.reject(new JobCancelledError(reason));
            }
        }
    }

    /**
     * Stop the queue task.
     *
     * Jobs still queued are rejected with a {@link JobCancelledError}; jobs already handed
     * to the runner settle as normal. Once ended, the queue does not run again and
     * {@link RunnerBase.add} rejects immediately.
     */
    end(): void {
        this.ended = true;
        if (this.task !== undefined) {
            clearTimeout(this.task);
            this.task = undefined;
        }
        this.cancelQueued("ended");
        this.running.clear();
    }

    /**
     * Add a job to run to this queue
     * @param key unique key to store this job by - jobs with the same key will resolve/reject together
     * @returns {Promise<V>} rejects with a {@link JobCancelledError} if the queue has ended,
     *          or if the job is removed/cleared before it runs
     */
    add(key: K): Promise<V> {
        if (this.ended) {
            return Promise.reject(new JobCancelledError("ended"));
        }
        const promise = new Promise<V>((resolve, reject) => {
            const entry: PromiseEntry<V> = { resolve, reject };
            const arr = this.queue.get(key);
            if (arr) {
                arr.push(entry);
            } else {
                this.queue.set(key, [entry]);
            }
        });
        this.ensureScheduled();
        return promise;
    }


    /**
     * Remove a queued job, rejecting its pending promises with a {@link JobCancelledError}.
     *
     * A job already handed to the runner cannot be cancelled and settles as normal.
     * @param key unique job key
     * @returns whether a queued job was removed
     */
    remove(key: K): boolean {
        const entries = this.queue.get(key);
        if (!entries) {
            return false;
        }
        this.queue.delete(key);
        for (const entry of entries) {
            entry.reject(new JobCancelledError("removed"));
        }
        return true;
    }

    /**
     * Remove all queued jobs, rejecting their pending promises with a {@link JobCancelledError}.
     *
     * Jobs already handed to the runner settle as normal.
     */
    clear(): void {
        this.cancelQueued("cleared");
    }

    /**
     * Allow the process to exit even while jobs are still queued.
     *
     * An idle queue holds no timer anyway, so this is only needed to stop *pending*
     * jobs from keeping the process alive.
     * @see https://nodejs.org/api/timers.html#timeoutunref
     */
    unref(): this {
        this.unreffed = true;
        this.unrefTask();
        return this;
    }

    /**
     * Keep the process alive while this queue is running (the default).
     */
    ref(): this {
        this.unreffed = false;
        const task = this.task as any;
        if (task && typeof task.ref === "function") {
            task.ref();
        }
        return this;
    }

    /** number of keys waiting to be run */
    get size(): number {
        return this.queue.size;
    }

    /** number of keys currently handed to the runner */
    get activeSize(): number {
        return this.running.size;
    }

    /** keys waiting to be run */
    keys(): IterableIterator<K> {
        return this.queue.keys();
    }

}
