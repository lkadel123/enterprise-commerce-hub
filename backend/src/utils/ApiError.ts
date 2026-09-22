/**
 * Domain error carrying an HTTP status code, a stable machine-readable
 * code and optional field-level details. All errors thrown by services
 * are ApiError instances; the central error handler serialises them.
 */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "INVALID_CREDENTIALS"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL"
  | "INVALID_CUSTOMER_ID"
  | "SERVICE_UNAVAILABLE";

export interface ApiErrorDetail {
  path?: string;
  message: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?: ApiErrorDetail[];

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string) => new ApiError(400, "BAD_REQUEST", message);

export const unauthorized = (message = "Authentication required.") =>
  new ApiError(401, "UNAUTHENTICATED", message);

export const forbidden = (message = "You do not have permission to perform this action.") =>
  new ApiError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found.") =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

export const payloadTooLarge = (message = "Uploaded file is too large.") =>
  new ApiError(413, "PAYLOAD_TOO_LARGE", message);

export const invalidCredentials = (message = "Invalid email or password.") =>
  new ApiError(401, "INVALID_CREDENTIALS", message);

export const serviceUnavailable = (message = "Service temporarily unavailable.") =>
  new ApiError(503, "SERVICE_UNAVAILABLE", message);
