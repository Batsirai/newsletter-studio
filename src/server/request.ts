import { getRequest } from "@tanstack/react-start/server";
import { NotFoundError } from "./newsletters";

/** A page's data, or null when the caller owns no such thing. */
export async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** The app's public origin, from the request the Gateway forwarded. */
export function requestOrigin(): string {
  return new URL(getRequest().url).origin;
}
