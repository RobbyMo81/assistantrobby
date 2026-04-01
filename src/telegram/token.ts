import fs from "node:fs";
import type { OpenClawConfig } from "../config/config.js";
import type { TelegramAccountConfig } from "../config/types.telegram.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";

export type TelegramTokenSource = "env" | "tokenFile" | "config" | "none";

export type TelegramTokenResolution = {
  token: string;
  source: TelegramTokenSource;
  duplicateSourcesDetected: boolean;
  migrationMirrorUsed: boolean;
};

type ResolveTelegramTokenOpts = {
  envToken?: string | null;
  accountId?: string | null;
  logMissingFile?: (message: string) => void;
};

export function resolveTelegramToken(
  cfg?: OpenClawConfig,
  opts: ResolveTelegramTokenOpts = {},
): TelegramTokenResolution {
  const accountId = normalizeAccountId(opts.accountId);
  const telegramCfg = cfg?.channels?.telegram;

  // Account IDs are normalized for routing (e.g. lowercased). Config keys may not
  // be normalized, so resolve per-account config by matching normalized IDs.
  const resolveAccountCfg = (id: string): TelegramAccountConfig | undefined => {
    const accounts = telegramCfg?.accounts;
    if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) {
      return undefined;
    }
    // Direct hit (already normalized key)
    const direct = accounts[id];
    if (direct) {
      return direct;
    }
    // Fallback: match by normalized key
    const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === id);
    return matchKey ? accounts[matchKey] : undefined;
  };

  const accountCfg = resolveAccountCfg(
    accountId !== DEFAULT_ACCOUNT_ID ? accountId : DEFAULT_ACCOUNT_ID,
  );
  const accountTokenFile = accountCfg?.tokenFile?.trim();
  const accountToken = accountCfg?.botToken?.trim();
  if (accountTokenFile) {
    if (!fs.existsSync(accountTokenFile)) {
      opts.logMissingFile?.(
        `channels.telegram.accounts.${accountId}.tokenFile not found: ${accountTokenFile}`,
      );
      return {
        token: "",
        source: "none",
        duplicateSourcesDetected: false,
        migrationMirrorUsed: false,
      };
    }
    try {
      const token = fs.readFileSync(accountTokenFile, "utf-8").trim();
      if (token) {
        return {
          token,
          source: "tokenFile",
          duplicateSourcesDetected: Boolean(accountToken),
          migrationMirrorUsed: false,
        };
      }
    } catch (err) {
      opts.logMissingFile?.(
        `channels.telegram.accounts.${accountId}.tokenFile read failed: ${String(err)}`,
      );
      return {
        token: "",
        source: "none",
        duplicateSourcesDetected: false,
        migrationMirrorUsed: false,
      };
    }
    return {
      token: "",
      source: "none",
      duplicateSourcesDetected: false,
      migrationMirrorUsed: false,
    };
  }

  if (accountToken) {
    return {
      token: accountToken,
      source: "config",
      duplicateSourcesDetected: false,
      migrationMirrorUsed: false,
    };
  }

  const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
  const tokenFile = telegramCfg?.tokenFile?.trim();
  const envToken = allowEnv ? (opts.envToken ?? process.env.TELEGRAM_BOT_TOKEN)?.trim() : "";
  const configToken = telegramCfg?.botToken?.trim();
  if (tokenFile && allowEnv) {
    if (!fs.existsSync(tokenFile)) {
      opts.logMissingFile?.(`channels.telegram.tokenFile not found: ${tokenFile}`);
      return {
        token: "",
        source: "none",
        duplicateSourcesDetected: false,
        migrationMirrorUsed: false,
      };
    }
    try {
      const token = fs.readFileSync(tokenFile, "utf-8").trim();
      if (token) {
        return {
          token,
          source: "tokenFile",
          duplicateSourcesDetected: Boolean(envToken || configToken),
          migrationMirrorUsed: false,
        };
      }
    } catch (err) {
      opts.logMissingFile?.(`channels.telegram.tokenFile read failed: ${String(err)}`);
      return {
        token: "",
        source: "none",
        duplicateSourcesDetected: false,
        migrationMirrorUsed: false,
      };
    }
  }

  if (envToken) {
    return {
      token: envToken,
      source: "env",
      duplicateSourcesDetected: Boolean(configToken),
      migrationMirrorUsed: false,
    };
  }

  if (configToken && allowEnv) {
    return {
      token: configToken,
      source: "config",
      duplicateSourcesDetected: false,
      migrationMirrorUsed: true,
    };
  }

  return { token: "", source: "none", duplicateSourcesDetected: false, migrationMirrorUsed: false };
}
