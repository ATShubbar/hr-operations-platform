import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  // Populated by authentication (Priority 2). Until then they stay null and
  // the fields exist so logging and DB-path selection have one stable shape.
  actorId: string | null;
  clientId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
  create(requestId?: string): RequestContext {
    return { requestId: requestId ?? randomUUID(), actorId: null, clientId: null };
  },
};
