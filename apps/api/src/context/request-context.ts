import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  // Populated by the auth session middleware (AUTH-03) for authenticated
  // requests; null means unauthenticated.
  actorId: string | null;
  clientId: string | null;
  principalType: 'staff' | 'client_rep' | null;
  role: string | null;
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
    return {
      requestId: requestId ?? randomUUID(),
      actorId: null,
      clientId: null,
      principalType: null,
      role: null,
    };
  },
};
