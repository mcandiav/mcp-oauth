# docs-mcp

Servidor MCP HTTP para exponer operaciones controladas de filesystem sobre un workspace documental montado en contenedor.

Este proyecto corresponde a la versión activa del servidor MCP documental dentro de MCPacer. Su objetivo es permitir que ChatGPT u otros agentes compatibles con MCP puedan listar, leer, buscar y administrar archivos dentro de un workspace permitido, sin exponer acceso fuera del directorio configurado.

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

## 1. Objetivo funcional

`docs-mcp` expone un servidor MCP por HTTP para operar sobre archivos de documentación dentro de un workspace controlado.

El servidor está pensado para listar, leer, buscar, crear, reemplazar, borrar y consultar metadata de archivos dentro del workspace permitido. El caso de uso principal es exponer documentación interna a ChatGPT mediante MCP, manteniendo el acceso limitado al directorio configurado.

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

`docs-mcp` es el proyecto activo para el servidor MCP documental dentro de MCPacer. La versión anterior ubicada en `obsoleto/doc-mcp` debe conservarse solo como trazabilidad histórica y referencia técnica.

### 3.2 Nombre funcional

El proyecto activo se documenta como `docs-mcp` porque ese es el nombre actual del directorio activo y del repositorio GitHub.

El nombre debe quedar alineado en directorio, `package.json`, servidor MCP, `docker-compose.yml`, `container_name`, logs, documentación y configuración de despliegue.

### 3.3 Publicación y despliegue desde GitHub

El proyecto debe quedar preparado para publicarse como repositorio en GitHub y desplegarse desde esa fuente tanto en Docker Desktop como en EasyPanel.

La fuente oficial de despliegue debe ser el repositorio GitHub del proyecto. El repositorio debe permitir clonar, configurar `.env`, levantar con Docker Compose, desplegar en EasyPanel, montar un volumen externo y mantener una sola versión oficial del servidor MCP documental.

### 3.4 Una sola versión activa

No deben coexistir dos servidores MCP documentales activos con el mismo propósito.

Regla vigente:

- activo: `docs-mcp/`;
- histórico u obsoleto: `obsoleto/doc-mcp/`.

## 4. Tools MCP consideradas

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

1. Todas las rutas deben resolverse dentro del workspace configurado.
2. No se deben permitir rutas absolutas.
3. No se debe permitir traversal fuera del workspace.
4. Las operaciones destructivas deben estar claramente identificadas por la tool.
5. Si se expone fuera de una red privada, debe usarse autenticación Bearer mediante `MCP_AUTH_TOKEN` o una protección equivalente en el reverse proxy.
6. Los secretos, tokens, llaves privadas y certificados no deben versionarse.
7. El archivo `.env` local debe estar en `.gitignore`.
8. El repositorio solo debe incluir `.env.example` o `.env.default` sin secretos reales.
9. `MCP_AUTH_TOKEN` debe quedar comentado por defecto en la plantilla.
10. Para exposición pública, el token real debe configurarse fuera del repositorio.

## 6. Variables de entorno esperadas

| Variable | Uso esperado |
|---|---|
| `MCP_CONTAINER_NAME` | Nombre del contenedor creado por Docker Compose. |
| `MCP_BIND_ADDRESS` | IP del host donde Docker publicará el puerto. En local se recomienda `127.0.0.1`. |
| `MCP_HOST_PORT` | Puerto expuesto en el host Windows/Linux/macOS. |
| `MCP_CONTAINER_PORT` | Puerto interno expuesto por el contenedor. |
| `PORT` | Puerto HTTP usado por la app Node. |
| `MCP_PORT` | Alternativa para definir el puerto HTTP usado por la app Node. |
| `MCP_HOST` | Host de escucha dentro del contenedor, normalmente `0.0.0.0`. |
| `MCP_WORKSPACE_HOST_PATH` | Ruta real del host que Docker monta como volumen. Ejemplo Windows: `D:/MCP/workspace`. |
| `MCP_WORKSPACE_CONTAINER_PATH` | Ruta interna del contenedor donde Docker monta el workspace. Ejemplo: `/workspace`, `/docs`, `/data/docs`. |
| `MCP_WORKSPACE_ROOT` | Ruta interna que lee la app Node. Debe coincidir con `MCP_WORKSPACE_CONTAINER_PATH`. |
| `MCP_MAX_INLINE_BYTES` | Tamaño máximo para devolver archivos inline. |
| `MCP_HTTP_JSON_LIMIT` | Límite del body JSON recibido por Express. |
| `MCP_AUTH_TOKEN` | Token Bearer requerido para proteger `/mcp`, si se habilita. |

Criterio esperado:

- `MCP_AUTH_TOKEN` definido con valor debe exigir `Authorization: Bearer <token>` en `/mcp`;
- `MCP_AUTH_TOKEN` omitido, comentado o vacío no debe exigir token;
- los cambios de `.env` requieren recrear el contenedor, no solo `docker compose restart`;
- `docker-compose.yml` debe inyectar `.env` al contenedor usando `env_file`;
- `ports` y `volumes` no deben quedar hardcodeados en el compose, deben parametrizarse desde `.env`;
- la ruta destino del volumen tampoco debe quedar hardcodeada como `/workspace`;
- `MCP_WORKSPACE_CONTAINER_PATH` y `MCP_WORKSPACE_ROOT` deben tener el mismo valor salvo que programación implemente una razón explícita para separarlas.

## 7. Configuración oficial requerida para Docker Compose

La configuración oficial esperada para Docker Desktop y despliegues basados en Docker Compose es la siguiente.

### 7.1 `docker-compose.yml` oficial

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

### 7.2 `.env` local de ejemplo

Este archivo se usa localmente, pero no debe versionarse como `.env` real.

```env
MCP_CONTAINER_NAME=docs-mcp

MCP_BIND_ADDRESS=127.0.0.1
MCP_HOST_PORT=8787
MCP_CONTAINER_PORT=8787

PORT=8787
MCP_PORT=8787
MCP_HOST=0.0.0.0

MCP_WORKSPACE_HOST_PATH=D:/MCP/workspace
MCP_WORKSPACE_CONTAINER_PATH=/workspace
MCP_WORKSPACE_ROOT=/workspace

MCP_MAX_INLINE_BYTES=1000000
MCP_HTTP_JSON_LIMIT=25mb

# MCP_AUTH_TOKEN=change-me-only-if-exposing-publicly
```

### 7.3 `.env.example` que debe ir a GitHub

El repositorio debe incluir una plantilla versionable con el mismo contenido base, sin secretos reales:

```env
MCP_CONTAINER_NAME=docs-mcp

MCP_BIND_ADDRESS=127.0.0.1
MCP_HOST_PORT=8787
MCP_CONTAINER_PORT=8787

PORT=8787
MCP_PORT=8787
MCP_HOST=0.0.0.0

MCP_WORKSPACE_HOST_PATH=D:/MCP/workspace
MCP_WORKSPACE_CONTAINER_PATH=/workspace
MCP_WORKSPACE_ROOT=/workspace

MCP_MAX_INLINE_BYTES=1000000
MCP_HTTP_JSON_LIMIT=25mb

# MCP_AUTH_TOKEN=change-me-only-if-exposing-publicly
```

### 7.4 Reglas para programación

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

Motivo: durante la prueba, el contenedor levantaba y `/health` respondía, pero `workspaceRoot` quedaba en:

```text
/app
```

en vez de la ruta interna definida por `.env`.

La causa fue que el contenedor no estaba recibiendo `MCP_WORKSPACE_ROOT` desde `.env`. Con `env_file`, la app Node recibe las variables necesarias. Además, si el operador cambia el destino del volumen a `/docs`, entonces debe dejar:

```env
MCP_WORKSPACE_CONTAINER_PATH=/docs
MCP_WORKSPACE_ROOT=/docs
```

## 8. Despliegue en Docker Desktop y EasyPanel

### 8.1 Docker Desktop

Flujo esperado:

1. clonar el repositorio desde GitHub;
2. copiar `.env.example` como `.env`;
3. ajustar `MCP_WORKSPACE_HOST_PATH` al directorio real del host;
4. ajustar `MCP_WORKSPACE_CONTAINER_PATH` si se desea cambiar la ruta interna;
5. dejar `MCP_WORKSPACE_ROOT` igual a `MCP_WORKSPACE_CONTAINER_PATH`;
6. levantar con Docker Compose;
7. validar `/health`;
8. validar `/mcp` desde ChatGPT.

Si se usa el ejemplo por defecto, `/health` debe mostrar:

```text
workspaceRoot: /workspace
```

Si el operador define:

```env
MCP_WORKSPACE_CONTAINER_PATH=/docs
MCP_WORKSPACE_ROOT=/docs
```

entonces `/health` debe mostrar:

```text
workspaceRoot: /docs
```

Si aparece:

```text
workspaceRoot: /app
```

la configuración de entorno no llegó al contenedor.

### 8.2 EasyPanel

Para EasyPanel, las variables deben configurarse desde el panel de variables/secretos del servicio.

Criterio esperado:

- no subir `.env` real a GitHub;
- configurar `MCP_WORKSPACE_CONTAINER_PATH` con la ruta interna montada;
- configurar `MCP_WORKSPACE_ROOT` con el mismo valor que `MCP_WORKSPACE_CONTAINER_PATH`;
- montar el volumen documental en la ruta interna elegida;
- definir `MCP_AUTH_TOKEN` solo si el servicio quedará expuesto públicamente;
- validar `/health` después del deploy;
- validar `/mcp` desde el cliente MCP.

## 9. Compatibilidad de raíz para agentes IA

El servidor debe aceptar como raíz del workspace cualquiera de las siguientes variantes al usar `list_files` o herramientas equivalentes de navegación:

```text
relative_dir omitido
relative_dir = "."
relative_dir = "./"
relative_dir = ""
```

Todas esas variantes deben resolverse internamente como la raíz configurada en `MCP_WORKSPACE_ROOT`.

Esta compatibilidad no debe relajar la seguridad: rutas absolutas, rutas fuera del workspace e intentos de traversal deben seguir siendo rechazados.

## 10. Corrección obligatoria: multisesión y transporte MCP

La versión oficial debe corregir el manejo multisesión del endpoint `/mcp`.

### 10.1 Error detectado

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

### 10.2 Causa

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

### 10.3 Corrección requerida

Programación debe refactorizar `server.mjs` con este criterio:

1. Mover el registro de tools a una función `registerTools(server)`.
2. Crear una función `createMcpServer()` que instancie un nuevo `McpServer` y registre las tools.
3. No mantener un `McpServer` global conectado.
4. Mantener un mapa de sesiones con objetos `{ server, transport }`, no solo `transport`.
5. Para requests con `mcp-session-id`, reutilizar el par `{ server, transport }` de esa sesión.
6. Para `initialize` sin sesión, crear un nuevo contexto de sesión.
7. Para requests stateless sin sesión, crear un `McpServer` nuevo y cerrar el transporte al terminar.
8. En `DELETE /mcp`, cerrar el transporte y eliminar la sesión del mapa.

### 10.4 Validación obligatoria

Después de corregir `server.mjs`, programación debe validar:

1. reconstruir y recrear el contenedor;
2. confirmar que `GET /health` responde `ok: true`;
3. confirmar que `/health` muestra `workspaceRoot` igual a `MCP_WORKSPACE_ROOT`;
4. confirmar que `POST /mcp` con `initialize` no devuelve `Already connected to a transport`;
5. confirmar que el conector ChatGPT puede ejecutar `list_files`;
6. confirmar que al listar un workspace vacío devuelve `{ files: [] }` y no error 502;
7. confirmar que al agregar archivos al volumen, `list_files` los muestra;
8. confirmar que el comportamiento se mantiene detrás de Cloudflare Tunnel y no solo en `localhost`.

## 11. Esquema de salida recomendado

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

## 12. Documentos y archivos relevantes

| Archivo | Uso |
|---|---|
| `README.md` | Documento oficial del proyecto activo. |
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

## 13. Estado actual

Estado documental: actualizado con el error real detectado en `/mcp`, la corrección que debe aplicar programación y la obligación de parametrizar `docker-compose.yml` y `.env.example`, incluyendo ruta host y ruta interna del contenedor.

Estado funcional esperado antes de llevar a GitHub: pendiente de que programación incorpore la corrección multisesión en `server.mjs`, corrija `docker-compose.yml`, agregue o actualice `.env.example`, reconstruya la imagen y valide el conector.

Puntos que deben revisarse antes de considerar cerrada la consolidación:

1. Confirmar que `server.mjs` crea un `McpServer` nuevo por sesión o request.
2. Confirmar que ya no existe una instancia global conectada a múltiples transports.
3. Confirmar que `POST /mcp` con `initialize` no devuelve `Already connected to a transport`.
4. Confirmar que ChatGPT puede ejecutar `list_files` sin error 502.
5. Confirmar que `/health` muestra `workspaceRoot` igual a `MCP_WORKSPACE_ROOT`.
6. Confirmar que `docker-compose.yml` contiene `env_file: - .env`.
7. Confirmar que `docker-compose.yml` parametriza `ports` desde `MCP_BIND_ADDRESS`, `MCP_HOST_PORT` y `MCP_CONTAINER_PORT`.
8. Confirmar que `docker-compose.yml` parametriza `volumes` desde `MCP_WORKSPACE_HOST_PATH` y `MCP_WORKSPACE_CONTAINER_PATH`.
9. Confirmar que `.env.example` existe y contiene valores seguros por defecto, incluyendo `MCP_WORKSPACE_CONTAINER_PATH`.
10. Confirmar que `.env` queda excluido de Git.
11. Confirmar que `package.json` y el nombre del servidor MCP reflejan el nombre oficial final.
12. Confirmar que `obsoleto/doc-mcp` queda solo como trazabilidad histórica.
13. Validar despliegue desde GitHub en Docker Desktop y EasyPanel.
14. Subir la corrección a GitHub solo después de validar localmente y por túnel.
