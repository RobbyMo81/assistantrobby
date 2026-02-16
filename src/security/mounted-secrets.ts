import fs from "node:fs/promises";
import path from "node:path";

let secrets: Map<string, string> | null = null;
let secretsDir: string | null = null;

/**
 * Initializes a cache of secrets by reading them from a mounted directory.
 * This should be called once at application startup.
 *
 * The directory is resolved in the following order:
 * 1. `opts.dir`
 * 2. `process.env.OPENCLAW_SECRETS_DIR`
 * 3. `/run/secrets` (default)
 *
 * @param opts Options for initialization, including the directory and a list of required secret names.
 */
export async function initMountedSecrets(opts?: { dir?: string; required?: string[] }) {
  const dir = opts?.dir ?? process.env.OPENCLAW_SECRETS_DIR ?? "/run/secrets";
  secretsDir = dir; // Cache the resolved directory for error messages

  const required = new Set(opts?.required ?? []);
  const loadedSecrets = new Map<string, string>();

  // Attempt to read all required files first to fail fast.
  for (const name of required) {
    const secretPath = path.join(dir, name);
    let content: string;
    try {
      content = await fs.readFile(secretPath, "utf8");
    } catch (err) {
      throw new Error(
        `Required secret "${name}" could not be read.` +
        ` Expected at path: ${secretPath}.` +
        ` Set the OPENCLAW_SECRETS_DIR environment variable to change the directory.`,
        { cause: err },
      );
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new Error(
        `Required secret "${name}" at path ${secretPath} is empty.` +
        ` Set the OPENCLAW_SECRETS_DIR environment variable to change the directory.`,
      );
    }
    loadedSecrets.set(name, trimmedContent);
  }

  secrets = loadedSecrets;
}

/**
 * Synchronously retrieves a secret from the cache.
 * Returns the secret string or `undefined` if not found or if cache is uninitialized.
 *
 * @param name The name of the secret to retrieve.
 */
export function getMountedSecretSync(name: string): string | undefined {
  return secrets?.get(name);
}

/**
 * Synchronously retrieves a secret from the cache and throws an error if it's missing.
 * `initMountedSecrets` must be called before this function.
 *
 * @param name The name of the secret to retrieve.
 * @returns The secret string.
 */
export function requireMountedSecretSync(name:string): string {
    if (secrets === null) {
        throw new Error(
          "Secret cache not initialized. Call initMountedSecrets() at startup.",
        );
    }
    const secret = getMountedSecretSync(name);
    if (secret === undefined) {
        const dir = secretsDir ?? process.env.OPENCLAW_SECRETS_DIR ?? "/run/secrets";
        throw new Error(
            `Required secret "${name}" not found in cache.` +
            ` Expected at path: ${path.join(dir, name)}.` +
            ` Set the OPENCLAW_SECRETS_DIR environment variable to change the directory.`
        );
    }
    return secret;
}
