# docs-mcp

Servidor MCP HTTP para exponer operaciones controladas de filesystem sobre un workspace documental montado en contenedor.

Este proyecto corresponde a la versión activa del servidor MCP documental dentro de MCPacer. Su objetivo es permitir que ChatGPT u otros agentes compatibles con MCP puedan listar, leer, buscar y administrar archivos dentro de un workspace permitido, sin exponer acceso fuera del directorio configurado.

## Bitácora de cambios

| Versión | Fecha | Cambio realizado | Motivo | Impacto | Sección afectada |
|---|---|---|---|---|---|
| V1.0 | 2026-05-09 | Se crea `README.md` oficial del proyecto `docs-mcp`. | Cumplir la convención documental del README raíz de MCPacer: todo proyecto activo debe tener documentación principal en su propia raíz. | El proyecto queda identificado como servidor MCP documental activo. | Documento completo |
| V1.1 | 2026-05-09 | Se registra la decisión de consolidar este proyecto como versión activa y mantener `obsoleto/doc-mcp` solo como referencia histórica. | Evitar mantener dos implementaciones activas del mismo servidor MCP documental. | La trazabilidad queda separada entre versión activa y versión obsoleta. | Decisiones vigentes / Trazabilidad |
| V1.2 | 2026-05-09 | Se documentan mejoras pendientes detectadas para compatibilidad con agentes IA y operación multisesión. | Alinear la implementación con el comportamiento esperado por ChatGPT y otros clientes MCP. | Quedan explícitos los criterios que el programador debe validar o implementar. | Mejoras pendientes |
| V1.3 | 2026-05-09 | Se registra como decisión futura publicar el proyecto en GitHub y desplegarlo desde repositorio en Docker Desktop y EasyPanel. | Definir el destino operativo del proyecto fuera del workspace MCPacer. | El proyecto deberá quedar preparado como repositorio autónomo, reproducible y desplegable. | Despliegue / Preparación para GitHub |
| V1.4 | 2026-05-09 | Se documenta soporte esperado de variables `PORT/MCP_PORT/MCP_HOST`, autenticación Bearer opcional con `MCP_AUTH_TOKEN` y compatibilidad de raíz en navegación. | Cerrar brechas funcionales críticas detectadas en la revisión técnica. | El servidor queda mejor especificado para clientes MCP y exposición controlada. | Estado actual / Variables / Seguridad |
| V1.5 | 2026-05-09 | Se registra el error real de multisesión `Already connected to a transport` y la corrección obligatoria que debe aplicar programación antes de subir a GitHub. | El endpoint `/health` respondía, pero `/mcp` fallaba al reutilizar una instancia global de `McpServer` con múltiples transports. | La versión de GitHub debe corregirse para crear un `McpServer` por sesión o request antes de considerarse oficial. | Multisesión / Publicación GitHub / Validación |
| V1.6 | 2026-05-09 | Se agrega la decisión de incluir un archivo de variables por defecto seguro para despliegue local y EasyPanel. | Facilitar instalación desde GitHub sin obligar a inventar parámetros ni versionar secretos reales. | Programación debe agregar `.env.example` o `.env.default` con valores seguros y mantener `.env` fuera de Git. | Variables / GitHub / Docker Desktop / EasyPanel |

## 1. Objetivo funcional

`docs-mcp` expone un servidor MCP por HTTP para operar sobre archivos de documentación dentro de un workspace controlado.

El servidor está pensado para:

- listar archivos del workspace;
- leer archivos de texto o binarios en base64 cuando corresponda;
- buscar archivos por nombre y opcionalmente por contenido;
- crear o reemplazar archivos cuando el agente tenga autorización operativa;
- crear directorios;
- eliminar archivos o carpetas cuando corresponda;
- obtener metadata de archivos o directorios;
- consultar estado Git del workspace cuando `git` esté disponible en el contenedor.

El caso de uso principal es exponer documentación interna a ChatGPT mediante MCP, manteniendo el acceso limitado al directorio configurado como workspace.

## 2. Stack y plataforma principal

| Elemento | Definición |
|---|---|
| Runtime | Node.js |
| Framework HTTP | Express |
| Protocolo | Model Context Protocol vía Streamable HTTP |
| SDK MCP | `@modelcontextprotocol/sdk` |
| Validación de entradas | `zod` |
| Empaquetado | Docker |
| Orquestación local | Docker Compose |
| Plataforma prevista | EasyPanel o cualquier host Docker compatible |
| Endpoint MCP | `/mcp` |
| Endpoint de salud | `/health` |

## 3. Decisiones vigentes

### 3.1 Proyecto activo

`docs-mcp` es el proyecto activo para el servidor MCP documental dentro de MCPacer.

La versión anterior ubicada en `obsoleto/doc-mcp` debe conservarse solo como trazabilidad histórica y referencia técnica. No debe mantenerse como implementación activa paralela.

### 3.2 Nombre funcional

El proyecto activo se documenta como `docs-mcp` porque ese es el nombre actual del directorio activo en MCPacer.

Si se decide cambiar el nombre final a `mcp-doc`, debe actualizarse de forma consistente:

- nombre del directorio;
- `package.json`;
- nombre del servidor MCP;
- mensajes de log;
- documentación;
- configuración de despliegue.

### 3.3 Base técnica esperada

La base técnica oficial debe ser la implementación que incorpore la corrección de manejo multisesión del conector.

El archivo `docs-mcp/server.mjs` debe ser corregido por programación para asegurar que no reutiliza una instancia global de `McpServer` con más de un transporte.

No se debe publicar una versión oficial en GitHub que vuelva al problema de sesiones simultáneas.

### 3.4 Una sola versión activa

No deben coexistir dos servidores MCP documentales activos con el mismo propósito.

La regla vigente es:

- activo: `docs-mcp/`;
- histórico u obsoleto: `obsoleto/doc-mcp/`.

### 3.5 Publicación y despliegue desde GitHub

El proyecto deberá quedar preparado para publicarse como repositorio en GitHub y desplegarse desde esa fuente tanto en Docker Desktop como en EasyPanel.

La decisión vigente es que MCPacer funcione como workspace documental y de desarrollo, pero no como fuente productiva definitiva del servidor. La fuente oficial de despliegue deberá ser el repositorio GitHub del proyecto.

El repositorio debe permitir:

- clonar el proyecto y levantarlo localmente con Docker Desktop usando Docker Compose;
- desplegarlo en EasyPanel desde GitHub usando el `Dockerfile`;
- montar un volumen externo como workspace documental en `/workspace`;
- definir variables de entorno sin guardar secretos en Git;
- mantener una sola versión oficial del servidor MCP documental.

### 3.6 Corrección obligatoria antes de llevar a GitHub

Antes de subir o actualizar la versión oficial en GitHub, programación debe corregir el error de multisesión detectado durante la prueba local.

Error observado al probar `POST /mcp` con `initialize`:

```text
Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.
```

Conclusión técnica:

- `/health` funcionaba correctamente;
- el túnel público respondía correctamente;
- la autenticación ya no bloqueaba;
- el fallo estaba en `/mcp`;
- la causa era reutilizar una instancia global de `McpServer` y ejecutar `server.connect(transport)` más de una vez con distintos transports.

La versión de GitHub debe contener la corrección indicada en la sección 9 antes de considerarse lista para despliegue.

### 3.7 Archivo de entorno por defecto

Programación debe agregar al repositorio un archivo de entorno por defecto seguro para facilitar despliegue desde GitHub.

La decisión recomendada es versionar un archivo:

```text
.env.example
```

o, si se quiere un nombre más explícito para Docker/EasyPanel:

```text
.env.default
```

No se debe versionar un `.env` real con secretos. El archivo `.env` local debe quedar excluido por `.gitignore`.

El archivo por defecto debe servir como plantilla para Docker Desktop y EasyPanel, con valores no sensibles y con `MCP_AUTH_TOKEN` comentado para que no se publique un secreto falso ni real.

## 4. Tools MCP consideradas

El servidor debe exponer las siguientes tools:

| Tool | Propósito | Tipo de operación |
|---|---|---|
| `list_files` | Lista archivos dentro del workspace permitido. | Lectura |
| `read_file` | Lee el contenido de un archivo. | Lectura |
| `write_file` | Crea o reemplaza un archivo. | Escritura |
| `delete_path` | Borra un archivo o carpeta. | Destructiva |
| `make_dir` | Crea un directorio. | Escritura |
| `stat_path` | Devuelve metadata de archivo o carpeta. | Lectura |
| `search_files` | Busca archivos por nombre o contenido. | Lectura |
| `git_status` | Muestra estado Git del workspace. | Lectura |

## 5. Seguridad y restricciones

El servidor debe mantener estas restricciones:

1. Todas las rutas deben resolverse dentro del workspace configurado.
2. No se deben permitir rutas absolutas.
3. No se debe permitir traversal fuera del workspace.
4. Las operaciones destructivas deben estar claramente identificadas por la tool.
5. Si se expone fuera de una red privada, debe usarse autenticación Bearer mediante `MCP_AUTH_TOKEN` o una protección equivalente en el reverse proxy.
6. Los secretos, tokens, llaves privadas y certificados no deben versionarse.
7. El archivo `.env` local debe estar en `.gitignore`.
8. El repositorio solo debe incluir `.env.example` o `.env.default` sin secretos reales.

## 6. Variables de entorno esperadas

| Variable | Uso esperado |
|---|---|
| `PORT` | Puerto HTTP del servicio. |
| `MCP_PORT` | Alternativa para definir el puerto HTTP. |
| `MCP_HOST` | Host de escucha, normalmente `0.0.0.0` dentro de contenedor. |
| `MCP_WORKSPACE_ROOT` | Ruta raíz del workspace documental expuesto. |
| `MCP_MAX_INLINE_BYTES` | Tamaño máximo para devolver archivos inline. |
| `MCP_HTTP_JSON_LIMIT` | Límite del body JSON recibido por Express. |
| `MCP_AUTH_TOKEN` | Token Bearer requerido para proteger `/mcp`, si se habilita. |

Criterio esperado:

- `MCP_AUTH_TOKEN` definido con valor debe exigir `Authorization: Bearer <token>` en `/mcp`;
- `MCP_AUTH_TOKEN` omitido, comentado o vacío no debe exigir token;
- los cambios de `.env` requieren recrear el contenedor, no solo `docker compose restart`.

### 6.1 Plantilla de entorno por defecto

Programación debe agregar una plantilla de entorno al repositorio.

Contenido recomendado para `.env.example` o `.env.default`:

```env
PORT=8787
MCP_PORT=8787
MCP_HOST=0.0.0.0
MCP_WORKSPACE_ROOT=/workspace
MCP_MAX_INLINE_BYTES=1000000
MCP_HTTP_JSON_LIMIT=25mb
# MCP_AUTH_TOKEN=change-me-only-if-exposing-publicly
```

Reglas:

1. `MCP_AUTH_TOKEN` debe quedar comentado por defecto.
2. Para exposición pública, el operador debe definir un token real fuera del repositorio.
3. El `.env` real local no debe subirse a GitHub.
4. Docker Desktop puede usar una copia local de esta plantilla como `.env`.
5. EasyPanel debe configurar estas variables desde su panel de variables o secretos, no desde un `.env` con secretos versionado.

## 7. Despliegue

El proyecto puede levantarse tanto en EasyPanel como con Docker Compose.

EasyPanel se considera una plataforma operativa conveniente para manejar dominio, proxy, variables de entorno, volumen persistente y despliegue desde repositorio.

Docker Compose también es válido porque el servidor es una aplicación Node.js empaquetada en contenedor. En ese caso, el operador debe administrar manualmente:

- puerto publicado;
- volumen montado como workspace;
- token de autenticación;
- proxy o TLS si queda expuesto por dominio;
- política de reinicio;
- respaldo del volumen documental.

### 7.1 Preparación para GitHub, Docker Desktop y EasyPanel

La estructura mínima esperada para publicar el proyecto como repositorio autónomo es:

```text
docs-mcp/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.mjs
├── .dockerignore
├── .gitignore
├── .env.example
└── .env.default (opcional si se usa además de .env.example)
```

Archivos ya considerados en el proyecto activo:

```text
docs-mcp/.dockerignore
docs-mcp/Dockerfile
docs-mcp/docker-compose.yml
docs-mcp/package.json
docs-mcp/server.mjs
docs-mcp/README.md
```

Archivos requeridos antes de publicar en GitHub:

```text
docs-mcp/.gitignore
docs-mcp/.env.example
```

Archivo opcional:

```text
docs-mcp/.env.default
```

Antes de subir el proyecto a GitHub y usarlo como fuente de despliegue, se debe validar:

1. que `server.mjs` tenga la corrección multisesión descrita en la sección 9;
2. que `list_files` acepte raíz como `.`, `./`, omitida y cadena vacía;
3. que `Dockerfile` construya correctamente;
4. que `docker-compose.yml` monte el workspace externo en `/workspace`;
5. que no existan secretos versionados dentro del proyecto;
6. que `package.json` use el nombre oficial final;
7. que EasyPanel pueda construir desde GitHub usando el `Dockerfile`;
8. que Docker Desktop pueda levantar el servicio localmente usando Docker Compose;
9. que `POST /mcp` con `initialize` no devuelva `Already connected to a transport`;
10. que ChatGPT pueda listar archivos mediante el conector MCP;
11. que exista `.gitignore` excluyendo `.env`;
12. que exista `.env.example` o `.env.default` con valores seguros por defecto.

## 8. Compatibilidad de raíz para agentes IA

El servidor debe aceptar como raíz del workspace cualquiera de las siguientes variantes al usar `list_files` o herramientas equivalentes de navegación:

```text
relative_dir omitido
relative_dir = "."
relative_dir = "./"
relative_dir = ""
```

Todas esas variantes deben resolverse internamente como la raíz configurada en `MCP_WORKSPACE_ROOT`.

El objetivo es evitar que ChatGPT, Claude, Cursor, Codex u otros agentes fallen al listar el workspace cuando usan distintos defaults para representar el directorio raíz.

Esta compatibilidad no debe relajar la seguridad: rutas absolutas, rutas fuera del workspace e intentos de traversal deben seguir siendo rechazados.

## 9. Corrección obligatoria: multisesión y transporte MCP

La versión oficial debe corregir el manejo multisesión del endpoint `/mcp`.

### 9.1 Error detectado

Durante la prueba local, el servicio respondía correctamente a:

```text
GET /health
```

pero fallaba al probar:

```text
POST /mcp
method: initialize
```

con el error:

```text
Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.
```

### 9.2 Causa

La causa es una arquitectura incorrecta en `server.mjs`:

```js
const server = new McpServer(...)
```

creado como instancia global, y luego reutilizado con:

```js
await server.connect(transport)
```

para más de un transporte.

El SDK MCP no permite reconectar la misma instancia de `McpServer` a distintos transports. Cada sesión o request stateless debe usar su propia instancia de servidor/protocolo.

### 9.3 Corrección requerida

Programación debe refactorizar `server.mjs` con este criterio:

1. Mover el registro de tools a una función `registerTools(server)`.
2. Crear una función `createMcpServer()` que instancie un nuevo `McpServer` y registre las tools.
3. No mantener un `McpServer` global conectado.
4. Mantener un mapa de sesiones con objetos `{ server, transport }`, no solo `transport`.
5. Para requests con `mcp-session-id`, reutilizar el par `{ server, transport }` de esa sesión.
6. Para `initialize` sin sesión, crear un nuevo contexto de sesión.
7. Para requests stateless sin sesión, crear un `McpServer` nuevo y cerrar el transporte al terminar.
8. En `DELETE /mcp`, cerrar el transporte y eliminar la sesión del mapa.

Estructura esperada:

```js
function registerTools(server) {
  server.registerTool(...);
  // resto de tools
}

function createMcpServer() {
  const server = new McpServer({
    name: "chatgpt-docs-mcp",
    version: "1.0.0"
  });

  registerTools(server);
  return server;
}

const sessions = new Map();

function createSessionContext() {
  let transport;
  const server = createMcpServer();

  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { server, transport });
    }
  });

  return { server, transport };
}

function createStatelessContext() {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  return { server, transport };
}
```

### 9.4 Validación obligatoria

Después de corregir `server.mjs`, programación debe validar:

1. reconstruir y recrear el contenedor;
2. confirmar que `GET /health` responde `ok: true`;
3. confirmar que `POST /mcp` con `initialize` no devuelve `Already connected to a transport`;
4. confirmar que el conector ChatGPT puede ejecutar `list_files`;
5. confirmar que al listar un workspace vacío devuelve `{ files: [] }` y no error 502;
6. confirmar que al agregar archivos al volumen `/workspace`, `list_files` los muestra;
7. confirmar que el comportamiento se mantiene detrás de Cloudflare Tunnel y no solo en `localhost`.

## 10. Esquema de salida recomendado

Las tools deben devolver salida legible en `content` y salida estructurada en `structuredContent`.

Criterio esperado por tool:

| Tool | `structuredContent` esperado |
|---|---|
| `list_files` | `{ files }` |
| `read_file` | `{ relative_path, encoding, bytes, content }` |
| `write_file` | `{ relative_path, encoding, bytes_written }` |
| `delete_path` | `{ relative_path, deleted, reason? }` |
| `make_dir` | `{ relative_dir, created }` |
| `stat_path` | `{ relative_path, is_file, is_dir, size, mtime }` |
| `search_files` | `{ query, results }` |
| `git_status` | `{ branch, status }` |

Este criterio facilita que los clientes MCP y agentes IA interpreten la salida sin depender solo del texto plano.

## 11. Documentos y archivos relevantes

| Archivo | Uso |
|---|---|
| `README.md` | Documento oficial del proyecto activo. |
| `server.mjs` | Implementación del servidor MCP HTTP. |
| `package.json` | Metadata, dependencias y script de arranque. |
| `Dockerfile` | Imagen del servicio. |
| `docker-compose.yml` | Ejecución local o en host Docker. |
| `.dockerignore` | Exclusiones de build Docker. |
| `.gitignore` | Debe excluir `.env`, `node_modules`, logs y artefactos temporales. |
| `.env.example` | Plantilla de variables sin secretos reales. |
| `.env.default` | Plantilla opcional equivalente a `.env.example` si se prefiere ese nombre. |
| `.env` | Archivo local real. No debe versionarse. |
| `obsoleto/doc-mcp/README.md` | Referencia histórica de la versión anterior. |

## 12. Estado actual

Estado documental: actualizado con el error real detectado en `/mcp`, la corrección que debe aplicar programación y la obligación de agregar una plantilla de entorno por defecto.

Estado funcional esperado antes de llevar a GitHub: pendiente de que programación incorpore la corrección multisesión en `server.mjs`, agregue `.gitignore`, agregue `.env.example` o `.env.default`, reconstruya la imagen y valide el conector.

Puntos que deben revisarse antes de considerar cerrada la consolidación:

1. Confirmar que `server.mjs` crea un `McpServer` nuevo por sesión o request.
2. Confirmar que ya no existe una instancia global conectada a múltiples transports.
3. Confirmar que `POST /mcp` con `initialize` no devuelve `Already connected to a transport`.
4. Confirmar que ChatGPT puede ejecutar `list_files` sin error 502.
5. Confirmar que `package.json` y el nombre del servidor MCP reflejan el nombre oficial final.
6. Confirmar que `obsoleto/doc-mcp` queda solo como trazabilidad histórica.
7. Preparar `.gitignore` antes de publicar en GitHub.
8. Agregar `.env.example` o `.env.default` con valores seguros por defecto.
9. Confirmar que `.env` queda excluido de Git.
10. Validar despliegue desde GitHub en Docker Desktop y EasyPanel.
11. Subir la corrección a GitHub solo después de validar localmente y por túnel.
