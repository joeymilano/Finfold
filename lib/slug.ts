/**
 * Short, URL-safe random slug for public share links (/share/[slug]).
 * Not cryptographically unguessable by design — these are meant to be
 * shared publicly, not to gate access to private data. Uses crypto.randomUUID
 * (available in all edge runtimes) rather than pulling in nanoid.
 */
export function generateShareSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}
