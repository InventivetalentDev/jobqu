import { RunnerBase } from "./Base";

export interface Runner<K, V> {
    (key: K): Promise<V>;
}

export class JobQueue<K, V> extends RunnerBase<K, V> {

    /**
     * Create a new queue
     * @param runner function(key):Promise to execute the job
     * @param interval (ms) interval to run in
     * @param maxPerRun maximum queue entries to run per interval (-1 for unlimited)
     */
    constructor(private readonly runner: Runner<K, V>, interval: number = 1000, maxPerRun: number = -1) {
        super(interval, maxPerRun);
    }

    protected run(): void {
        this.takeBatch().forEach((entries, key) => {
            this.invokeRunner(key)
                .then(value => {
                    this.finish(key);
                    entries.forEach(entry => entry.resolve(value));
                }, err => {
                    this.finish(key);
                    entries.forEach(entry => entry.reject(err));
                })
        });
    }

    /**
     * Call the runner, turning a synchronous throw or a non-promise return value
     * into a rejected/resolved promise.
     */
    private invokeRunner(key: K): Promise<V> {
        try {
            return Promise.resolve(this.runner(key));
        } catch (e) {
            return Promise.reject(e);
        }
    }

}
