// Introspection + invocation helpers shared by the route unit tests.
//
// Routes are registered on express Routers, and the unit tier must stay free of
// HTTP servers and databases (those live in the integration tier). Each test
// therefore pulls the handler chain off `router.stack` and drives the terminal
// handler with the hand-rolled req/res doubles from ./express.ts.
import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';
import { mockReq, mockRes } from './express.ts';
import type { User } from '../../../src/types/domain.ts';

export type RouteHandler = (req: Request, res: Response, next: NextFunction) => unknown;

interface RouteLike {
  path: string;
  methods: Record<string, boolean | undefined>;
  stack: { handle: RouteHandler }[];
}

interface LayerLike {
  route?: RouteLike;
  handle?: RouteHandler;
}

/** Structural view of an express Router (avoids importing express internals). */
type RouterLike = { stack: unknown[] };

export interface RouteChain {
  path: string;
  methods: string[];
  /** Every handler registered for the route, in order — guards first. */
  handlers: RouteHandler[];
  /** Terminal handler: the one that talks to the service layer. */
  handler: RouteHandler;
}

/** Locate a route by HTTP method and express path (e.g. findRoute(r, 'post', '/:id/links')). */
export function findRoute(router: RouterLike, method: string, path: string): RouteChain {
  const wanted = method.toLowerCase();
  for (const layer of router.stack) {
    const { route } = layer as LayerLike;
    if (!route || route.path !== path) continue;
    const methods = Object.keys(route.methods ?? {}).filter((m) => route.methods[m]);
    if (!methods.includes(wanted)) continue;
    const handlers = route.stack.map((entry) => entry.handle);
    const handler = handlers[handlers.length - 1];
    if (!handler) throw new Error(`No handler registered for ${method.toUpperCase()} ${path}`);
    return { path: route.path, methods, handlers, handler };
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} is not registered`);
}

/** Terminal handler for a method + path — the common case. */
export function routeHandler(router: RouterLike, method: string, path: string): RouteHandler {
  return findRoute(router, method, path).handler;
}

/** Handlers installed with router.use(...) — i.e. the router-wide auth gates. */
export function routerGuards(router: RouterLike): RouteHandler[] {
  return router.stack
    .filter((layer) => !(layer as LayerLike).route)
    .map((layer) => (layer as LayerLike).handle!);
}

export interface CallOptions {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  /** `null` forces an unauthenticated request; omit for the default user. */
  user?: User | null;
  sessionId?: string;
}

export interface RouteCall {
  req: Request;
  res: ReturnType<typeof mockRes>;
  next: NextFunction;
  /** Settles when the handler resolves; rejects when it throws (sync or async). */
  done: Promise<void>;
}

const DEFAULT_USER: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'rep' };

/** Invoke a route handler directly with a mocked req/res pair. */
export function callRoute(handler: RouteHandler, options: CallOptions = {}): RouteCall {
  const req = mockReq({
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body,
    user: options.user === null ? undefined : (options.user ?? DEFAULT_USER),
    sessionId: options.sessionId,
  } as unknown as Partial<Request>);
  const res = mockRes();
  const next = vi.fn() as unknown as NextFunction;
  // Wrapped in an async IIFE so synchronous throws also surface as rejections.
  const done = (async () => {
    await handler(req, res as unknown as Response, next);
  })();
  return { req, res, next, done };
}

/** Convenience: call a route looked up by method + path. */
export function call(
  router: RouterLike,
  method: string,
  path: string,
  options: CallOptions = {},
): RouteCall {
  return callRoute(routeHandler(router, method, path), options);
}
