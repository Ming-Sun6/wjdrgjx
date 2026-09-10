/// <reference lib="webworker" />

import {
  runOptimizationCore,
  type UiOptimizationCoreRequest,
  type UiOptimizationCoreResult,
} from "./model";

type OptimizationWorkerResponse =
  | { readonly ok: true; readonly result: UiOptimizationCoreResult }
  | { readonly ok: false; readonly message: string };

self.onmessage = (event: MessageEvent<UiOptimizationCoreRequest>) => {
  let response: OptimizationWorkerResponse;
  try {
    response = {
      ok: true,
      result: runOptimizationCore(event.data, { includeTopDamageInterval: true }),
    };
  } catch (error) {
    response = {
      ok: false,
      message: error instanceof Error ? error.message : "优化线程运行失败。",
    };
  }
  self.postMessage(response);
};
