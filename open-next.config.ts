import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// VadoBene is dynamic; no R2 cache bucket is required for the initial migration.
export default defineCloudflareConfig({});
