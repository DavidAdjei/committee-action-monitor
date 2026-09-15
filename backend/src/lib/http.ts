import { HttpResponseInit } from "@azure/functions";

const CORS_ORIGIN = process.env.CORS_ALLOWED_ORIGIN ?? "*";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-dev-user-id",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

export function ok(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  };
}

export function noContent(): HttpResponseInit {
  return { status: 204, headers: corsHeaders() };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): HttpResponseInit {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      jsonBody: { error: { code: err.code, message: err.message } },
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    };
  }
  // Never leak internals (SQL, stack traces) to the client.
  // eslint-disable-next-line no-console
  console.error(err);
  return {
    status: 500,
    jsonBody: { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  };
}

export function preflight(): HttpResponseInit {
  return { status: 204, headers: corsHeaders() };
}

export const Errors = {
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Sign-in is required."),
  forbidden: (msg = "You do not have permission to perform this action.") =>
    new ApiError(403, "FORBIDDEN", msg),
  notFound: (resource = "Resource") => new ApiError(404, "NOT_FOUND", `${resource} was not found.`),
  badRequest: (msg: string) => new ApiError(400, "BAD_REQUEST", msg),
  conflict: (msg: string) => new ApiError(409, "CONFLICT", msg),
};
