'use strict';

var uuid = require('uuid');

// src/middleware/compose.ts
function compose(middlewares) {
  const sorted = [...middlewares].filter((m) => m.enabled).sort((a, b) => a.priority - b.priority);
  return async function composed(ctx, next) {
    let index = -1;
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times in middleware");
      }
      index = i;
      if (i === sorted.length) {
        await next();
        return;
      }
      const mw = sorted[i];
      if (!mw.enabled) {
        await dispatch(i + 1);
        return;
      }
      await mw.execute(ctx, () => dispatch(i + 1));
    }
    await dispatch(0);
  };
}
function createServerContext(method, params, localAgentCard) {
  return {
    direction: "inbound",
    requestId: uuid.v4(),
    timestamp: Date.now(),
    localAgentCard,
    metadata: /* @__PURE__ */ new Map(),
    noiseSessionActive: false,
    method,
    params
  };
}
function createClientContext(method, params, localAgentCard, remoteAgentCard) {
  return {
    direction: "outbound",
    requestId: uuid.v4(),
    timestamp: Date.now(),
    localAgentCard,
    remoteAgentCard,
    metadata: /* @__PURE__ */ new Map(),
    noiseSessionActive: false,
    method,
    params
  };
}

exports.compose = compose;
exports.createClientContext = createClientContext;
exports.createServerContext = createServerContext;
