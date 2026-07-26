import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

export const id = (prefix: string): string => `${prefix}_${randomUUID()}`;
export const now = (): string => new Date().toISOString();
export const json = (value: unknown): string => JSON.stringify(value);
export const parseJson = <T>(value: string): T => JSON.parse(value) as T;

export async function assertInside(root: string, target: string): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, target);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Path escapes the ATLAS repository.");
  }
  try {
    const info = await stat(resolved);
    if (info.isSymbolicLink()) throw new Error("Symbolic links are not permitted.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return resolved;
}

export function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
