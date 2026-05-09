# docs-mcp

Servidor MCP HTTP para exponer operaciones controladas de filesystem sobre un workspace documental montado en contenedor.

Este `README.md` es el **instructivo técnico de implementación del proyecto `docs-mcp`**. Debe ser usado por programación para construir, configurar, desplegar y validar este servidor MCP.

El `README.md` ubicado en la raíz del workspace MCPacer cumple otra función: es el **índice general del workspace/proyectos**. No reemplaza este instructivo del proyecto.

## Bitácora de cambios

| Versión | Fecha | Cambio realizado | Motivo | Impacto | Sección afectada |
|---|---|---|---|---|---|
| V1.0 | 2026-05-09 | Se crea `README.md` oficial del proyecto `docs-mcp`. | Cumplir la convención documental del README raíz de MCPacer. | El proyecto queda identificado como servidor MCP documental activo. | Documento completo |
| V1.1 | 2026-05-09 | Se registra la decisión de consolidar este proyecto como versión activa y mantener `obsoleto/doc-mcp` solo como referencia histórica. | Evitar mantener dos implementaciones activas del mismo servidor MCP documental. | La trazabilidad queda separada entre versión activa y versión obsoleta. | Decisiones vigentes / Trazabilidad |
| V1.2 | 2026-05-09 | Se documentan mejoras necesarias para compatibilidad con agentes IA y operación multisesión. | Alinear la implementación con el comportamiento esperado por ChatGPT y otros clientes MCP. | Quedan explícitos los criterios que el programador debe validar o implementar. | Compatibilidad / Multisesión |
| V1.3 | 2026-05-09 | Se registra como decisión publicar el proyecto en GitHub y desplegarlo desde repositorio en Docker Desktop y EasyPanel. | Definir el destino operativo del proyecto fuera del workspace MCPacer. | El proyecto debe quedar preparado como repositorio autónomo, reproducible y desplegable. | Despliegue / GitHub |
| V1.4 | 2026-05-09 | Se documenta soporte esperado de variables `PORT/MCP_PORT/MCP_HOST`, autenticación Bearer opcional con `MCP_AUTH_TOKEN` y compatibilidad de raíz en navegación. | Cerrar brechas funcionales detectadas en revisión técnica. | El servidor queda mejor especificado para clientes MCP y exposición controlada. | Variables / Seguridad |
| V1.5 | 2026-05-09 | Se registra el error real de multisesión `Already connected to a transport` y la corrección obligatoria que debe aplicar programación antes de subir a GitHub. | `/health` respondía, pero `/mcp` fallaba al reutilizar una instancia global de `McpServer` con múltiples transports. | La versión de GitHub debe corregirse para crear un `McpServer` por sesión o request antes de considerarse oficial. | Multisesión / Validación |
| V1.6 | 2026-05-09 | Se agrega la decisión de incluir un archivo de variables por defecto seguro para despliegue local y EasyPanel. | Facilitar instalación desde GitHub sin inventar parámetros ni versionar secretos reales. | Programación debe agregar `.env.example` o `.env.default` y mantener `.env` fuera de Git. | Variables / GitHub |
| V1.7 | 2026-05-09 | Se documenta configuración oficial esperada para `docker-compose.yml` y `.env`, parametrizando puertos y volumen desde variables. | El compose probado no inyectaba `.env` al contenedor y dejaba `workspaceRoot` en `/app`; además no debía hardcodear `ports` ni `volumes`. | Programación debe corregir `docker-compose.yml`, `.env.example` y validación de despliegue para que Docker Desktop y EasyPanel funcionen de forma reproducible. | Docker Compose / `.env` / Despliegue |
| V1.8 | 2026-05-09 | Se elimina el hardcode de `/workspace` en el destino del volumen y se agrega `MCP_WORKSPACE_CONTAINER_PATH`. | Permitir que el operador cambie el nombre/ruta interna del workspace si lo necesita. | `docker-compose.yml` debe parametrizar tanto la ruta host como la ruta interna del contenedor, y `MCP_WORKSPACE_ROOT` debe coincidir con esa ruta interna. | Docker Compose / Volumen / `.env` |
| V1.9 | 2026-05-09 | Se define autenticación configurable por `.env` con modos `oauth`, `api_key` y `none`. | Permitir instalar el mismo MCP en cuentas ChatGPT Plus con OAuth y en cuentas Empresa con token/API key, sin mantener dos códigos distintos. | Programación debe implementar middleware de autenticación por modo, metadata OAuth cuando corresponda y plantilla `.env.example` actualizada. | Seguridad / Autenticación / `.env` |

## 1. Objetivo funcional

`docs-mcp` expone un servidor MCP por HTTP para operar sobre archivos de documentación dentro de un workspace controlado.

El servidor está pensado para listar, leer, buscar, crear, reemplazar, borrar y consultar metadata de archivos dentro del workspace permitido. El caso de uso principal es exponer documentación interna a ChatGPT mediante MCP, manteniendo el acceso limitado al directorio configurado.

## 2. Alcance de este README

Este archivo es el instructivo operativo y técnico del proyecto `docs-mcp`.

Debe indicar al programador:

1. cómo debe quedar implementado el servidor;
2. qué variables debe leer desde `.env`;
3. cómo debe resolver autenticación;
4. cómo debe proteger el workspace;
5. cómo debe empaquetarse en Docker;
6. cómo debe validarse en ChatGPT, Docker Desktop y EasyPanel.

El `README.md` de la raíz del workspace MCPacer debe mantenerse como índice general de proyectos y no como manual de implementación de este servidor.

## 3. Stack y plataforma principal

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
| Endpoint OAuth Protected Resource Metadata | `/.well-known/oauth-protected-resource` cuando `MCP_AUTH_MODE=oauth` |

## 4. Decisiones vigentes

### 4.1 Proyecto activo

`docs-mcp` es el proyecto activo para el servidor MCP documental dentro de MCPacer. La versión anterior ubicada en `obsoleto/doc-mcp` debe conservarse solo como trazabilidad histórica y referencia técnica.

### 4.2 Una sola versión activa

No deben coexistir dos servidores MCP documentales activos con el mismo propósito.

Regla vigente:

- activo: `docs-mcp/`;
- histórico u obsoleto: `obsoleto/doc-mcp/`.

### 4.3 Una sola base de código para autenticación

No deben existir ramas o copias separadas del servidor para OAuth, token o sin autenticación.

La autenticación debe definirse exclusivamente por variables de entorno:

```env
MCP_AUTH_MODE=oauth
# o
MCP_AUTH_MODE=api_key
# o
MCP_AUTH_MODE=none
```

## 5. Tools MCP consideradas

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

## 6. Seguridad y restricciones

1. Todas las rutas deben resolverse dentro del workspace configurado.
2. No se deben permitir rutas absolutas.
3. No se debe permitir traversal fuera del workspace.
4. Las operaciones destructivas deben estar claramente identificadas por la tool.
5. Los secretos, tokens, llaves privadas y certificados no deben versionarse.
6. El archivo `.env` local debe estar en `.gitignore`.
7. El repositorio solo debe incluir `.env.example` o `.env.default` sin secretos reales.
8. Los tokens no deben aceptarse por query string.
9. Toda autenticación debe recibirse por header HTTP `Authorization`.
10. Si el servicio queda expuesto públicamente, no debe usarse `MCP_AUTH_MODE=none`.

## 7. Autenticación configurable por `.env`

### 7.1 Modos soportados

| Modo | Variable | Uso | Selección en ChatGPT |
|---|---|---|---|
| OAuth | `MCP_AUTH_MODE=oauth` | Clientes ChatGPT Plus o instalaciones que no muestran token manual. | `OAuth` |
| API key / token | `MCP_AUTH_MODE=api_key` | Cuentas Empresa/Business donde ChatGPT muestra `Token de acceso / clave de API`. | `Token de acceso / clave de API` |
| Sin autenticación | `MCP_AUTH_MODE=none` | Pruebas locales o entornos cerrados. No usar expuesto a Internet. | `Sin autenticación` |

### 7.2 Regla principal

La opción elegida en ChatGPT debe coincidir con `MCP_AUTH_MODE`.

Ejemplos:

```text
ChatGPT Plus con OAuth -> MCP_AUTH_MODE=oauth
ChatGPT Empresa con Token/API key -> MCP_AUTH_MODE=api_key
Prueba local cerrada -> MCP_AUTH_MODE=none
```

### 7.3 Modo `api_key`

Cuando `MCP_AUTH_MODE=api_key`, el servidor debe exigir:

```http
Authorization: Bearer <MCP_API_KEY>
```

Variables requeridas:

```env
MCP_AUTH_MODE=api_key
MCP_API_KEY=change-me-with-a-long-random-secret
```

Criterios de implementación:

1. Si falta `Authorization`, responder `401`.
2. Si el header no empieza con `Bearer `, responder `401`.
3. Si el token no coincide con `MCP_API_KEY`, responder `401`.
4. Si `MCP_API_KEY` está vacío, no permitir arrancar en modo `api_key`.
5. No aceptar token por query string.
6. No registrar el token completo en logs.

### 7.4 Modo `oauth`

Cuando `MCP_AUTH_MODE=oauth`, el servidor MCP debe actuar como resource server y validar:

```http
Authorization: Bearer <access_token>
```

Variables mínimas requeridas:

```env
MCP_AUTH_MODE=oauth
MCP_PUBLIC_URL=https://mcp.cliente.com/mcp
OAUTH_ISSUER=https://auth.cliente.com
OAUTH_AUDIENCE=https://mcp.cliente.com/mcp
OAUTH_JWKS_URL=https://auth.cliente.com/.well-known/jwks.json
OAUTH_REQUIRED_SCOPES=mcp:read,mcp:write
```

Criterios de implementación:

1. Validar firma del JWT contra JWKS.
2. Validar `issuer` contra `OAUTH_ISSUER`.
3. Validar `audience` o `resource` contra `OAUTH_AUDIENCE`.
4. Validar expiración.
5. Validar scopes requeridos.
6. Responder `401` si falta token, está vencido, tiene firma inválida o no tiene permisos.
7. Publicar metadata de recurso protegido en `/.well-known/oauth-protected-resource`.
8. No implementar OAuth casero si puede usarse un proveedor como Keycloak, Auth0, Clerk, WorkOS, Entra ID u otro Authorization Server compatible.

### 7.5 Metadata OAuth requerida

Cuando `MCP_AUTH_MODE=oauth`, el servidor debe exponer:

```text
GET /.well-known/oauth-protected-resource
```

Respuesta esperada:

```json
{
  "resource": "https://mcp.cliente.com/mcp",
  "authorization_servers": [
    "https://auth.cliente.com"
  ],
  "scopes_supported": [
    "mcp:read",
    "mcp:write"
  ],
  "bearer_methods_supported": [
    "header"
  ]
}
```

Si falta token en modo OAuth, el servidor debe responder `401` e indicar la metadata del recurso:

```http
WWW-Authenticate: Bearer resource_metadata="https://mcp.cliente.com/.well-known/oauth-protected-resource"
```

### 7.6 Modo `none`

Cuando `MCP_AUTH_MODE=none`, el servidor no debe exigir autenticación.

Uso permitido:

1. prueba local;
2. red privada;
3. túnel temporal controlado;
4. workspace sin información sensible.

Uso prohibido:

1. exposición pública permanente;
2. datos de clientes;
3. producción;
4. workspace con secretos, certificados, tokens, backups o datos personales.

## 8. Variables de entorno esperadas

| Variable | Uso esperado |
|---|---|
| `MCP_CONTAINER_NAME` | Nombre del contenedor creado por Docker Compose. |
| `MCP_BIND_ADDRESS` | IP del host donde Docker publicará el puerto. En local se recomienda `127.0.0.1`. |
| `MCP_HOST_PORT` | Puerto expuesto en el host Windows/Linux/macOS. |
| `MCP_CONTAINER_PORT` | Puerto interno expuesto por el contenedor. |
| `PORT` | Puerto HTTP usado por la app Node. |
| `MCP_PORT` | Alternativa para definir el puerto HTTP usado por la app Node. |
| `MCP_HOST` | Host de escucha dentro del contenedor, normalmente `0.0.0.0`. |
| `MCP_PUBLIC_URL` | URL pública completa del endpoint MCP, ejemplo `https://mcp.cliente.com/mcp`. |
| `MCP_WORKSPACE_HOST_PATH` | Ruta real del host que Docker monta como volumen. Ejemplo Windows: `D:/MCP/workspace`. |
| `MCP_WORKSPACE_CONTAINER_PATH` | Ruta interna del contenedor donde Docker monta el workspace. Ejemplo: `/workspace`, `/docs`, `/data/docs`. |
| `MCP_WORKSPACE_ROOT` | Ruta interna que lee la app Node. Debe coincidir con `MCP_WORKSPACE_CONTAINER_PATH`. |
| `MCP_MAX_INLINE_BYTES` | Tamaño máximo para devolver archivos inline. |
| `MCP_HTTP_JSON_LIMIT` | Límite del body JSON recibido por Express. |
| `MCP_AUTH_MODE` | Modo de autenticación: `oauth`, `api_key` o `none`. |
| `MCP_API_KEY` | Token estático requerido cuando `MCP_AUTH_MODE=api_key`. |
| `OAUTH_ISSUER` | Issuer esperado del Authorization Server cuando `MCP_AUTH_MODE=oauth`. |
| `OAUTH_AUDIENCE` | Audience/resource esperado para el access token OAuth. |
| `OAUTH_JWKS_URL` | URL JWKS para validar firma JWT. |
| `OAUTH_REQUIRED_SCOPES` | Lista separada por comas de scopes requeridos. |

Variables obsoletas o transitorias:

| Variable | Estado |
|---|---|
| `MCP_AUTH_TOKEN` | Debe migrarse a `MCP_API_KEY` + `MCP_AUTH_MODE=api_key`. Puede mantenerse temporalmente como alias retrocompatible, pero no debe ser la variable principal nueva. |

## 9. `.env.example` requerido

El repositorio debe incluir una plantilla versionable sin secretos reales.

```env
MCP_CONTAINER_NAME=docs-mcp

MCP_BIND_ADDRESS=127.0.0.1
MCP_HOST_PORT=8787
MCP_CONTAINER_PORT=8787

PORT=8787
MCP_PORT=8787
MCP_HOST=0.0.0.0
MCP_PUBLIC_URL=http://localhost:8787/mcp

MCP_WORKSPACE_HOST_PATH=D:/MCP/workspace
MCP_WORKSPACE_CONTAINER_PATH=/workspace
MCP_WORKSPACE_ROOT=/workspace

MCP_MAX_INLINE_BYTES=1000000
MCP_HTTP_JSON_LIMIT=25mb

# Auth modes: oauth | api_key | none
MCP_AUTH_MODE=none

# Required only when MCP_AUTH_MODE=api_key
# MCP_API_KEY=change-me-with-a-long-random-secret

# Required only when MCP_AUTH_MODE=oauth
# OAUTH_ISSUER=https://auth.example.com
# OAUTH_AUDIENCE=https://mcp.example.com/mcp
# OAUTH_JWKS_URL=https://auth.example.com/.well-known/jwks.json
# OAUTH_REQUIRED_SCOPES=mcp:read,mcp:write
```

## 10. Configuración oficial requerida para Docker Compose

### 10.1 `docker-compose.yml` oficial

```yaml
services:
  docs-mcp:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${MCP_CONTAINER_NAME:-docs-mcp}
    env_file:
      - .env
    ports:
      - "${MCP_BIND_ADDRESS:-127.0.0.1}:${MCP_HOST_PORT:-8787}:${MCP_CONTAINER_PORT:-8787}"
    volumes:
      - "${MCP_WORKSPACE_HOST_PATH}:${MCP_WORKSPACE_CONTAINER_PATH:-/workspace}"
    restart: unless-stopped
```

### 10.2 Reglas para programación

El programador debe corregir `docker-compose.yml` para que no tenga puertos ni rutas rígidas como:

```yaml
ports:
  - "127.0.0.1:8787:8787"
volumes:
  - "D:/MCP/workspace:/workspace"
```

Debe usar variables:

```yaml
ports:
  - "${MCP_BIND_ADDRESS:-127.0.0.1}:${MCP_HOST_PORT:-8787}:${MCP_CONTAINER_PORT:-8787}"
volumes:
  - "${MCP_WORKSPACE_HOST_PATH}:${MCP_WORKSPACE_CONTAINER_PATH:-/workspace}"
```

También debe incluir obligatoriamente:

```yaml
env_file:
  - .env
```

## 11. Middleware de autenticación esperado

El programador debe implementar una capa única de autenticación antes de ejecutar tools MCP.

Pseudocódigo esperado:

```js
const AUTH_MODE = process.env.MCP_AUTH_MODE || "none";

async function authMiddleware(req, res, next) {
  if (AUTH_MODE === "none") {
    return next();
  }

  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return unauthorized(res);
  }

  const token = header.slice("Bearer ".length);

  if (AUTH_MODE === "api_key") {
    if (!process.env.MCP_API_KEY) {
      return res.status(500).json({ error: "missing_mcp_api_key" });
    }

    if (token !== process.env.MCP_API_KEY) {
      return unauthorized(res);
    }

    req.auth = { type: "api_key" };
    return next();
  }

  if (AUTH_MODE === "oauth") {
    try {
      const claims = await verifyOAuthJwt(token, {
        issuer: process.env.OAUTH_ISSUER,
        audience: process.env.OAUTH_AUDIENCE,
        jwksUrl: process.env.OAUTH_JWKS_URL,
        requiredScopes: (process.env.OAUTH_REQUIRED_SCOPES || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      });

      req.auth = { type: "oauth", user: claims.sub, claims };
      return next();
    } catch {
      return unauthorized(res);
    }
  }

  return res.status(500).json({ error: "invalid_auth_mode" });
}

function unauthorized(res) {
  if (process.env.MCP_AUTH_MODE === "oauth") {
    return res
      .status(401)
      .set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadataUrl()}"`
      )
      .json({ error: "unauthorized" });
  }

  return res.status(401).json({ error: "unauthorized" });
}
```

## 12. Despliegue en ChatGPT según tipo de cuenta

### 12.1 ChatGPT Plus

Uso recomendado:

```env
MCP_AUTH_MODE=oauth
```

En ChatGPT:

```text
Autenticación -> OAuth
```

Motivo: en cuentas Plus puede no aparecer la opción `Token de acceso / clave de API`.

### 12.2 ChatGPT Empresa / Business

Uso recomendado cuando la UI muestre token/API key:

```env
MCP_AUTH_MODE=api_key
MCP_API_KEY=<token-largo-generado-para-ese-cliente>
```

En ChatGPT:

```text
Autenticación -> Token de acceso / clave de API
```

### 12.3 Prueba local sin autenticación

Uso permitido solo para prueba:

```env
MCP_AUTH_MODE=none
```

En ChatGPT:

```text
Autenticación -> Sin autenticación
```

## 13. Compatibilidad de raíz para agentes IA

El servidor debe aceptar como raíz del workspace cualquiera de las siguientes variantes al usar `list_files` o herramientas equivalentes de navegación:

```text
relative_dir omitido
relative_dir = "."
relative_dir = "./"
relative_dir = ""
```

Todas esas variantes deben resolverse internamente como la raíz configurada en `MCP_WORKSPACE_ROOT`.

Esta compatibilidad no debe relajar la seguridad: rutas absolutas, rutas fuera del workspace e intentos de traversal deben seguir siendo rechazados.

## 14. Corrección obligatoria: multisesión y transporte MCP

La versión oficial debe corregir el manejo multisesión del endpoint `/mcp`.

### 14.1 Error detectado

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

### 14.2 Causa

La causa es una arquitectura incorrecta en `server.mjs`:

```js
const server = new McpServer(...)
```

creado como instancia global, y luego reutilizado con:

```js
await server.connect(transport)
```

para más de un transporte.

Cada sesión o request stateless debe usar su propia instancia de servidor/protocolo.

### 14.3 Corrección requerida

Programación debe refactorizar `server.mjs` con este criterio:

1. Mover el registro de tools a una función `registerTools(server)`.
2. Crear una función `createMcpServer()` que instancie un nuevo `McpServer` y registre las tools.
3. No mantener un `McpServer` global conectado.
4. Mantener un mapa de sesiones con objetos `{ server, transport }`, no solo `transport`.
5. Para requests con `mcp-session-id`, reutilizar el par `{ server, transport }` de esa sesión.
6. Para `initialize` sin sesión, crear un nuevo contexto de sesión.
7. Para requests stateless sin sesión, crear un `McpServer` nuevo y cerrar el transporte al terminar.
8. En `DELETE /mcp`, cerrar el transporte y eliminar la sesión del mapa.

## 15. Esquema de salida recomendado

Las tools deben devolver salida legible en `content` y salida estructurada en `structuredContent`.

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

## 16. Validación obligatoria

Después de modificar el programa, programación debe validar:

1. reconstruir y recrear el contenedor;
2. confirmar que `GET /health` responde `ok: true`;
3. confirmar que `/health` muestra `workspaceRoot` igual a `MCP_WORKSPACE_ROOT`;
4. confirmar que `POST /mcp` con `initialize` no devuelve `Already connected to a transport`;
5. confirmar que `MCP_AUTH_MODE=none` permite operar solo en entorno de prueba;
6. confirmar que `MCP_AUTH_MODE=api_key` rechaza requests sin token;
7. confirmar que `MCP_AUTH_MODE=api_key` acepta `Authorization: Bearer <MCP_API_KEY>`;
8. confirmar que `MCP_AUTH_MODE=oauth` publica `/.well-known/oauth-protected-resource`;
9. confirmar que `MCP_AUTH_MODE=oauth` rechaza tokens vencidos, inválidos o sin scope;
10. confirmar que ChatGPT puede ejecutar `list_files`;
11. confirmar que al listar un workspace vacío devuelve `{ files: [] }` y no error 502;
12. confirmar que al agregar archivos al volumen, `list_files` los muestra;
13. confirmar que el comportamiento se mantiene detrás de Cloudflare Tunnel y no solo en `localhost`.

## 17. Documentos y archivos relevantes

| Archivo | Uso |
|---|---|
| `README.md` | Instructivo técnico oficial del proyecto activo `docs-mcp`. |
| `server.mjs` | Implementación del servidor MCP HTTP. |
| `package.json` | Metadata, dependencias y script de arranque. |
| `Dockerfile` | Imagen del servicio. |
| `docker-compose.yml` | Ejecución local o en host Docker. Debe usar variables para puertos y volumen. |
| `.dockerignore` | Exclusiones de build Docker. |
| `.gitignore` | Debe excluir `.env`, `node_modules`, logs y artefactos temporales. |
| `.env.example` | Plantilla versionable de variables sin secretos reales. |
| `.env.default` | Plantilla opcional equivalente a `.env.example` si se prefiere ese nombre. |
| `.env` | Archivo local real. No debe versionarse. |
| `obsoleto/doc-mcp/README.md` | Referencia histórica de la versión anterior. |
| `../README.md` | Índice general del workspace MCPacer. No reemplaza este instructivo. |

## 18. Estado actual

Estado documental: actualizado para dejar explícito que el proyecto debe soportar autenticación configurable por `.env` en modos `oauth`, `api_key` y `none`.

Estado funcional esperado antes de llevar a GitHub: pendiente de que programación incorpore la corrección multisesión en `server.mjs`, implemente el middleware de autenticación configurable, corrija `docker-compose.yml`, agregue o actualice `.env.example`, reconstruya la imagen y valide el conector.

Puntos que deben revisarse antes de considerar cerrada la consolidación:

1. Confirmar que `server.mjs` crea un `McpServer` nuevo por sesión o request.
2. Confirmar que ya no existe una instancia global conectada a múltiples transports.
3. Confirmar que `POST /mcp` con `initialize` no devuelve `Already connected to a transport`.
4. Confirmar que ChatGPT puede ejecutar `list_files` sin error 502.
5. Confirmar que `/health` muestra `workspaceRoot` igual a `MCP_WORKSPACE_ROOT`.
6. Confirmar que `docker-compose.yml` contiene `env_file: - .env`.
7. Confirmar que `docker-compose.yml` parametriza `ports` desde `MCP_BIND_ADDRESS`, `MCP_HOST_PORT` y `MCP_CONTAINER_PORT`.
8. Confirmar que `docker-compose.yml` parametriza `volumes` desde `MCP_WORKSPACE_HOST_PATH` y `MCP_WORKSPACE_CONTAINER_PATH`.
9. Confirmar que `.env.example` existe y contiene valores seguros por defecto, incluyendo `MCP_AUTH_MODE`.
10. Confirmar que `.env` queda excluido de Git.
11. Confirmar que `MCP_AUTH_MODE=api_key` funciona con `Authorization: Bearer <MCP_API_KEY>`.
12. Confirmar que `MCP_AUTH_MODE=oauth` funciona con OAuth y publica metadata de recurso protegido.
13. Confirmar que `MCP_AUTH_MODE=none` queda documentado solo para pruebas.
14. Confirmar que `package.json` y el nombre del servidor MCP reflejan el nombre oficial final.
15. Confirmar que `obsoleto/doc-mcp` queda solo como trazabilidad histórica.
16. Validar despliegue desde GitHub en Docker Desktop y EasyPanel.
17. Subir la corrección a GitHub solo después de validar localmente y por túnel.
