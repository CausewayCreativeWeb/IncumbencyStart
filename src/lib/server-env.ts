// Server-only environment access.
//
// Destructuring `import.meta.env` gives a snapshot taken at build time, so a
// variable that wasn't visible to the build is missing at runtime even when it
// is set in Vercel. Reading `process.env` on each request avoids that; the
// `import.meta.env` fallback picks up `.env` files in local dev.

const buildTimeEnv = import.meta.env as unknown as Record<string, string | undefined>;

/** A trimmed env value, or undefined when unset or blank. */
export function env(name: string): string | undefined {
  const value = (process.env[name] ?? buildTimeEnv[name])?.trim();
  return value ? value : undefined;
}

/** The names from `names` that have no value. Never returns values. */
export function missing(names: readonly string[]): string[] {
  return names.filter((name) => !env(name));
}
