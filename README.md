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


## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FInventivetalentDev%2Fjobqu.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FInventivetalentDev%2Fjobqu?ref=badge_large)