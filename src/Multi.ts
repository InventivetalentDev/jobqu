import { RunnerBase } from "./Base";

export interface MultiRunner<K, V> {
    (keys: K[]): Promise<Map<K, V>>;
}

/**
 * Rejection handed to jobs whose key is missing from the map returned by the runner.
 *
 * To signal "no value" for a key, resolve the map with an explicit value
 * (e.g. `null`) instead of omitting the key.
 */
export class MissingResultError extends Error {

    constructor(readonly key: unknown) {
        super(`Runner returned no result for key ${ String(key) }`);
        this.name = "MissingResultError";
    }

}

export class MultiJobQueue<K, V> extends RunnerBase<K, V> {

    /**
     * Create a new queue
     * @param runner function(keys):Promise<Map> to execute the jobs
     * @param interval (ms) interval to run in
     * @param maxPerRun maximum queue entries to run per interval (-1 for unlimited)
     */
    constructor(private readonly runner: MultiRunner<K, V>, interval: number = 1000, maxPerRun: number = -1) {
        super(interval, maxPerRun);

        this.run();
    }

    protected run(): void {
        try {
            const batch = this.takeBatch();
            if (batch.size < 1) {
                return;
            }
            this.invokeRunner(Array.from(batch.keys()))
                .then(map => {
                    batch.forEach((entries, key) => {
                        this.finish(key);
                        if (map instanceof Map && map.has(key)) {
                            const value = map.get(key) as V;
                            entries.forEach(entry => entry.resolve(value));
                        } else {
                            const err = new MissingResultError(key);
                            entries.forEach(entry => entry.reject(err));
                        }
                    })
                }, err => {
                    batch.forEach((entries, key) => {
                        this.finish(key);
                        entries.forEach(entry => entry.reject(err));
                    })
                })
        } finally {
            // always reschedule, so a misbehaving runner can't kill the queue
            this.scheduleNext();
        }
    }

    /**
     * Call the runner, turning a synchronous throw or a non-promise return value
     * into a rejected/resolved promise.
     */
    private invokeRunner(keys: K[]): Promise<Map<K, V>> {
        try {
            return Promise.resolve(this.runner(keys));
        } catch (e) {
            return Promise.reject(e);
        }
    }

}
