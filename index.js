class JobQueue {

    /**
     * Create a new queue
     * @param interval (ms) interval to run in
     * @param runner function(key):Promise to execute the job
     * @param maxPerRun maximum queue entries to run per interval (-1 for unlimited)
     */
    constructor(runner, interval = 1000, maxPerRun = -1) {
        this.queue = {};
        this.runner = runner;
        this.interval = interval;
        this.maxPerRun = maxPerRun;

        this.jobId = setInterval(() => {
            let keys = Object.keys(this.queue);
            let n = this.maxPerRun === -1 ? this.queue.length : this.maxPerRun;
            let toRunKeys = keys.slice(0, n);
            for (let key of toRunKeys) {
                this.__doRunFor(key);
            }
        }, this.interval)
    }

    __doRunFor(key) {
        this.runner(key)
            .then(res => {
                this.__resolve(key, res, false);
            })
            .catch(err => {
                this.__resolve(key, err, true);
            })
    }

    __resolve(key, result, rejected) {
        let promises = this.queue[key];
        delete this.queue[key];
        if (promises) {
            for (let p of promises) {
                if (rejected) {
                    p.reject(result);
                } else {
                    p.resolve(result);
                }
            }
        }
    }

    /**
     * Add a job to run to this queue
     * @param key unique key to store this job by - jobs with the same key will resolve/reject together
     * @returns {Promise<object>}
     */
    add(key) {
        return new Promise((resolve, reject) => {
            let promise = {
                resolve,
                reject
            };
            if (!this.queue.hasOwnProperty(key)) {
                this.queue[key] = [promise];
            } else {
                this.queue[key].push(promise);
            }
        })
    }

    /**
     * Remove a job
     * @param key unique job key
     */
    remove(key) {
        delete this.queue[key];
    }

}

module.exports = JobQueue;
