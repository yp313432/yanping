import { createHash, timingSafeEqual } from "node:crypto";
import { check, timezone } from "./health-model.ts";

type Env = Record<string, string | undefined>;
function secret(value: string | undefined): string {
  if (!value || value.length < 32 || value.length > 512 || /\s/.test(value)) {
    throw new Error("Health token is not configured correctly");
  }
  return value;
}
export function tokenMatches(actual: string | null | undefined, expected: string): boolean {
  if (!actual || actual.length > 1024) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}
export function healthSource(env: Env = process.env): string {
  const source = env.HEALTH_SOURCE_ID ?? "huawei-band-11";
  check(/^[a-zA-Z0-9_-]{1,64}$/.test(source));
  return source;
}
// Only deploy this MCP entrypoint behind Horizon Authentication. The gateway
// strips caller-supplied horizon-* headers and injects the authenticated identity.
// A bearer upload/query token alone never grants health read access.
export function healthQueryActor(headers: { get(name: string): string | null } | undefined, env: Env = process.env): string {
  const owner = env.HEALTH_OWNER_EMAIL?.trim().toLowerCase();
  const caller = headers?.get("horizon-actor-email")?.trim().toLowerCase();
  if (headers?.get("horizon-actor-type") !== "user" || !owner || caller !== owner) {
    throw new Error("Health query unauthorized");
  }
  const actor = env.HEALTH_ACTOR_ID?.trim();
  if (!actor || actor.length > 512) throw new Error("Health query unauthorized");
  return actor;
}
export interface IngestConfig { token: string; actor: string; source: string; timezone: string; host: string }
export function ingestConfig(env: Env = process.env): IngestConfig {
  const token = secret(env.HEALTH_INGEST_TOKEN);
  // Fixed health owner binding shared with MCP, never a body/header claim.
  const actor = env.HEALTH_ACTOR_ID?.trim();
  if (!actor || actor.length > 512) throw new Error("HEALTH_ACTOR_ID is required");
  let url: URL;
  try { url = new URL(env.HEALTH_PUBLIC_URL ?? ""); }
  catch { throw new Error("HEALTH_PUBLIC_URL must be an HTTPS origin"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("HEALTH_PUBLIC_URL must be an HTTPS origin");
  }
  return { token, actor, source: healthSource(env), timezone: timezone(env.HEALTH_TIMEZONE ?? "Asia/Shanghai"), host: url.host };
}
