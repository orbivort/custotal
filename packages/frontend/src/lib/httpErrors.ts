// User-facing copy for HTTP failures that arrive without a backend error
// envelope. Not every failure is produced by our own API: a reverse proxy,
// load balancer, or gateway can return a bare response (e.g. a 502 with an HTML
// body), and `fetch` itself never rejects for those. In that case the client
// has no `message` to show, so it maps the numeric status to readable copy
// instead of leaking a raw code like "Request failed (502)".
//
// The numeric status is never lost: `ApiError.status` still carries it for
// logging and programmatic branching.

const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'The request could not be processed. Please check your input and try again.',
  401: 'Your session has ended. Please sign in again.',
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  405: 'That action is not supported here.',
  408: 'The request took too long. Please try again.',
  409: 'This was changed somewhere else. Reload the page and try again.',
  413: 'That file is too large to upload.',
  415: 'That file type is not supported.',
  422: 'Some of the details you entered are not valid. Please review and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again.',
  502: 'The server is temporarily unavailable. Please try again in a moment.',
  503: 'The service is temporarily unavailable. Please try again in a moment.',
  504: 'The server took too long to respond. Please try again.',
};

const DEFAULT_HTTP_STATUS_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Returns readable, user-facing copy for an HTTP status that has no error
 * envelope. Known statuses get specific guidance; anything else falls back to a
 * single generic message so a numeric code is never shown to the user.
 */
export function describeHttpStatus(status: number): string {
  return HTTP_STATUS_MESSAGES[status] ?? DEFAULT_HTTP_STATUS_MESSAGE;
}
