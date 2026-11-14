import { createHealthUploadHandler } from "../../../server/mcp/health-http.ts";
import { ingestWithNeon } from "./neon.ts";

export default {
  fetch: createHealthUploadHandler((config, upload, env) =>
    ingestWithNeon(config, upload, env.HEALTH_DATABASE_URL)),
};
