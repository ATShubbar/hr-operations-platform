// The shared outbound-dispatch queue (NOTIF-01). Notifications enqueues delivery
// jobs here (NOTIF-02+); the DispatchProcessor consumes them. Kept as a constant
// so producers and the processor agree on the name.
export const DISPATCH_QUEUE = 'dispatch';

// The document-expiry queue (EXP-02). Carries the daily repeatable scan job; the
// ExpiryScanProcessor consumes it and runs the flag-gated scan. Registered as a
// producer in the @Global QueueModule; the worker lives in MainModule only.
export const EXPIRY_QUEUE = 'expiry';

// The leave queue (LEAVE-03). Carries the yearly carry-over job (1 January);
// the LeaveCarryOverProcessor consumes it. Producer registered in the @Global
// QueueModule; the worker lives in MainModule only.
export const LEAVE_QUEUE = 'leave';
