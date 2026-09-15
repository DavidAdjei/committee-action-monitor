import { PrismaClient } from "@prisma/client";

// Azure Functions can reuse the process across invocations (warm instances)
// but may also load the module multiple times during local development with
// hot reload. Cache the client on `globalThis` so we never open more
// connections than the configured MySQL connection pool allows.
declare global {
  // eslint-disable-next-line no-var
  var __camPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__camPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__camPrisma = prisma;
}
