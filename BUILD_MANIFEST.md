# OpenClaw Build Manifest

## Project Overview
*   **Project Name:** OpenClaw - Personal AI Assistant
*   **Primary Objective:** Local-first, multi-channel, multi-agent AI assistant.
*   **Core Technologies:**
    *   Node.js / TypeScript (Primary application logic, CLI, Gateway, Channels)
    *   Python (for specific skills, e.g., `local-places`, `openai-image-gen`)
    *   Docker (for sandboxing skills and deployment)
    *   SQLite with `sqlite-vec` (for short-term memory and vector indexing)
    *   FastAPI (for Python-based skills exposed as web services)
*   **Planned Integrations:**
    *   ChromaDB (for long-term externalized memory and hybrid vector search)

## Key Dependencies
*   **Runtime:** Node.js >= 22
*   **Package Manager:** pnpm (preferred for development from source), npm or bun also supported.
*   **External Libraries/Frameworks:**
    *   `@mariozechner/pi-coding-agent` (Core agent session management, including compaction)
    *   `node:sqlite` (SQLite database interaction)
    *   `sqlite-vec` (SQLite vector extension)
    *   `FastAPI` (Python web framework for skills)
    *   `websockets` (for Gateway communication)
    *   Various channel-specific libraries (e.g., `grammY` for Telegram, `discord.js` for Discord)
*   **Docker Images:**
    *   `openclaw-sandbox:bookworm-slim` (General skill sandboxing)
    *   `openclaw-sandbox-browser:bookworm-slim` (Browser automation sandboxing)
    *   `chromadb/chroma:1.5.0` (Planned for ChromaDB service)

## Build Process
1.  **Clone Repository:** `git clone https://github.com/openclaw/openclaw.git`
2.  **Install Dependencies:** `pnpm install`
3.  **Build UI (if applicable):** `pnpm ui:build`
4.  **Build TypeScript:** `pnpm build` (compiles `src/` to `dist/`)
5.  **Docker Image Build:** Custom Dockerfiles (`Dockerfile`, `Dockerfile.sandbox`, `Dockerfile.sandbox-browser`) define images.
    *   The main application uses `${OPENCLAW_IMAGE:-openclaw:local}`.
    *   Sandbox images are built separately.

## Deployment Strategy
*   **Local Execution:** Via `openclaw onboard` wizard, `openclaw gateway`, `openclaw agent` commands.
*   **Daemon:** `openclaw onboard --install-daemon` sets up `launchd` (macOS) or `systemd` (Linux) user services.
*   **Docker Compose:** `docker-compose.yml` orchestrates `openclaw-gateway` and `openclaw-cli` services. Planned integration of `chromadb` service.
*   **Cloud Deployment:** References to Fly.io (`fly.toml`, `fly.private.toml`), GCP, Hetzner indicate cloud deployment options, likely container-based.

## Architectural Changes & Security Hardening Summary

### Architectural Audit & Mapping
*   Mapped core Node.js and Python skill entry points.
*   Documented current SQLite data flow and proposed ChromaDB integration for hybrid memory.
*   Generated `docs/architecture.md`.

### Hybrid Memory Implementation (ChromaDB)
*   ChromaDB Docker service configured in `docker-compose.yml` for persistence.
*   Compaction logic delegates summarization to `session.compact()` method; ChromaDB integration points identified.
*   Conceptual outline for RRF query logic in Python Skill Bridge provided.

### Security Hardening
*   **CVE-2026-25253 Patch:** Implemented user-confirmation modals for external `gatewayUrl` connections in `src/gateway/call.ts`. Existing WebSocket origin validation for browser clients was confirmed.
*   **CVE-2026-25157 Patch:** Verified that `parseSshTarget` already blocks dash-prefixed strings and `startSshPortForward` uses `--` to prevent command injection, effectively addressing the CVE.
*   **API Key Audit:** Audited `.env` and `.md` files; recommended transition to encrypted secret storage due to reliance on plaintext environment variables.
*   **Skill Sandbox Validation:** Proposed enhancements to the skill sandbox tool policy, specifically refining `exec` access, controlling network egress, and strengthening file system restrictions to mitigate "ClawHub" malicious package risks.
