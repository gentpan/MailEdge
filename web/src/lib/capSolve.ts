import { solveCapItem } from "./capPow";

/**
 * 把一组 Cap 题分给几个后台线程并行算（最多 4 个），全部算完返回答案；onProgress 报完成比例。
 * 浏览器不让开后台线程时退回在页面里算（会卡一两秒）。
 */
export function solveCapChallenge(
  items: [string, string][],
  onProgress?: (done: number) => void,
): Promise<number[]> {
  const total = items.length;
  const results: number[] = new Array(total);
  const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, total));
  const buckets: [number, string, string][][] = Array.from({ length: count }, () => []);
  items.forEach(([salt, target], i) => {
    buckets[i % count]!.push([i, salt, target]);
  });

  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    let done = 0;
    const stop = () => {
      for (const worker of workers) worker.terminate();
    };
    const record = (i: number, n: number) => {
      if (n < 0) {
        stop();
        reject(new Error("unsolvable"));
        return;
      }
      results[i] = n;
      done++;
      onProgress?.(done / total);
      if (done === total) {
        stop();
        resolve(results);
      }
    };

    try {
      for (const jobs of buckets) {
        const worker = new Worker(new URL("./capWorker.ts", import.meta.url), { type: "module" });
        workers.push(worker);
        worker.onmessage = (event: MessageEvent<{ i: number; n: number }>) =>
          record(event.data.i, event.data.n);
        worker.onerror = (event) => {
          stop();
          reject(new Error(event.message || "worker error"));
        };
        worker.postMessage(jobs);
      }
    } catch {
      stop();
      items.forEach(([salt, target], i) => {
        record(i, solveCapItem(salt, target));
      });
    }
  });
}
