import Docker from "dockerode";

// Docker client for internal services (PostgreSQL, Redis, Caddy)
// and GPU agent containers (via runtime.ts).
// Firecracker handles non-GPU agent isolation — see firecracker.ts.

/**
 * Resolve dockerode client from `DOCKER_HOST` (aligns with docker-modem rules).
 * - **Unset** — explicit socket: Linux/macOS `/var/run/docker.sock`; Windows Docker Desktop named pipe.
 * - **`unix://` / `npipe://`** — strip scheme (same as docker-modem).
 * - **No `scheme://` in value** — treat as filesystem / named-pipe path (e.g. Compose `DOCKER_HOST=/var/run/docker.sock`).
 * - **`tcp://` / `http(s)://`** — delegate to **`new Docker()`** so docker-modem parses `DOCKER_HOST` from the environment.
 */
export function dockerConnectionFromEnv(): Docker {
  const raw = process.env.DOCKER_HOST?.trim();

  if (!raw) {
    const socketPath =
      process.platform === "win32"
        ? "//./pipe/docker_engine"
        : "/var/run/docker.sock";
    return new Docker({ socketPath });
  }

  if (raw.startsWith("unix://")) {
    const socketPath = raw.slice("unix://".length) || "/var/run/docker.sock";
    return new Docker({ socketPath });
  }

  if (raw.startsWith("npipe://")) {
    const socketPath = raw.slice(8) || "//./pipe/docker_engine";
    return new Docker({ socketPath });
  }

  if (/^[a-zA-Z][a-zA-Z+.-]*:\/\//.test(raw)) {
    return new Docker();
  }

  return new Docker({ socketPath: raw });
}

const docker = dockerConnectionFromEnv();

export default docker;
