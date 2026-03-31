import { Extensions } from '../extensions.js';
import { User } from './authentication/user.js';
export declare class ServerCallContext {
    private readonly _requestedExtensions?;
    private readonly _user?;
    private _activatedExtensions?;
    constructor(requestedExtensions?: Extensions, user?: User);
    get user(): User | undefined;
    get activatedExtensions(): Extensions | undefined;
    get requestedExtensions(): Extensions | undefined;
    addActivatedExtension(uri: string): void;
}
//# sourceMappingURL=context.d.ts.map