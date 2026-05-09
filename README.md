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
| V1.4 | 2026-05-09 | Se actualiza `server.mjs` para soportar multisesión básica por `mcp-session-id`, compatibilidad de raíz en navegación, variables `PORT/MCP_PORT/MCP_HOST` y autenticación Bearer opcional con `MCP_AUTH_TOKEN`. | Cerrar brechas funcionales críticas detectadas en la revisión técnica. | El servidor queda más compatible con clientes MCP y más seguro para exposición controlada. | Estado actual / Variables / Seguridad |

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

Al momento de crear este README, el archivo `docs-mcp/server.mjs` visible en el workspace debe ser revisado por el programador para confirmar que contiene esa corrección. Si no la contiene, debe actualizarse tomando como referencia la versión que ya resolvía múltiples sesiones o múltiples login del conector.

No se debe publicar una versión oficial que vuelva al problema de sesiones simultáneas.

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

Estado actual en implementación:

- soportadas: `PORT`, `MCP_PORT`, `MCP_HOST`, `MCP_WORKSPACE_ROOT`, `MCP_MAX_INLINE_BYTES`, `MCP_HTTP_JSON_LIMIT`, `MCP_AUTH_TOKEN`;
- comportamiento: `MCP_AUTH_TOKEN` habilita autenticación Bearer obligatoria en `/mcp` cuando está definido.

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
└── .env.example
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

Archivos recomendados antes de publicar en GitHub:

```text
docs-mcp/.gitignore
docs-mcp/.env.example
```

Antes de subir el proyecto a GitHub y usarlo como fuente de despliegue, se debe validar:

1. que `server.mjs` tenga la corrección multisesión;
2. que `list_files` acepte raíz como `.`, `./`, omitida y cadena vacía;
3. que `Dockerfile` construya correctamente;
4. que `docker-compose.yml` monte el workspace externo en `/workspace`;
5. que no existan secretos versionados dentro del proyecto;
6. que `package.json` use el nombre oficial final;
7. que EasyPanel pueda construir desde GitHub usando el `Dockerfile`;
8. que Docker Desktop pueda levantar el servicio localmente usando Docker Compose.

## 8. Compatibilidad de raíz para agentes IA (implementada)

El servidor debe aceptar como raíz del workspace cualquiera de las siguientes variantes al usar `list_files` o herramientas equivalentes de navegación:

```text
relative_dir omitido
relative_dir = "."
relative_dir = "./"
relative_dir = ""
```

Todas esas variantes deben resolverse internamente como la raíz configurada en `MCP_WORKSPACE_ROOT`.

El objetivo es evitar que ChatGPT, Claude, Cursor, Codex u otros agentes fallen al listar el workspace cuando usan distintos defaults para representar el directorio raíz.

Esta compatibilidad ya está aplicada en la implementación activa para tools de navegación por directorio, sin relajar seguridad: rutas absolutas, rutas fuera del workspace e intentos de traversal siguen siendo rechazados.

## 9. Multisesión del conector (implementada en versión actual)

La versión oficial debe conservar o incorporar la corrección de manejo multisesión.

Criterio esperado:

- permitir sesiones MCP simultáneas cuando el cliente las requiera;
- no romper conexiones por múltiples login o múltiples instancias del conector;
- manejar correctamente `mcp-session-id` cuando aplique;
- evitar estado global compartido que cause conflictos entre clientes;
- cerrar sesiones de forma ordenada cuando el transporte lo indique.

Esta corrección ya está integrada con manejo de sesión por encabezado `mcp-session-id`, soporte de cierre de sesión por `DELETE /mcp` y aislamiento básico por sesión.

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
| `.gitignore` | Exclusiones para el futuro repositorio GitHub. |
| `.env.example` | Plantilla de variables sin secretos reales. |
| `obsoleto/doc-mcp/README.md` | Referencia histórica de la versión anterior. |

## 12. Estado actual

Estado documental: creado y alineado con la convención del README raíz de MCPacer.

Estado funcional: actualización aplicada en código (`server.mjs`) y documentada en este README.

Puntos que deben revisarse antes de considerar cerrada la consolidación:

1. Confirmar que `package.json` y el nombre del servidor MCP reflejan el nombre oficial final.
2. Confirmar que `obsoleto/doc-mcp` queda solo como trazabilidad histórica.
3. Preparar `.gitignore` y `.env.example` antes de publicar en GitHub.
4. Validar despliegue desde GitHub en Docker Desktop y EasyPanel.
