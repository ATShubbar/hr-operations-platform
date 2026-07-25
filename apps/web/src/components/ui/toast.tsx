'use client';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';

import { cn } from '@/lib/utils';

// Toast (UX-02). Base UI's, not Sonner's — deliberately.
//
// This app is shadcn-on-Base-UI, and Sonner brings its own portal, focus and
// animation system plus an RTL story built on direction-swapped physical CSS
// custom properties. Base UI's toast uses logical properties, participates in
// DirectionProvider, and — the part that actually matters — its viewport is a
// landmark region reachable with F6, with a real focusable action button. Most
// toast libraries announce via a live region and leave the action unreachable by
// keyboard.
//
// The rules this file encodes:
//
//   • A toast is PASSIVE CONFIRMATION ONLY. Validation goes inline; a failed
//     mutation stays in the dialog next to the retry; a permission denial is a
//     page state. A toast that carries the only copy of an error is a message the
//     user is expected to have been watching for.
//   • Anything with an action does not auto-dismiss (`timeout: 0`). An "Undo"
//     button that vanishes on a timer is a control keyboard users cannot reach in
//     time, and it fails the timing-adjustable criterion.
//   • Every consequential outcome also lands in the notification bell. That
//     durable twin is what makes the transient one conformant — the message is
//     recoverable, so its disappearance is not a lost time limit. We already
//     built the bell; this is what turns it into an accessibility control.

// Created outside React so services and non-component code can raise a toast.
export const toastManager = ToastPrimitive.createToastManager();

function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} limit={3} timeout={5000}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          className={cn(
            // Bottom inline-end: top-end would collide with the header's
            // notification bell and its unread badge, which is precisely the
            // element a toast must not be confused with.
            'fixed bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2',
            'inset-inline-end-4',
          )}
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

const TONE: Record<string, string> = {
  success: 'border-status-ok-line bg-status-ok-surface text-status-ok',
  error: 'border-status-critical-line bg-status-critical-surface text-status-critical',
  warning: 'border-status-warning-line bg-status-warning-surface text-status-warning',
  info: 'border-status-info-line bg-status-info-surface text-status-info',
};

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      className={cn(
        'rounded-xl border bg-popover p-3 shadow-lg outline-none',
        'data-starting-style:opacity-0 data-ending-style:opacity-0',
        'transition-[opacity,transform] duration-200',
        toast.type ? TONE[toast.type] : undefined,
      )}
    >
      <ToastPrimitive.Title className="text-sm font-medium" />
      <ToastPrimitive.Description className="mt-0.5 text-sm text-muted-foreground" />
      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="absolute top-2 inset-inline-end-2 text-muted-foreground hover:text-foreground"
      >
        ✕
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ));
}

// Passive confirmation of something the user cannot already see on screen.
// If the row visibly changed, the row IS the feedback — don't also toast it.
export function toastSuccess(title: string, description?: string) {
  toastManager.add({ title, description, type: 'success', priority: 'low' });
}

// Errors are assertive and never auto-dismiss. Prefer inline or in-dialog
// placement; reach for this only when there is no relevant surface to attach to.
export function toastError(title: string, description?: string) {
  toastManager.add({ title, description, type: 'error', priority: 'high', timeout: 0 });
}

export { ToastProvider };
