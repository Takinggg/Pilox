import { Task } from '../../types.js';
export interface PushNotificationSender {
    send(task: Task): Promise<void>;
}
//# sourceMappingURL=push_notification_sender.d.ts.map