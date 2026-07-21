// Browser API client. Talks to the same-origin /api proxy (see next.config),
// so the httpOnly session cookie is sent automatically. Throws ApiError on a
// non-2xx response so callers can branch on status (e.g. 401 → sign in).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      (body as { message?: string } | null)?.message ?? res.statusText ?? 'Request failed';
    throw new ApiError(res.status, message);
  }
  return body as T;
}
