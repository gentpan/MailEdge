import { solveCapItem } from "./capPow";

/** 后台线程里算 Cap 题：收到 [序号, 盐, 前缀] 列表，一道一道算完回 { i, n } */
type Job = [number, string, string];

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Job[]>) => void) | null;
  postMessage: (message: { i: number; n: number }) => void;
};

scope.onmessage = (event) => {
  for (const [i, salt, target] of event.data) scope.postMessage({ i, n: solveCapItem(salt, target) });
};
