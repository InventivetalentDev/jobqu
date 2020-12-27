import { RunnerBase } from "./Base";

export interface Runner<K, V> {
    (key: K): Promise<V>;
}

export class JobQueue<K, V> extends RunnerBase<K, V> {

    /**
     * Create a new queue
     * @param interval (ms) interval to run in
     * @param runner function(key):Promise to execute the job
     * @param maxPerRun maximum queue entries to run per interval (-1 for unlimited)
     */
    constructor(private readonly runner: Runner<K, V>, protected readonly interval: number = 1000, protected readonly maxPerRun: number = -1) {
        super(interval, maxPerRun);

        this.run();
    }

    protected run() {
        const keys = Array.from(this.queue.keys());
        const n = this.maxPerRun === -1 ? this.queue.size : this.maxPerRun;
        const toRunKeys = Array.from(keys.slice(0, n));
        if (toRunKeys.length > 0) {
            for (let key of toRunKeys) {
                this.runner(key)
                    .then(value => {
                        this.getAndDelete(key).forEach(entry => entry.resolve(value));
                    })
                    .catch(err => {
                        this.getAndDelete(key).forEach(entry => entry.reject(err));
                    })
            }
        }

        this.task = setTimeout(() => this.run(), this.interval);
    }

}
