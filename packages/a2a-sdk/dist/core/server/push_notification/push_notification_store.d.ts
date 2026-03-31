import { PushNotificationConfig } from '../../types.js';
export interface PushNotificationStore {
    save(taskId: string, pushNotificationConfig: PushNotificationConfig): Promise<void>;
    load(taskId: string): Promise<PushNotificationConfig[]>;
    delete(taskId: string, configId?: string): Promise<void>;
}
export declare class InMemoryPushNotificationStore implements PushNotificationStore {
    private store;
    save(taskId: string, pushNotificationConfig: PushNotificationConfig): Promise<void>;
    load(taskId: string): Promise<PushNotificationConfig[]>;
    delete(taskId: string, configId?: string): Promise<void>;
}
//# sourceMappingURL=push_notification_store.d.ts.map