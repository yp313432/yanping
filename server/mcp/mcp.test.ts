import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { mcpHandler } from "./index.ts";

const NOW = Date.parse("2024-06-15T04:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

let client: Client;

before(async () => {
  client = new Client({ name: "shigan-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    { fetch: (url, init) => mcpHandler.fetch(new Request(url, init)) },
  );
  await client.connect(transport);
});

after(async () => {
  await client.close();
});

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, `tool ${name} returned an error`);
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("shigan MCP server", () => {
  it("lists exactly the three time tools", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      ["get_conversation_gap", "get_current_time", "get_temporal_context"],
    );
  });

  it("get_current_time returns a timezone-aware result", async () => {
    const out = await callTool("get_current_time", {
      timezone: "Asia/Shanghai",
      at: NOW,
    });
    assert.equal(out.iso, iso(NOW));
    assert.equal(out.timezone, "Asia/Shanghai");
    assert.equal(out.date, "2024-06-15");
    assert.equal(out.time, "12:00:00");
    assert.equal(out.weekday, "星期六");
    assert.equal(out.timeOfDay, "noon");
    assert.match(String(out.utcOffset), /\+08:00/);
  });

  it("get_temporal_context reuses the shared core (时辰 / 节气)", async () => {
    const out = await callTool("get_temporal_context", {
      timezone: "Asia/Shanghai",
      at: NOW,
    });
    assert.equal(out.timezone, "Asia/Shanghai");
    assert.equal(out.hour, 12);
    assert.equal((out.shichen as { name: string }).name, "午时");
    assert.equal((out.solarTerm as { name: string }).name, "芒种");
    assert.equal(out.season, "夏");
  });

  it("get_conversation_gap with no previousAt returns hasPrevious: false", async () => {
    const out = await callTool("get_conversation_gap", { at: NOW });
    assert.equal(out.hasPrevious, false);
    assert.equal(out.previousAt, null);
  });

  it("get_conversation_gap one hour ago", async () => {
    const out = await callTool("get_conversation_gap", {
      at: NOW,
      previousAt: iso(NOW - 3_600_000),
    });
    assert.equal(out.hasPrevious, true);
    assert.equal(out.durationMs, 3_600_000);
    assert.equal(out.previousAt, iso(NOW - 3_600_000));
  });

  it("get_conversation_gap across midnight (13h)", async () => {
    const out = await callTool("get_conversation_gap", {
      at: NOW,
      previousAt: iso(NOW - 13 * 3_600_000),
    });
    assert.equal(out.hasPrevious, true);
    assert.equal(out.durationMs, 13 * 3_600_000);
    assert.match(String(out.humanReadable), /小时/);
  });

  it("get_conversation_gap across a day (昨天)", async () => {
    const out = await callTool("get_conversation_gap", {
      at: NOW,
      previousAt: iso(NOW - 86_400_000),
    });
    assert.equal(out.hasPrevious, true);
    assert.equal(out.durationMs, 86_400_000);
    assert.match(String(out.humanReadable), /天/);
  });

  it("get_conversation_gap parses an offset ISO (跨时区)", async () => {
    const out = await callTool("get_conversation_gap", {
      at: NOW,
      previousAt: "2024-06-15T12:00:00+08:00",
    });
    assert.equal(out.hasPrevious, true);
    assert.equal(out.durationMs, 0);
    assert.equal(out.previousAt, iso(NOW));
  });
});