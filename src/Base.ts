export interface PromiseEntry<V> {
    resolve: (value: V) => void;
    reject: (error?: any) => void;
}

export abstract class RunnerBase<K, V> {

    protected readonly queue: Map<K, PromiseEntry<V>[]> = new Map<K, PromiseEntry<V>[]>();
    protected task: NodeJS.Timeout;

    protected constructor(protected readonly interval: number = 1000, protected readonly maxPerRun: number = -1) {
    }

    protected getAndDelete(key: K): PromiseEntry<V>[] {
        const entries = this.queue.get(key);
        this.queue.delete(key);
        return entries;
    }

    protected abstract run(): void;

    /**
     * Stop queue task
     */
    end(): void {
        clearTimeout(this.task);
    }

    /**
     * Add a job to run to this queue
     * @param key unique key to store this job by - jobs with the same key will resolve/reject together
     * @returns {Promise<V>}
     */
    add(key: K): Promise<V> {
        return new Promise<V>((resolve, reject) => {
            let arr = this.queue.get(key);
            if (!arr) {
                arr = [];
            }
            const entry: PromiseEntry<V> = { resolve, reject };
            arr.push(entry);
            this.queue.set(key, arr);
        })
    }


    /**
     * Remove a job
     * @param key unique job key
     */
    remove(key: K): boolean {
        return this.queue.delete(key);
    }

    get size(): number {
        return this.queue.size;
    }

    keys(): IterableIterator<K> {
        return this.queue.keys();
    }

    clear(): void {
        return this.queue.clear();
    }

}
