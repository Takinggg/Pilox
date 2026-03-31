import { z } from 'zod';
export declare const MessageSchema: z.ZodObject<{
    kind: z.ZodLiteral<"message">;
    role: z.ZodEnum<["user", "agent"]>;
    messageId: z.ZodString;
    parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        kind: z.ZodLiteral<"file">;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"file">;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"file">;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">>]>, "many">;
    taskId: z.ZodOptional<z.ZodString>;
    contextId: z.ZodOptional<z.ZodString>;
    referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    kind: z.ZodLiteral<"message">;
    role: z.ZodEnum<["user", "agent"]>;
    messageId: z.ZodString;
    parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        kind: z.ZodLiteral<"file">;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"file">;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"file">;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">>]>, "many">;
    taskId: z.ZodOptional<z.ZodString>;
    contextId: z.ZodOptional<z.ZodString>;
    referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    kind: z.ZodLiteral<"message">;
    role: z.ZodEnum<["user", "agent"]>;
    messageId: z.ZodString;
    parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        kind: z.ZodLiteral<"file">;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"file">;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"file">;
    }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"data">;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">>]>, "many">;
    taskId: z.ZodOptional<z.ZodString>;
    contextId: z.ZodOptional<z.ZodString>;
    referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">>;
export declare const MessageSendParamsSchema: z.ZodObject<{
    message: z.ZodObject<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">>;
    configuration: z.ZodOptional<z.ZodObject<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    message: z.ZodObject<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">>;
    configuration: z.ZodOptional<z.ZodObject<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    message: z.ZodObject<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        kind: z.ZodLiteral<"message">;
        role: z.ZodEnum<["user", "agent"]>;
        messageId: z.ZodString;
        parts: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"file">;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"file">;
        }, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            kind: z.ZodLiteral<"data">;
            data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>]>, "many">;
        taskId: z.ZodOptional<z.ZodString>;
        contextId: z.ZodOptional<z.ZodString>;
        referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">>;
    configuration: z.ZodOptional<z.ZodObject<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        blocking: z.ZodOptional<z.ZodBoolean>;
        acceptedOutputModes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pushNotificationConfig: z.ZodOptional<z.ZodUnknown>;
        historyLength: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
export declare const TaskQueryParamsSchema: z.ZodObject<{
    id: z.ZodString;
    historyLength: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodString;
    historyLength: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodString;
    historyLength: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>;
export declare const TaskIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Map of A2A method names to their params schema.
 */
export declare const METHOD_SCHEMAS: Record<string, z.ZodType>;
//# sourceMappingURL=schemas.d.ts.map