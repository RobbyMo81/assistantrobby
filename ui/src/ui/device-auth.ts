import {
  clearSecretRecord,
  getSecretContainerState,
  loadSecretRecord,
  saveSecretRecord,
} from "./secret-container.ts";

export type DeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

function normalizeRole(role: string): string {
  return role.trim();
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  const out = new Set<string>();
  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return [...out].toSorted();
}

function buildRecordId(params: { deviceId: string; role: string }) {
  return `device-auth:${params.deviceId}:${normalizeRole(params.role)}`;
}

function buildPurpose(params: { deviceId: string; role: string }) {
  return `browser-auth-issued-token:${params.deviceId}:${normalizeRole(params.role)}`;
}

export async function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  keyMaterial: string;
}): Promise<DeviceAuthEntry | null> {
  const entry = await loadSecretRecord<DeviceAuthEntry>({
    recordId: buildRecordId(params),
    purpose: buildPurpose(params),
    keyMaterial: params.keyMaterial,
  });
  if (!entry || typeof entry.token !== "string") {
    return null;
  }
  return entry;
}

export async function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  keyMaterial: string;
  token: string;
  scopes?: string[];
}): Promise<DeviceAuthEntry> {
  const role = normalizeRole(params.role);
  const entry: DeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeScopes(params.scopes),
    updatedAtMs: Date.now(),
  };
  await saveSecretRecord({
    recordId: buildRecordId(params),
    purpose: buildPurpose(params),
    keyMaterial: params.keyMaterial,
    value: entry,
  });
  return entry;
}

export async function clearDeviceAuthToken(params: { deviceId: string; role: string }) {
  await clearSecretRecord({
    recordId: buildRecordId(params),
  });
}

export { getSecretContainerState };
