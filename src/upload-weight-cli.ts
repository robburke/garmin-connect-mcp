/**
 * Standalone CLI for uploading a weigh-in to Garmin Connect.
 *
 * Usage:
 *   npx tsx src/upload-weight-cli.ts <weightKg> <iso-timestamp> [unitKey]
 *
 * Example:
 *   npx tsx src/upload-weight-cli.ts 78.3 2026-04-13T05:00:00-04:00
 *   npx tsx src/upload-weight-cli.ts 172.6 2026-04-13T05:00:00-04:00 lbs
 *
 * Outputs JSON to stdout on success. Exits 0 on success, 1 on error
 * (with error message on stderr). Designed to be called from external
 * scripts (e.g. the Python withings-garmin-local daemon).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { getSharedClient } from "./garmin-client.js";

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const result = (await (server as any)._registeredTools[name].handler(
    { ...args },
    { signal: new AbortController().signal }
  )) as ToolResult;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: upload-weight-cli <weightKg> <iso-timestamp> [unitKey]"
    );
    console.error(
      "Example: upload-weight-cli 78.3 2026-04-13T05:00:00-04:00"
    );
    process.exit(1);
  }

  const weightKg = Number(args[0]);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    console.error(`Invalid weight: ${args[0]}`);
    process.exit(1);
  }

  const timestampIso = args[1];
  if (isNaN(new Date(timestampIso).getTime())) {
    console.error(`Invalid ISO timestamp: ${timestampIso}`);
    process.exit(1);
  }

  const unitKey = args[2] ?? "kg";
  if (unitKey !== "kg" && unitKey !== "lbs") {
    console.error(`Invalid unitKey: ${unitKey} (must be kg or lbs)`);
    process.exit(1);
  }

  const server = new McpServer({
    name: "upload-weight-cli",
    version: "0.0.0",
  });
  registerTools(server);

  try {
    const result = await callTool(server, "upload-weight", {
      weightKg,
      timestampIso,
      unitKey,
    });

    if (result.isError) {
      console.error(result.content[0]?.text ?? "unknown error");
      await getSharedClient().close();
      process.exit(1);
    }

    process.stdout.write(result.content[0]?.text ?? "");
    process.stdout.write("\n");
    await getSharedClient().close();
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    try {
      await getSharedClient().close();
    } catch {
      // ignore close errors during error path
    }
    process.exit(1);
  }
}

main();
