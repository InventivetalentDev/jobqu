import { RunnerBase } from "./Base";

export interface MultiRunner<K, V> {
    (keys: K[]): Promise<Map<K, V>>;
}

export class MultiJobQueue<K, V> extends RunnerBase<K, V> {

    /**
     * Create a new queue
     * @param interval (ms) interval to run in
     * @param runner function(key):Promise<Map> to execute the job
     * @param maxPerRun maximum queue entries to run per interval (-1 for unlimited)
     */
    constructor(private readonly runner: MultiRunner<K, V>, protected readonly interval: number = 1000, protected readonly maxPerRun: number = -1) {
        super(interval, maxPerRun);

        this.run();
    }

    protected run() {
        const keys = Array.from(this.queue.keys());
        const n = this.maxPerRun === -1 ? this.queue.size : this.maxPerRun;
        const toRunKeys = Array.from(keys.slice(0, n));
        if (toRunKeys.length > 0) {
            this.runner(toRunKeys)
                .then(map => {
                    toRunKeys.forEach(key => {
                        const value = map.get(key);
                        this.getAndDelete(key)?.forEach(entry => entry.resolve(value));
                    })
                })
                .catch(err => {
                    toRunKeys.forEach(key => {
                        this.getAndDelete(key)?.forEach(entry => entry.reject(err));
                    })
                })
        }

        this.task = setTimeout(() => this.run(), this.interval);
    }

}
