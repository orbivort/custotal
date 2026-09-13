// ApiError and factories producing the FR-CC-10 JSON error envelope:
// { "error": { "code", "message", "details"?: [{ "field", "message" }] } }.

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: FieldError[];

  constructor(status: number, code: string, message: string, details?: FieldError[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation(details: FieldError[], message = 'Please correct the highlighted fields.'): ApiError {
    return new ApiError(400, 'validation', message, details);
  },
  badRequest(code = 'bad_request', message: string): ApiError {
    return new ApiError(400, code, message);
  },
  unauthorized(message = 'Authentication required.'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  },
  invalidCredentials(): ApiError {
    return new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
  },
  forbidden(message = 'You do not have permission to perform this action.'): ApiError {
    return new ApiError(403, 'forbidden', message);
  },
  adminOnly(): ApiError {
    return new ApiError(403, 'forbidden', 'Administrator access required.');
  },
  notFound(code = 'not_found', message = 'Resource not found.'): ApiError {
    return new ApiError(404, code, message);
  },
  conflict(
    message = 'This record was modified by someone else. Reload and re-apply your changes.',
  ): ApiError {
    return new ApiError(409, 'conflict', message);
  },
  inUse(message: string): ApiError {
    return new ApiError(409, 'in_use', message);
  },
  rateLimited(message: string): ApiError {
    return new ApiError(429, 'rate_limited', message);
  },
  internal(message = 'An unexpected error occurred.'): ApiError {
    return new ApiError(500, 'internal', message);
  },
};

/** Standard phrasing used across resources. */
export const FIELD_MESSAGES = {
  invalidEmail: 'Invalid email format.',
  emailOrPhoneRequired: 'At least one of email or phone is required.',
  conflictReload: 'This record was modified by someone else. Reload and re-apply your changes.',
} as const;
