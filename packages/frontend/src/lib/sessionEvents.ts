// Decouples the HTTP client from the session layer.
//
// When an authenticated request comes back 401 (expired or revoked session) the
// API client calls `notifyUnauthorized()`; SessionProvider registers a handler
// that clears the current user, so RequireAuth redirects to the login screen
// with the intended destination preserved — instead of the user being stranded
// on a page showing a raw error banner.
type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

/** Registers (or clears, with null) the session-level 401 handler. */
export function setUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

/** Called by the API client when a request is rejected with 401. */
export function notifyUnauthorized(): void {
  handler?.();
}
