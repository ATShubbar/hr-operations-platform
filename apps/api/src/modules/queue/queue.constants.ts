// The shared outbound-dispatch queue (NOTIF-01). Notifications enqueues delivery
// jobs here (NOTIF-02+); the DispatchProcessor consumes them. Kept as a constant
// so producers and the processor agree on the name.
export const DISPATCH_QUEUE = 'dispatch';
