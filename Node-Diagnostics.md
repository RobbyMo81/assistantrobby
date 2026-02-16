# Node.js Build Environment Diagnostics

This document provides diagnostic information to resolve the `node: command not found` error during the build process.

## 1. Summary of Troubleshooting

The build fails when executing a `bash` script (`scripts/bundle-a2ui.sh`) as part of the `pnpm build` command. The script is unable to find the `node` executable.

- `node -v` and `npm -v` run successfully in the interactive PowerShell session, confirming Node.js is installed.
- `Get-Command node` reveals the `node.exe` path is `C:\Users\RobMo\dev	ools
ode.exe`.
- The system's `PATH` variable includes common Node.js directories, but the `where node` command fails to find the executable, which is unusual.
- The failure appears to be caused by the `bash` shell (likely Git Bash or a similar environment) not inheriting the `PATH` from the interactive PowerShell session where `node` is available. The script execution context is different and has a sanitized or incomplete `PATH`.

## 2. Build Error Log

This is the exact error from running `pnpm build`:

```log
> openclaw@2026.2.12 build D:\Documents\assistantrobby
> pnpm canvas:a2ui:bundle && tsdown && ...

> openclaw@2026.2.12 canvas:a2ui:bundle D:\Documents\assistantrobby
> bash scripts/bundle-a2ui.sh

scripts/bundle-a2ui.sh: line 35: node: command not found
A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle
If this persists, verify pnpm deps and try again.
ELIFECYCLE  Command failed.
ELIFECYCLE  Command failed with exit code 1.
```

## 3. `src/agents/model-auth.ts` (API Key Resolution)

The primary function for resolving API keys is `resolveApiKeyForProvider`, which is asynchronous. This is the "hot path" for authentication that was discussed.

```typescript
// src/agents/model-auth.ts

// ... (imports)

export async function resolveApiKeyForProvider(params: {
  provider: string;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  const { provider, cfg, profileId, preferredProfile } = params;
  const store = params.store ?? ensureAuthProfileStore(params.agentDir);

  if (profileId) {
    const resolved = await resolveApiKeyForProfile({
      cfg,
      store,
      profileId,
      agentDir: params.agentDir,
    });
    if (!resolved) {
      throw new Error(`No credentials found for profile "${profileId}".`);
    }
    const mode = store.profiles[profileId]?.type;
    return {
      apiKey: resolved.apiKey,
      profileId,
      source: `profile:${profileId}`,
      mode: mode === "oauth" ? "oauth" : mode === "token" ? "token" : "api-key",
    };
  }

  // ... (more async logic follows)
}

// ... (other functions)

export async function getApiKeyForModel(params: {
  model: Model<Api>;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  return resolveApiKeyForProvider({
    provider: params.model.provider,
    cfg: params.cfg,
    profileId: params.profileId,
    preferredProfile: params.preferredProfile,
    store: params.store,
    agentDir: params.agentDir,
  });
}

// ...
```

## 4. `tsdown.config.ts`

This file defines the entry points and build configuration for `tsdown`.

```typescript
import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
```
