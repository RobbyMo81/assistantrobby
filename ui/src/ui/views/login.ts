import { html } from "lit";
import type { UiSettings } from "../storage.ts";

export type LoginProps = {
  settings: UiSettings;
  bootstrapToken: string;
  password: string;
  lastError: string | null;
  onSettingsChange: (next: UiSettings) => void;
  onBootstrapTokenChange: (next: string) => void;
  onPasswordChange: (next: string) => void;
  onSubmit: () => void;
};

function renderAuthHint(props: LoginProps) {
  if (!props.lastError) {
    return html`
      <div class="callout">
        Enter your gateway URL and credentials to open the dashboard. Legacy hash-token bootstrap links
        still hydrate this form.
      </div>
    `;
  }

  const lower = props.lastError.toLowerCase();
  const looksAuthFailure = lower.includes("unauthorized") || lower.includes("connect failed");
  if (!looksAuthFailure) {
    return html`<div class="callout danger">${props.lastError}</div>`;
  }

  const hasToken = Boolean(props.bootstrapToken.trim());
  const hasPassword = Boolean(props.password.trim());
  if (!hasToken && !hasPassword) {
    return html`
      <div class="callout danger">
        This gateway requires authentication. Add a token or password, then log in.
      </div>
    `;
  }

  return html`
    <div class="callout danger">Login failed. Verify the token or password, then try again.</div>
  `;
}

export function renderLogin(props: LoginProps) {
  return html`
    <div class="shell shell--auth">
      <main class="content content--auth">
        <section class="card">
          <div class="card-title">Control UI Login</div>
          <div class="card-sub">
            Explicit gateway authentication for the sandbox login flow.
          </div>
          ${renderAuthHint(props)}
          <div class="form-grid" style="margin-top: 16px;">
            <label class="field">
              <span>WebSocket URL</span>
              <input
                .value=${props.settings.gatewayUrl}
                @input=${(event: Event) => {
                  const next = (event.target as HTMLInputElement).value;
                  props.onSettingsChange({ ...props.settings, gatewayUrl: next });
                }}
                placeholder="ws://127.0.0.1:19011"
              />
            </label>
            <label class="field">
              <span>Gateway Token</span>
              <input
                .value=${props.bootstrapToken}
                @input=${(event: Event) => {
                  const next = (event.target as HTMLInputElement).value;
                  props.onBootstrapTokenChange(next);
                }}
                placeholder="gateway token"
              />
            </label>
            <label class="field">
              <span>Password (not stored)</span>
              <input
                type="password"
                .value=${props.password}
                @input=${(event: Event) => {
                  const next = (event.target as HTMLInputElement).value;
                  props.onPasswordChange(next);
                }}
                placeholder="shared password"
              />
            </label>
          </div>
          <div class="row" style="margin-top: 16px;">
            <button class="btn primary" @click=${() => props.onSubmit()}>Log In</button>
            <span class="muted">
              Gateway verification stays enabled. This only replaces the UI entry flow.
            </span>
          </div>
        </section>
      </main>
    </div>
  `;
}
