export class ApiError extends Error {
  readonly extra: Record<string, unknown>;

  constructor(
    public status: number,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.extra = extra;
  }

  static badRequest(message: string) {
    return new ApiError(400, message);
  }

  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Not allowed") {
    return new ApiError(403, message);
  }

  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }

  static conflict(message: string) {
    return new ApiError(409, message);
  }

  static payloadTooLarge(message: string) {
    return new ApiError(413, message);
  }

  static tooManyRequests(message = "Too many requests. Wait a minute and try again.") {
    return new ApiError(429, message);
  }
}
