import { z } from 'zod';

/**
 * Zod schemas for A2A message validation.
 * Validates the structure of incoming/outgoing A2A messages.
 */

const PartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }).passthrough(),
  z.object({ kind: z.literal('file') }).passthrough(),
  z.object({ kind: z.literal('data'), data: z.record(z.unknown()) }).passthrough(),
]);

export const MessageSchema = z.object({
  kind: z.literal('message'),
  role: z.enum(['user', 'agent']),
  messageId: z.string(),
  parts: z.array(PartSchema).min(1),
  taskId: z.string().optional(),
  contextId: z.string().optional(),
  referenceTaskIds: z.array(z.string()).optional(),
  extensions: z.array(z.string()).optional(),
}).passthrough();

export const MessageSendParamsSchema = z.object({
  message: MessageSchema,
  configuration: z.object({
    blocking: z.boolean().optional(),
    acceptedOutputModes: z.array(z.string()).optional(),
    pushNotificationConfig: z.unknown().optional(),
    historyLength: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

export const TaskQueryParamsSchema = z.object({
  id: z.string(),
  historyLength: z.number().optional(),
}).passthrough();

export const TaskIdParamsSchema = z.object({
  id: z.string(),
}).passthrough();

/**
 * Map of A2A method names to their params schema.
 */
export const METHOD_SCHEMAS: Record<string, z.ZodType> = {
  'message/send': MessageSendParamsSchema,
  'message/stream': MessageSendParamsSchema,
  'tasks/get': TaskQueryParamsSchema,
  'tasks/cancel': TaskIdParamsSchema,
  'tasks/resubscribe': TaskIdParamsSchema,
};
