import { fromNodeHandler } from "h3";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { mcpHandler } from "../mcp/index";

/**
 * Nitro（生产 / preview）侧的 /mcp 挂载。
 * 与 vite.config.ts 里的开发侧中间件共用同一个 `mcpHandler`，
 * 因此 Web App 与 MCP Server 属于同一个运行环境、同一套时间核心逻辑。
 */
export default fromNodeHandler(toNodeHandler(mcpHandler));