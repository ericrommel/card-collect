import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET", process.env.NODE_ENV === "test" ? "test-secret" : undefined),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
