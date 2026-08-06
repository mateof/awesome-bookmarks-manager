import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { authFromToken } from "../auth/api-auth.js";
import { buildMcpServer } from "./server.js";

/**
 * Remote MCP endpoint over the Streamable HTTP transport. An MCP client
 * (Claude, etc.) connects directly to https://<host>/api/mcp — no local
 * process required. Stateless: a fresh server + transport per request.
 *
 * Auth accepts either `Authorization: Bearer <token>` or a `?token=` query
 * parameter, so clients that only let you paste a URL still work. Tokens in
 * the URL are less safe (they can land in logs) — prefer the header.
 */
function extractToken(req: FastifyRequest): string | null {
  const authz = req.headers.authorization;
  if (authz && authz.startsWith("Bearer ")) {
    return authz.slice("Bearer ".length).trim();
  }
  const q = req.query as Record<string, unknown> | undefined;
  const t = q?.token;
  return typeof t === "string" && t.length > 0 ? t : null;
}

const METHOD_NOT_ALLOWED = {
  jsonrpc: "2.0" as const,
  error: { code: -32000, message: "Method not allowed. Use POST." },
  id: null,
};

export const mcpRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/mcp", async (req, reply) => {
    const token = extractToken(req);
    if (!token) {
      reply.code(401);
      return { error: "Missing API token", code: "unauthorized" };
    }
    // Throws AppError (401/423) on failure — handled by the global handler
    // before we hijack the response.
    const ctx = authFromToken(token);

    const server = buildMcpServer(ctx);
    const transport = new StreamableHTTPServerTransport({
      // Stateless mode: no session persistence between requests.
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Take over the raw socket; Fastify must not also try to respond.
    reply.hijack();
    reply.raw.on("close", () => {
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      req.log.error({ err }, "MCP request failed");
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.setHeader("content-type", "application/json");
        reply.raw.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal error" },
            id: null,
          }),
        );
      } else {
        reply.raw.end();
      }
    }
  });

  // The stateless transport only needs POST. GET (server-push SSE) and
  // DELETE (session teardown) have nothing to do here.
  app.get("/api/mcp", async (_req, reply) => {
    reply.code(405).send(METHOD_NOT_ALLOWED);
  });
  app.delete("/api/mcp", async (_req, reply) => {
    reply.code(405).send(METHOD_NOT_ALLOWED);
  });
};
