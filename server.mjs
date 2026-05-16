import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: process.env.MCP_HTTP_JSON_LIMIT ?? "25mb" }));

const PORT = Number(process.env.PORT ?? process.env.MCP_PORT ?? 8787);
const HOST = process.env.MCP_HOST ?? "0.0.0.0";
const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL?.trim() || `http://localhost:${PORT}/mcp`;
const WORKSPACES_ROOT = path.resolve(process.env.MCP_WORKSPACES_ROOT ?? process.env.MCP_WORKSPACE_ROOT ?? path.join(process.cwd(), "workspaces"));
const MAX_INLINE_BYTES = Number(process.env.MCP_MAX_INLINE_BYTES ?? 1_000_000);
const OAUTH_ISSUER = process.env.OAUTH_ISSUER?.trim() || "";
const OAUTH_AUDIENCE = process.env.OAUTH_AUDIENCE?.trim() || "";
const OAUTH_JWKS_URL = process.env.OAUTH_JWKS_URL?.trim() || "";
const OAUTH_REQUIRED_SCOPES = (process.env.OAUTH_REQUIRED_SCOPES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SAFE_WORKSPACE_NAME_REGEX = /[^a-zA-Z0-9_.-]/g;

function normalizeToken(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1] : trimmed).trim();
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.trim()) {
    const match = auth.trim().match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return normalizeToken(match[1]);
  }

  const cfAccessJwt = req.headers["cf-access-jwt-assertion"];
  if (typeof cfAccessJwt === "string" && cfAccessJwt.trim()) {
    return normalizeToken(cfAccessJwt);
  }

  return null;
}

function resourceMetadataUrl() {
  return MCP_PUBLIC_URL.endsWith("/mcp")
    ? `${MCP_PUBLIC_URL.slice(0, -4)}/.well-known/oauth-protected-resource`
    : `${MCP_PUBLIC_URL}/.well-known/oauth-protected-resource`;
}

function unauthorized(res, message = "unauthorized") {
  res.set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl()}"`);
  res.status(401).json({
    error: "Unauthorized",
    message
  });
}

function ensureAuthConfig() {
  if (!MCP_PUBLIC_URL || !OAUTH_ISSUER || !OAUTH_AUDIENCE || !OAUTH_JWKS_URL) {
    throw new Error("OAuth obligatorio: define MCP_PUBLIC_URL, OAUTH_ISSUER, OAUTH_AUDIENCE y OAUTH_JWKS_URL.");
  }
}

let oauthJwks = null;
function getOauthJwks() {
  if (!oauthJwks) {
    oauthJwks = createRemoteJWKSet(new URL(OAUTH_JWKS_URL));
  }
  return oauthJwks;
}

function hasRequiredScopes(payloadScopes, requiredScopes) {
  if (!requiredScopes.length) return true;
  const set = new Set(
    String(payloadScopes ?? "")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return requiredScopes.every((scope) => set.has(scope));
}

function normalizeWorkspaceNameFromEmail(email) {
  const trimmed = String(email ?? "").trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    throw new Error("El token no contiene un email valido.");
  }
  const normalized = trimmed.replace(/@/g, "_").replace(SAFE_WORKSPACE_NAME_REGEX, "_");
  const collapsed = normalized.replace(/_+/g, "_").replace(/^[_\.\-]+|[_\.\-]+$/g, "");
  if (!collapsed) {
    throw new Error("No fue posible resolver workspace desde email.");
  }
  return collapsed;
}

async function requireAuth(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    unauthorized(res, "Missing Bearer token");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getOauthJwks(), {
      issuer: OAUTH_ISSUER,
      audience: OAUTH_AUDIENCE
    });

    if (!hasRequiredScopes(payload.scope, OAUTH_REQUIRED_SCOPES)) {
      unauthorized(res, "Insufficient scope");
      return null;
    }

    const email = String(payload.email ?? "").trim();
    if (!email) {
      unauthorized(res, "Token without email claim");
      return null;
    }

    return { payload, email };
  } catch {
    unauthorized(res, "Invalid or expired OAuth token");
    return null;
  }
}

async function getWorkspaceForRequest(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;

  const workspaceName = normalizeWorkspaceNameFromEmail(auth.email);
  const workspaceRoot = path.resolve(WORKSPACES_ROOT, workspaceName);
  await fs.mkdir(workspaceRoot, { recursive: true });
  const workspaceRootReal = await fs.realpath(workspaceRoot);

  return {
    auth,
    workspaceName,
    workspaceRoot,
    workspaceRootReal,
    ownerKey: auth.email.toLowerCase()
  };
}

function normalizeRelativePath(relativePath, { allowWorkspaceRoot = false } = {}) {
  if (typeof relativePath !== "string") {
    throw new Error("relative_path requerido.");
  }

  const normalizedInput = relativePath.trim();
  if (!normalizedInput) {
    if (allowWorkspaceRoot) return ".";
    throw new Error("relative_path requerido.");
  }

  if (allowWorkspaceRoot && (normalizedInput === "." || normalizedInput === "./")) {
    return ".";
  }

  if (path.isAbsolute(normalizedInput)) {
    throw new Error("No se permiten rutas absolutas.");
  }

  const p = normalizedInput.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p === ".") {
    if (allowWorkspaceRoot) return ".";
    throw new Error("relative_path invalido.");
  }

  if (/^[a-zA-Z]+:/.test(p)) {
    throw new Error("No se permiten rutas absolutas.");
  }

  return p;
}

function ensureWithinRoot(candidatePath, rootPath) {
  const rootWithSep = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep;
  return candidatePath === rootPath || candidatePath.startsWith(rootWithSep);
}

function toPosixRelative(p) {
  return p.replace(/\\/g, "/");
}

function isProbablyText(buffer) {
  return !buffer.includes(0);
}

function createPathResolver(workspaceRoot, workspaceRootReal) {
  async function verifyNoSymlinkEscape(targetPath, { mustExist } = { mustExist: false }) {
    const resolvedTarget = path.resolve(targetPath);
    if (!ensureWithinRoot(resolvedTarget, workspaceRoot)) {
      throw new Error("Ruta fuera del workspace permitido.");
    }

    const targetExists = await fs.lstat(resolvedTarget).then(() => true).catch(() => false);

    if (targetExists) {
      const real = await fs.realpath(resolvedTarget);
      if (!ensureWithinRoot(real, workspaceRootReal)) {
        throw new Error("Symlink fuera del workspace permitido.");
      }
      return;
    }

    if (mustExist) {
      throw new Error("Path no existe.");
    }

    let current = path.dirname(resolvedTarget);
    while (true) {
      const exists = await fs.lstat(current).then(() => true).catch(() => false);
      if (exists) {
        const real = await fs.realpath(current);
        if (!ensureWithinRoot(real, workspaceRootReal)) {
          throw new Error("Symlink fuera del workspace permitido.");
        }
        return;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error("Ruta invalida.");
      }
      current = parent;
    }
  }

  return async function resolveSafePath(relativePath, options = {}) {
    const normalized = normalizeRelativePath(relativePath, options);
    if (normalized === ".") return workspaceRoot;

    const fullPath = path.resolve(workspaceRoot, normalized);
    await verifyNoSymlinkEscape(fullPath, { mustExist: false });
    return fullPath;
  };
}

async function walkFiles(dir, baseDir, options, results = []) {
  const { includeHidden = true, maxResults = 50_000, exclude = [".git", "node_modules"] } = options ?? {};
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= maxResults) break;
    if (!includeHidden && entry.name.startsWith(".")) continue;
    if (exclude.includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkFiles(fullPath, baseDir, options, results);
      continue;
    }

    if (entry.isFile()) {
      results.push(toPosixRelative(path.relative(baseDir, fullPath)));
    }
  }

  return results;
}

function registerTools(server, workspaceContext) {
  const { workspaceRoot, resolveSafePath } = workspaceContext;

  server.registerTool(
    "list_files",
    {
      title: "Listar archivos",
      description: "Lista archivos dentro del workspace permitido.",
      inputSchema: {
        relative_dir: z.string().optional().default("."),
        recursive: z.boolean().optional().default(true),
        include_hidden: z.boolean().optional().default(true),
        max_results: z.number().int().min(1).max(50_000).optional().default(20_000)
      },
      outputSchema: {
        files: z.array(z.string())
      }
    },
    async ({ relative_dir, recursive, include_hidden, max_results }) => {
      const dirPath = await resolveSafePath(relative_dir, { allowWorkspaceRoot: true });
      const st = await fs.stat(dirPath);
      if (!st.isDirectory()) {
        throw new Error("relative_dir debe ser un directorio.");
      }

      const files = recursive
        ? await walkFiles(dirPath, workspaceRoot, {
            includeHidden: include_hidden,
            maxResults: max_results
          })
        : (await fs.readdir(dirPath, { withFileTypes: true }))
            .filter((e) => e.isFile())
            .filter((e) => include_hidden || !e.name.startsWith("."))
            .map((e) => toPosixRelative(path.relative(workspaceRoot, path.join(dirPath, e.name))));

      return {
        content: [
          {
            type: "text",
            text: files.length ? files.join("\n") : "(sin archivos)"
          }
        ],
        structuredContent: {
          files
        }
      };
    }
  );

  server.registerTool(
    "read_file",
    {
      title: "Leer archivo",
      description: "Lee el contenido de un archivo dentro del workspace permitido.",
      inputSchema: {
        relative_path: z.string().min(1),
        encoding: z.enum(["auto", "utf8", "base64"]).optional().default("auto"),
        max_bytes: z.number().int().min(1).max(10_000_000).optional().default(MAX_INLINE_BYTES)
      },
      outputSchema: {
        relative_path: z.string(),
        encoding: z.enum(["utf8", "base64"]),
        bytes: z.number(),
        content: z.string()
      }
    },
    async ({ relative_path, encoding, max_bytes }) => {
      const fullPath = await resolveSafePath(relative_path);
      const data = await fs.readFile(fullPath);
      if (data.byteLength > max_bytes) {
        throw new Error(`Archivo demasiado grande para inline (${data.byteLength} bytes). Ajusta max_bytes.`);
      }

      let resolvedEncoding = encoding;
      if (encoding === "auto") {
        resolvedEncoding = isProbablyText(data) ? "utf8" : "base64";
      }

      const content = resolvedEncoding === "utf8" ? data.toString("utf8") : data.toString("base64");

      return {
        content: [
          {
            type: "text",
            text: resolvedEncoding === "utf8" ? content : `(base64) ${relative_path} (${data.byteLength} bytes)`
          }
        ],
        structuredContent: {
          relative_path,
          encoding: resolvedEncoding,
          bytes: data.byteLength,
          content
        }
      };
    }
  );

  server.registerTool(
    "write_file",
    {
      title: "Escribir archivo",
      description: "Crea o reemplaza el contenido de un archivo dentro del workspace permitido.",
      inputSchema: {
        relative_path: z.string().min(1),
        content: z.string(),
        encoding: z.enum(["utf8", "base64"]).optional().default("utf8"),
        create_dirs: z.boolean().optional().default(true)
      },
      outputSchema: {
        relative_path: z.string(),
        encoding: z.enum(["utf8", "base64"]),
        bytes_written: z.number()
      }
    },
    async ({ relative_path, content, encoding, create_dirs }) => {
      const fullPath = await resolveSafePath(relative_path);
      if (create_dirs) {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
      }
      const buf = encoding === "utf8" ? Buffer.from(content, "utf8") : Buffer.from(content, "base64");
      await fs.writeFile(fullPath, buf);

      return {
        content: [
          {
            type: "text",
            text: `Archivo guardado: ${relative_path}`
          }
        ],
        structuredContent: {
          relative_path,
          encoding,
          bytes_written: buf.byteLength
        }
      };
    }
  );

  server.registerTool(
    "delete_path",
    {
      title: "Borrar archivo o carpeta",
      description: "Borra un archivo o carpeta dentro del workspace permitido.",
      inputSchema: {
        relative_path: z.string().min(1),
        recursive: z.boolean().optional().default(false)
      },
      outputSchema: {
        relative_path: z.string(),
        deleted: z.boolean(),
        reason: z.string().optional()
      }
    },
    async ({ relative_path, recursive }) => {
      const fullPath = await resolveSafePath(relative_path);
      const st = await fs.stat(fullPath).catch(() => null);
      if (!st) {
        return {
          content: [{ type: "text", text: `No existe: ${relative_path}` }],
          structuredContent: { relative_path, deleted: false, reason: "not_found" }
        };
      }

      if (st.isDirectory()) {
        if (!recursive) {
          throw new Error("El path es un directorio. Usa recursive=true para borrarlo.");
        }
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }

      return {
        content: [{ type: "text", text: `Borrado: ${relative_path}` }],
        structuredContent: { relative_path, deleted: true }
      };
    }
  );

  server.registerTool(
    "make_dir",
    {
      title: "Crear directorio",
      description: "Crea un directorio dentro del workspace permitido.",
      inputSchema: {
        relative_dir: z.string().min(1),
        recursive: z.boolean().optional().default(true)
      },
      outputSchema: {
        relative_dir: z.string(),
        created: z.boolean()
      }
    },
    async ({ relative_dir, recursive }) => {
      const fullPath = await resolveSafePath(relative_dir);
      await fs.mkdir(fullPath, { recursive });
      return {
        content: [{ type: "text", text: `Directorio creado: ${relative_dir}` }],
        structuredContent: { relative_dir, created: true }
      };
    }
  );

  server.registerTool(
    "stat_path",
    {
      title: "Stat de path",
      description: "Devuelve metadata de un archivo/carpeta dentro del workspace permitido.",
      inputSchema: {
        relative_path: z.string().min(1)
      },
      outputSchema: {
        relative_path: z.string(),
        is_file: z.boolean(),
        is_dir: z.boolean(),
        size: z.number(),
        mtime: z.string()
      }
    },
    async ({ relative_path }) => {
      const fullPath = await resolveSafePath(relative_path);
      const st = await fs.stat(fullPath);
      const info = {
        relative_path,
        is_file: st.isFile(),
        is_dir: st.isDirectory(),
        size: st.size,
        mtime: st.mtime.toISOString()
      };
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
        structuredContent: info
      };
    }
  );

  server.registerTool(
    "search_files",
    {
      title: "Buscar archivos",
      description: "Busca por nombre (y opcionalmente contenido de texto) dentro del workspace permitido.",
      inputSchema: {
        query: z.string().min(1),
        relative_dir: z.string().optional().default("."),
        match: z.enum(["name", "name_or_content"]).optional().default("name"),
        case_sensitive: z.boolean().optional().default(false),
        max_results: z.number().int().min(1).max(10_000).optional().default(200)
      },
      outputSchema: {
        query: z.string(),
        results: z.array(
          z.object({
            relative_path: z.string(),
            preview: z.string().optional()
          })
        )
      }
    },
    async ({ query, relative_dir, match, case_sensitive, max_results }) => {
      const dirPath = await resolveSafePath(relative_dir, { allowWorkspaceRoot: true });
      const st = await fs.stat(dirPath);
      if (!st.isDirectory()) throw new Error("relative_dir debe ser un directorio.");

      const files = await walkFiles(dirPath, workspaceRoot, { maxResults: 50_000, includeHidden: true });
      const q = case_sensitive ? query : query.toLowerCase();

      const hits = [];
      for (const rel of files) {
        if (hits.length >= max_results) break;
        const nameHaystack = case_sensitive ? rel : rel.toLowerCase();
        let ok = nameHaystack.includes(q);
        let contentPreview;

        if (!ok && match === "name_or_content") {
          const p = await resolveSafePath(rel);
          const buf = await fs.readFile(p).catch(() => null);
          if (buf && buf.byteLength <= 200_000 && isProbablyText(buf)) {
            const txt = buf.toString("utf8");
            const hay = case_sensitive ? txt : txt.toLowerCase();
            ok = hay.includes(q);
            if (ok) {
              const idx = hay.indexOf(q);
              const start = Math.max(0, idx - 80);
              const end = Math.min(txt.length, idx + q.length + 80);
              contentPreview = txt.slice(start, end);
            }
          }
        }

        if (ok) hits.push({ relative_path: rel, preview: contentPreview });
      }

      return {
        content: [
          {
            type: "text",
            text: hits.length ? hits.map((h) => h.relative_path).join("\n") : "(sin resultados)"
          }
        ],
        structuredContent: { query, results: hits }
      };
    }
  );

  server.registerTool(
    "git_status",
    {
      title: "Estado Git",
      description: "Muestra el estado Git del workspace autenticado.",
      inputSchema: {},
      outputSchema: {
        branch: z.string(),
        status: z.string()
      }
    },
    async () => {
      const { stdout: shortStatus } = await execFileAsync("git", ["status", "--short"], {
        cwd: workspaceRoot
      });
      const { stdout: branch } = await execFileAsync("git", ["branch", "--show-current"], {
        cwd: workspaceRoot
      });

      const statusText = [`branch: ${branch.trim() || "(sin rama)"}`, "", shortStatus.trim() || "(working tree limpio)"].join("\n");

      return {
        content: [
          {
            type: "text",
            text: statusText
          }
        ],
        structuredContent: {
          branch: branch.trim(),
          status: shortStatus.trim()
        }
      };
    }
  );
}

function createMcpServer(workspaceContext) {
  const server = new McpServer({
    name: "mcp-oauth",
    version: "1.0.0"
  });
  registerTools(server, workspaceContext);
  return server;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mcp-oauth",
    host: HOST,
    port: PORT,
    workspacesRoot: WORKSPACES_ROOT,
    maxInlineBytes: MAX_INLINE_BYTES,
    oauthIssuer: OAUTH_ISSUER,
    time: new Date().toISOString()
  });
});

const sessions = new Map();

function getHeaderSessionId(req) {
  const value = req.headers["mcp-session-id"];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value.trim() : "";
}

function createSessionContext(workspaceInfo) {
  let initializedSessionId = "";
  const workspaceContext = {
    workspaceRoot: workspaceInfo.workspaceRoot,
    resolveSafePath: createPathResolver(workspaceInfo.workspaceRoot, workspaceInfo.workspaceRootReal)
  };
  const server = createMcpServer(workspaceContext);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      initializedSessionId = sessionId;
      sessions.set(sessionId, { server, transport, ownerKey: workspaceInfo.ownerKey, workspaceName: workspaceInfo.workspaceName });
    }
  });

  return {
    server,
    transport,
    ownerKey: workspaceInfo.ownerKey,
    getInitializedSessionId: () => initializedSessionId
  };
}

async function closeContext(context) {
  try {
    await context.transport.close();
  } finally {
    await context.server.close();
  }
}

async function handleMcpRequest(req, res, requestBody) {
  const workspaceInfo = await getWorkspaceForRequest(req, res);
  if (!workspaceInfo) return;

  const headerSessionId = getHeaderSessionId(req);
  const hasHeaderSession = Boolean(headerSessionId);
  let context = hasHeaderSession ? sessions.get(headerSessionId) : null;

  if (hasHeaderSession && !context) {
    res.status(404).json({
      error: "Session not found",
      message: "No active session matches mcp-session-id"
    });
    return;
  }

  if (context && context.ownerKey !== workspaceInfo.ownerKey) {
    unauthorized(res, "Session does not belong to authenticated user");
    return;
  }

  let isNewContext = false;
  if (!context) {
    context = createSessionContext(workspaceInfo);
    isNewContext = true;
    await context.server.connect(context.transport);
  }

  try {
    await context.transport.handleRequest(req, res, requestBody);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "MCP request failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  } finally {
    if (!hasHeaderSession && isNewContext) {
      const assignedSessionId = context.getInitializedSessionId();
      if (!assignedSessionId) {
        await closeContext(context);
      }
    }
  }
}

app.post("/mcp", async (req, res) => {
  await handleMcpRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  await handleMcpRequest(req, res, undefined);
});

app.delete("/mcp", async (req, res) => {
  const workspaceInfo = await getWorkspaceForRequest(req, res);
  if (!workspaceInfo) return;

  const sessionId = getHeaderSessionId(req);
  const context = sessionId ? sessions.get(sessionId) : null;

  if (!context || !sessionId) {
    res.status(404).json({
      error: "Session not found",
      message: "No active session matches mcp-session-id"
    });
    return;
  }

  if (context.ownerKey !== workspaceInfo.ownerKey) {
    unauthorized(res, "Session does not belong to authenticated user");
    return;
  }

  sessions.delete(sessionId);

  try {
    await context.transport.handleRequest(req, res, undefined);
  } finally {
    await closeContext(context);
  }
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: MCP_PUBLIC_URL,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: OAUTH_REQUIRED_SCOPES,
    bearer_methods_supported: ["header"]
  });
});

try {
  ensureAuthConfig();
} catch (error) {
  console.error("Invalid auth configuration:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

app.listen(PORT, HOST, async () => {
  await fs.mkdir(WORKSPACES_ROOT, { recursive: true });
  console.log(`mcp-oauth listening on http://${HOST}:${PORT}`);
  console.log(`MCP endpoint available at http://${HOST}:${PORT}/mcp`);
});
