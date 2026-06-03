export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const Unauthorized = (msg = "Unauthorized") =>
  new AppError(401, "unauthorized", msg);
export const Forbidden = (msg = "Forbidden") =>
  new AppError(403, "forbidden", msg);
export const NotFound = (msg = "Not found") =>
  new AppError(404, "not_found", msg);
export const Conflict = (msg = "Conflict") => new AppError(409, "conflict", msg);
export const BadRequest = (msg = "Bad request") =>
  new AppError(400, "bad_request", msg);
export const KeyUnavailable = () =>
  new AppError(
    423,
    "key_unavailable",
    "Decryption key not in cache; user must log in again",
  );
