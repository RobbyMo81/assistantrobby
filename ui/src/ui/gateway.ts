import { buildDeviceAuthPayload } from "../../../src/gateway/device-auth.js";
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  type GatewayClientMode,
  type GatewayClientName,
} from "../../../src/gateway/protocol/client-info.js";
import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from "./device-auth.ts";
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity.ts";
import { generateUUID } from "./uuid.ts";

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientName?: GatewayClientName;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  instanceId?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
  onAuthFallback?: (info: { reason: string }) => void;
};

// 4008 = application-defined code (browser rejects 1008 "Policy Violation")
const CONNECT_FAILED_CLOSE_CODE = 4008;

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;

  constructor(private opts: GatewayBrowserClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    if (this.closed) {
      return;
    }
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason });
      this.scheduleReconnect();
    });
    this.ws.addEventListener("error", () => {
      // ignored; close handler will fire
    });
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    window.setTimeout(() => this.connect(), delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private buildClientInfo() {
    return {
      id: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.CONTROL_UI,
      version: this.opts.clientVersion ?? "dev",
      platform: this.opts.platform ?? navigator.platform ?? "web",
      mode: this.opts.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
      instanceId: this.opts.instanceId,
    };
  }

  private async buildSignedDevice(params: {
    deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>>;
    client: ReturnType<GatewayBrowserClient["buildClientInfo"]>;
    role: string;
    scopes: string[];
    authToken: string | null;
    nonce?: string;
  }) {
    const signedAtMs = Date.now();
    const payload = buildDeviceAuthPayload({
      deviceId: params.deviceIdentity.deviceId,
      clientId: params.client.id,
      clientMode: params.client.mode,
      role: params.role,
      scopes: params.scopes,
      signedAtMs,
      token: params.authToken,
      nonce: params.nonce,
    });
    const signature = await signDevicePayload(params.deviceIdentity.privateKey, payload);
    return {
      id: params.deviceIdentity.deviceId,
      publicKey: params.deviceIdentity.publicKey,
      signature,
      signedAt: signedAtMs,
      nonce: params.nonce,
    };
  }

  private async sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    // crypto.subtle is only available in secure contexts (HTTPS, localhost).
    // Over plain HTTP, we skip device identity and fall back to token-only auth.
    // Gateways may reject this unless gateway.controlUi.allowInsecureAuth is enabled.
    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;

    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
    const role = "operator";
    const client = this.buildClientInfo();
    let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
    let canFallbackToShared = false;
    let authToken = this.opts.token;
    let storedToken: string | undefined;

    if (isSecureContext) {
      deviceIdentity = await loadOrCreateDeviceIdentity();
      storedToken =
        (
          await loadDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role,
            keyMaterial: deviceIdentity.privateKey,
          }).catch(() => {
            this.opts.onAuthFallback?.({
              reason: "secret container load failed; explicit login required",
            });
            return null;
          })
        )?.token ?? undefined;
      authToken = storedToken ?? this.opts.token;
      canFallbackToShared = Boolean(storedToken && (this.opts.token || this.opts.password));
    }
    const auth =
      authToken || this.opts.password
        ? {
            token: authToken,
            password: this.opts.password,
          }
        : undefined;

    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string | undefined;
        }
      | undefined;

    if (isSecureContext && deviceIdentity) {
      const nonce = this.connectNonce ?? undefined;
      device = await this.buildSignedDevice({
        deviceIdentity,
        client,
        role,
        scopes,
        authToken: authToken ?? null,
        nonce,
      });
    }
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client,
      role,
      scopes,
      device,
      caps: [],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    void this.request<GatewayHelloOk>("connect", params)
      .then(async (hello) => {
        if (hello?.auth?.deviceToken && deviceIdentity) {
          await storeDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role: hello.auth.role ?? role,
            keyMaterial: deviceIdentity.privateKey,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          }).catch(() => {
            this.opts.onAuthFallback?.({
              reason: "secret container save failed after connect; session will not persist",
            });
          });
        }
        this.backoffMs = 800;
        this.opts.onHello?.(hello);
      })
      .catch(async () => {
        if (canFallbackToShared && deviceIdentity) {
          await clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role }).catch(() => {
            this.opts.onAuthFallback?.({
              reason: "secret container clear failed after stored session rejection",
            });
          });
          this.opts.onAuthFallback?.({
            reason: "stored session rejected; cleared it and retrying bootstrap auth",
          });
        }
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      const seq = typeof evt.seq === "number" ? evt.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }
      try {
        this.opts.onEvent?.(evt);
      } catch (err) {
        console.error("[gateway] event handler error:", err);
      }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "request failed"));
      }
      return;
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = generateUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
    }
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, 750);
  }
}
