/**
 * Opaque context object to carry per-call context data.
 * Use {@link ClientCallContextKey} to create typed keys for storing and retrieving values.
 */
export type ClientCallContext = Record<symbol, unknown>;
/**
 * Function that applies an update to a {@link ClientCallContext}.
 */
export type ContextUpdate = (context: ClientCallContext) => void;
export declare const ClientCallContext: {
    /**
     * Create a new {@link ClientCallContext} with optional updates applied.
     */
    create: (...updates: ContextUpdate[]) => ClientCallContext;
    /**
     * Create a new {@link ClientCallContext} based on an existing one with updates applied.
     */
    createFrom: (context: ClientCallContext | undefined, ...updates: ContextUpdate[]) => ClientCallContext;
};
/**
 * Each instance represents a unique key for storing
 * and retrieving typed values in a {@link ClientCallContext}.
 *
 * @example
 * ```ts
 * const key = new ClientCallContextKey<string>('My key');
 * const context = ClientCallContext.create(key.set('example-value'));
 * const value = key.get(context); // 'example-value'
 * ```
 */
export declare class ClientCallContextKey<T> {
    readonly symbol: symbol;
    constructor(description: string);
    set(value: T): ContextUpdate;
    get(context: ClientCallContext): T | undefined;
}
//# sourceMappingURL=context.d.ts.map