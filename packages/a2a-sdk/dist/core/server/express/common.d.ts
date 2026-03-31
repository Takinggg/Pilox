import { Request } from 'express';
import { UnauthenticatedUser, User } from '../authentication/user.js';
export type UserBuilder = (req: Request) => Promise<User>;
export declare const UserBuilder: {
    noAuthentication: () => Promise<UnauthenticatedUser>;
};
//# sourceMappingURL=common.d.ts.map