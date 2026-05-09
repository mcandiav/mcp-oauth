import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: process.env.MCP_HTTP_JSON_LIMIT ?? "25mb" }));

const PORT = Number(process.env.PORT ?? process.env.MCP_PORT ?? 8787);
const HOST = process.env.MCP_HOST ?? "0.0.0.0";
const WORKSPACE_ROOT = path.resolve(process.env.MCP_WORKSPACE_ROOT ?? process.cwd());
const MAX_INLINE_BYTES = Number(process.env.MCP_MAX_INLINE_BYTES ?? 1_000_000);
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN?.trim() || "";

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

function resolveSafePath(relativePath, options = {}) {
  const normalized = normalizeRelativePath(relativePath, options);
  if (normalized === ".") return WORKSPACE_ROOT;

  const fullPath = path.resolve(WORKSPACE_ROOT, normalized);
  const rootWithSep = WORKSPACE_ROOT.endsWith(path.sep) ? WORKSPACE_ROOT : WORKSPACE_ROOT + path.sep;

  if (fullPath !== WORKSPACE_ROOT && !fullPath.startsWith(rootWithSep)) {
    throw new Error("Ruta fuera del workspace permitido.");
  }

  return fullPath;
}

function toPosixRelative(p) {
  return p.replace(/\\/g, "/");
}

function isProbablyText(buffer) {
  return !buffer.includes(0);
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

const server = new McpServer({
  name: "chatgpt-docs-mcp",
  version: "1.0.0"
});

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
    }
  },
  async ({ relative_dir, recursive, include_hidden, max_results }) => {
    const dirPath = resolveSafePath(relative_dir, { allowWorkspaceRoot: true });
    const st = await fs.stat(dirPath);
    if (!st.isDirectory()) {
      throw new Error("relative_dir debe ser un directorio.");
    }

    const files = recursive
      ? await walkFiles(dirPath, WORKSPACE_ROOT, {
          includeHidden: include_hidden,
          maxResults: max_results
        })
      : (await fs.readdir(dirPath, { withFileTypes: true }))
          .filter((e) => e.isFile())
          .filter((e) => include_hidden || !e.name.startsWith("."))
          .map((e) => toPosixRelative(path.relative(WORKSPACE_ROOT, path.join(dirPath, e.name))));

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
    }
  },
  async ({ relative_path, encoding, max_bytes }) => {
    const fullPath = resolveSafePath(relative_path);
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
    }
  },
  async ({ relative_path, content, encoding, create_dirs }) => {
    const fullPath = resolveSafePath(relative_path);
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
    }
  },
  async ({ relative_path, recursive }) => {
    const fullPath = resolveSafePath(relative_path);
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
    }
  },
  async ({ relative_dir, recursive }) => {
    const fullPath = resolveSafePath(relative_dir);
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
    }
  },
  async ({ relative_path }) => {
    const fullPath = resolveSafePath(relative_path);
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
    }
  },
  async ({ query, relative_dir, match, case_sensitive, max_results }) => {
    const dirPath = resolveSafePath(relative_dir, { allowWorkspaceRoot: true });
    const st = await fs.stat(dirPath);
    if (!st.isDirectory()) throw new Error("relative_dir debe ser un directorio.");

    const files = await walkFiles(dirPath, WORKSPACE_ROOT, { maxResults: 50_000, includeHidden: true });
    const q = case_sensitive ? query : query.toLowerCase();

    const hits = [];
    for (const rel of files) {
      if (hits.length >= max_results) break;
      const nameHaystack = case_sensitive ? rel : rel.toLowerCase();
      let ok = nameHaystack.includes(q);
      let contentPreview = undefined;

      if (!ok && match === "name_or_content") {
        const p = resolveSafePath(rel);
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
    description: "Muestra el estado Git del workspace de prueba.",
    inputSchema: {}
  },
  async () => {
    const { stdout: shortStatus } = await execFileAsync("git", ["status", "--short"], {
      cwd: WORKSPACE_ROOT
    });
    const { stdout: branch } = await execFileAsync("git", ["branch", "--show-current"], {
      cwd: WORKSPACE_ROOT
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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "chatgpt-docs-mcp",
    host: HOST,
    port: PORT,
    workspaceRoot: WORKSPACE_ROOT,
    maxInlineBytes: MAX_INLINE_BYTES,
    authEnabled: Boolean(MCP_AUTH_TOKEN),
    time: new Date().toISOString()
  });
});

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== "string") return null;
  const [scheme, token] = auth.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function requireAuth(req, res) {
  if (!MCP_AUTH_TOKEN) return true;

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing Bearer token"
    });
    return false;
  }

  if (token !== MCP_AUTH_TOKEN) {
    res.status(403).json({
      error: "Forbidden",
      message: "Invalid Bearer token"
    });
    return false;
  }

  return true;
}

const sessionTransports = new Map();

function getHeaderSessionId(req) {
  const value = req.headers["mcp-session-id"];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value.trim() : "";
}

function createTransport() {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true
  });
}

async function handleMcpRequest(req, res, requestBody) {
  if (!requireAuth(req, res)) return;

  try {
    const clientSessionId = getHeaderSessionId(req);
    const hasClientSession = Boolean(clientSessionId);

    let transport = hasClientSession ? sessionTransports.get(clientSessionId) : null;

    if (!transport) {
      transport = createTransport();
      await server.connect(transport);

      if (hasClientSession) {
        sessionTransports.set(clientSessionId, transport);
      }
    }

    await transport.handleRequest(req, res, requestBody);

    if (!hasClientSession) {
      res.on("close", () => {
        transport.close();
      });
    }
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "MCP request failed",
        message: error instanceof Error ? error.message : String(error)
      });
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
  if (!requireAuth(req, res)) return;

  const clientSessionId = getHeaderSessionId(req);
  const transport = clientSessionId ? sessionTransports.get(clientSessionId) : null;

  if (!transport || !clientSessionId) {
    res.status(404).json({
      error: "Session not found",
      message: "No active session matches mcp-session-id"
    });
    return;
  }

  sessionTransports.delete(clientSessionId);

  try {
    await transport.handleRequest(req, res, undefined);
  } finally {
    transport.close();
  }
});

app.listen(PORT, HOST, () => {
  console.log(`chatgpt-docs-mcp listening on http://${HOST}:${PORT}`);
  console.log(`MCP endpoint available at http://${HOST}:${PORT}/mcp`);
});
