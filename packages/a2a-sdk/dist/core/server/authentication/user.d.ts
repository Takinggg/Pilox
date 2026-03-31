/**
 * Represents a user accessing A2A server.
 */
export interface User {
    /**
     * Indicates whether the user is authenticated.
     */
    get isAuthenticated(): boolean;
    /**
     * A unique name (identifier) for the user.
     */
    get userName(): string;
}
/**
 * An implementation of {@link User} representing an unauthenticated user.
 */
export declare class UnauthenticatedUser implements User {
    get isAuthenticated(): boolean;
    get userName(): string;
}
//# sourceMappingURL=user.d.ts.map