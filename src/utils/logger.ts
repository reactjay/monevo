export interface MessageEvent {
  messageId: string;
  senderId: string;
  messageType: string;
}

export function logMessageReceived(event: MessageEvent): void {
  console.log(
    `[MSG:recv] id=${event.messageId} from=${event.senderId} type=${event.messageType}`
  );
}

export function logMessageProcessed(
  event: MessageEvent & {
    durationMs: number;
    status: 'ok' | 'error' | 'duplicate' | 'ignored';
  }
): void {
  console.log(
    `[MSG:done] id=${event.messageId} from=${event.senderId} type=${event.messageType} ` +
      `status=${event.status} duration=${event.durationMs}ms`
  );
}

export function logMessageError(event: MessageEvent & { error: string }): void {
  console.error(
    `[MSG:err] id=${event.messageId} from=${event.senderId} type=${event.messageType} ` +
      `error=${event.error}`
  );
}

export function logOutbound(to: string, messageType: string): void {
  console.log(`[OUT] to=${to} type=${messageType}`);
}
