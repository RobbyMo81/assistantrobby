type SecretContainerStore = {
  version: 1;
  records: Record<string, SecretContainerEnvelope>;
};

type SecretContainerEnvelope = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  updatedAtMs: number;
};

export type SecretContainerState = {
  backend: "webcrypto-localstorage";
  available: boolean;
  degraded: boolean;
  lastEvent:
    | "secret_container.init.success"
    | "secret_container.init.failure"
    | "secret_container.available"
    | "secret_container.unavailable"
    | "secret_container.save.success"
    | "secret_container.save.failure"
    | "secret_container.load.success"
    | "secret_container.load.failure"
    | "secret_container.clear.success"
    | "secret_container.clear.failure"
    | "secret_container.degraded_mode.entered"
    | "secret_container.degraded_mode.exited"
    | "secret_container.idle";
  lastErrorCode: string | null;
};

const STORAGE_KEY = "openclaw.secret.container.v1";
const PURPOSE_PREFIX = "openclaw-secret-container";

let state: SecretContainerState = {
  backend: "webcrypto-localstorage",
  available: false,
  degraded: false,
  lastEvent: "secret_container.idle",
  lastErrorCode: null,
};

function reportState(
  nextEvent: SecretContainerState["lastEvent"],
  patch?: Partial<Pick<SecretContainerState, "available" | "degraded" | "lastErrorCode">>,
) {
  state = {
    ...state,
    ...patch,
    lastEvent: nextEvent,
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function readStore(): SecretContainerStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { version: 1, records: {} };
    }
    const parsed = JSON.parse(raw) as SecretContainerStore;
    if (parsed?.version !== 1 || typeof parsed.records !== "object" || !parsed.records) {
      return { version: 1, records: {} };
    }
    return parsed;
  } catch {
    return { version: 1, records: {} };
  }
}

function writeStore(store: SecretContainerStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

async function deriveKey(params: { purpose: string; keyMaterial: string }): Promise<CryptoKey> {
  const source = new TextEncoder().encode(
    `${PURPOSE_PREFIX}:${params.purpose}:${params.keyMaterial}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", source);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function ensureAvailable() {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    reportState("secret_container.init.failure", {
      available: false,
      degraded: true,
      lastErrorCode: "crypto_unavailable",
    });
    reportState("secret_container.degraded_mode.entered", {
      available: false,
      degraded: true,
      lastErrorCode: "crypto_unavailable",
    });
    throw new Error("secret container unavailable: crypto_unavailable");
  }
  if (state.degraded) {
    reportState("secret_container.degraded_mode.exited", {
      available: true,
      degraded: false,
      lastErrorCode: null,
    });
  }
  reportState("secret_container.init.success", {
    available: true,
    degraded: false,
    lastErrorCode: null,
  });
  reportState("secret_container.available", {
    available: true,
    degraded: false,
    lastErrorCode: null,
  });
}

export function getSecretContainerState(): SecretContainerState {
  return { ...state };
}

export async function saveSecretRecord<T>(params: {
  recordId: string;
  purpose: string;
  keyMaterial: string;
  value: T;
}) {
  try {
    await ensureAvailable();
    const key = await deriveKey({ purpose: params.purpose, keyMaterial: params.keyMaterial });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(params.value));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
    );
    const store = readStore();
    store.records[params.recordId] = {
      version: 1,
      algorithm: "AES-GCM",
      iv: base64UrlEncode(iv),
      ciphertext: base64UrlEncode(ciphertext),
      updatedAtMs: Date.now(),
    };
    writeStore(store);
    reportState("secret_container.save.success", {
      available: true,
      degraded: false,
      lastErrorCode: null,
    });
  } catch (err) {
    reportState("secret_container.save.failure", {
      lastErrorCode: "save_failed",
    });
    throw err;
  }
}

export async function loadSecretRecord<T>(params: {
  recordId: string;
  purpose: string;
  keyMaterial: string;
}): Promise<T | null> {
  try {
    await ensureAvailable();
    const store = readStore();
    const entry = store.records[params.recordId];
    if (!entry) {
      reportState("secret_container.load.success", {
        available: true,
        degraded: false,
        lastErrorCode: null,
      });
      return null;
    }
    const key = await deriveKey({ purpose: params.purpose, keyMaterial: params.keyMaterial });
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64UrlDecode(entry.iv) },
        key,
        base64UrlDecode(entry.ciphertext),
      ),
    );
    reportState("secret_container.load.success", {
      available: true,
      degraded: false,
      lastErrorCode: null,
    });
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch (err) {
    reportState("secret_container.load.failure", {
      lastErrorCode: "load_failed",
    });
    throw err;
  }
}

export async function clearSecretRecord(params: { recordId: string }) {
  try {
    const store = readStore();
    delete store.records[params.recordId];
    writeStore(store);
    reportState("secret_container.clear.success", {
      lastErrorCode: null,
    });
  } catch (err) {
    reportState("secret_container.clear.failure", {
      lastErrorCode: "clear_failed",
    });
    throw err;
  }
}
