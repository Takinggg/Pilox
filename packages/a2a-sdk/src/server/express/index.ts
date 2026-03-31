// Re-export upstream Express handlers
export { A2AExpressApp } from '../../core/server/express/a2a_express_app.js';
export { UserBuilder } from '../../core/server/express/common.js';
export { jsonRpcHandler } from '../../core/server/express/json_rpc_handler.js';
export type { JsonRpcHandlerOptions } from '../../core/server/express/json_rpc_handler.js';
export { agentCardHandler } from '../../core/server/express/agent_card_handler.js';
export type {
  AgentCardHandlerOptions,
  AgentCardProvider,
} from '../../core/server/express/agent_card_handler.js';
export { restHandler } from '../../core/server/express/rest_handler.js';
export type { RestHandlerOptions } from '../../core/server/express/rest_handler.js';
