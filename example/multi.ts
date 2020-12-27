import { MultiJobQueue } from "../src";

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
runner: mykey,notmykey
mykey 1: mykey23920
mykey 2: mykey23920
mykey 3: mykey23920
notmykey 1: notmykey18288
notmykey 2: notmykey18288
 */
