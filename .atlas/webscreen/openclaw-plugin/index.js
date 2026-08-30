import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const DEFAULT_BASE_URL = "http://127.0.0.1:5000";
const DEFAULT_SESSION_KEY = "agent:main:subagent:atlas-webscreen-hot-listener";

function result(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    details: value,
  };
}

function pluginBaseUrl(api) {
  const configured = String(api.pluginConfig?.baseUrl || DEFAULT_BASE_URL).trim();
  const parsed = new URL(configured);
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) {
    throw new Error("ATLAS WebScreen runtime only accepts a loopback baseUrl");
  }
  return parsed.origin;
}

export default definePluginEntry({
  id: "atlas-webscreen-runtime",
  name: "ATLAS WebScreen Runtime",
  description: "Resident input and output tools for ATLAS WebScreen.",
  register(api) {
    const baseUrl = pluginBaseUrl(api);
    const allowedSessionKey = String(
      api.pluginConfig?.sessionKey || DEFAULT_SESSION_KEY,
    ).trim();

    api.on("before_tool_call", async (event, context) => {
      if (event.toolName !== "atlas_webscreen_wait") return;
      if (context.sessionKey === allowedSessionKey) return;
      return {
        block: true,
        blockReason: "atlas_webscreen_wait is restricted to the ATLAS WebScreen hot-listener session",
      };
    }, { priority: 1000 });

    api.registerTool(
      (context) => {
        if (context.sessionKey !== allowedSessionKey) return null;

        return {
          name: "atlas_webscreen_wait",
          description: "Wait for the next provisional ATLAS WebScreen transcript. Use only when the WebScreen hot-listener instructions explicitly ask you to wait.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              phase: { type: "string", enum: ["next"] },
              timeoutMs: { type: "integer", minimum: 600000, maximum: 600000 }
            },
            required: ["phase", "timeoutMs"]
          },
          async execute(_toolCallId, params, signal) {
            const url = new URL("/api/resident/wait", baseUrl);
            url.searchParams.set("phase", params.phase);
            const response = await fetch(url, { signal, cache: "no-store" });
            if (!response.ok) throw new Error(`WebScreen wait failed with HTTP ${response.status}`);
            return result(await response.json());
          }
        };
      },
      { name: "atlas_webscreen_wait" },
    );
  }
});
