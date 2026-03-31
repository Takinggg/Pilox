import { Task } from '../../types.js';
import { PushNotificationSender } from './push_notification_sender.js';
import { PushNotificationStore } from './push_notification_store.js';
export interface DefaultPushNotificationSenderOptions {
    /**
     * Timeout in milliseconds for the abort controller. Defaults to 5000ms.
     */
    timeout?: number;
    /**
     * Custom header name for the token. Defaults to 'X-A2A-Notification-Token'.
     */
    tokenHeaderName?: string;
}
export declare class DefaultPushNotificationSender implements PushNotificationSender {
    private readonly pushNotificationStore;
    private notificationChain;
    private readonly options;
    constructor(pushNotificationStore: PushNotificationStore, options?: DefaultPushNotificationSenderOptions);
    send(task: Task): Promise<void>;
    private _dispatchNotification;
}
//# sourceMappingURL=default_push_notification_sender.d.ts.map