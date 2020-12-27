import { JobQueue } from "../src";

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
