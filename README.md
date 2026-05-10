# docs-mcp / mcp-sidy

Servidor MCP HTTP para exponer operaciones controladas de filesystem sobre un workspace documental montado en contenedor.

Este `README.md` es la **fuente de verdad técnica oficial** del proyecto `docs-mcp` / `mcp-sidy`. Define cómo debe quedar implementado, configurado, desplegado y validado el servidor MCP para funcionar con Docker/EasyPanel, Cloudflare Access Managed OAuth y ChatGPT.

El objetivo de este documento es eliminar ambigüedades: si el código no cumple lo descrito aquí, el programa está incompleto.

---

## 1. Objetivo funcional

`docs-mcp` expone un servidor MCP por HTTP para operar sobre archivos de documentación dentro de un workspace controlado.

Permite a ChatGPT ejecutar tools MCP para:

- listar archivos;
- leer archivos;
- buscar archivos;
- crear archivos;
- reemplazar archivos;
- borrar archivos;
- crear carpetas;
- consultar metadata;
- revisar estado Git del workspace.

El endpoint MCP principal es:

```text
/mcp
```

Ejemplo público para la app nueva:

```text
https://docs.at-once.cl/mcp
```

Ejemplo público usado en la validación anterior:

```text
https://mcp-sidy.somosgeex.cl/mcp
```

---

## 2. Arquitectura esperada

Flujo esperado:

```text
ChatGPT
  -> OAuth / Dynamic Client Registration (DCR)
  -> Cloudflare Access Managed OAuth
  -> Cloudflare Access Application
  -> Cloudflare Tunnel / proxy / EasyPanel
  -> contenedor docs-mcp
  -> endpoint /mcp
```

En despliegue Docker o EasyPanel:

```text
Cloudflare -> https://docs.at-once.cl/mcp
  -> origin / servicio Docker
  -> docs-mcp escuchando en 0.0.0.0:8787
```

---

## 3. Decisión arquitectónica obligatoria para Cloudflare Access

Cuando `docs-mcp` funciona detrás de **Cloudflare Access Managed OAuth**, el servidor MCP debe aceptar el JWT OAuth desde dos posibles headers HTTP:

```http
Authorization: Bearer <jwt>
```

y también:

```http
Cf-Access-Jwt-Assertion: <jwt>
```

Esto es **obligatorio**.

No es opcional.  
No es una mejora futura.  
No es una interpretación del programador.  
No basta con documentarlo.  
Debe estar implementado en `server.mjs`.

---

## 4. Motivo técnico del requisito `Cf-Access-Jwt-Assertion`

Cloudflare Access puede autenticar correctamente al usuario y autorizar la aplicación, pero el JWT validable que llega al origin puede venir en:

```http
Cf-Access-Jwt-Assertion: <jwt>
```

y no necesariamente en:

```http
Authorization: Bearer <jwt>
```

Si `server.mjs` solo lee `Authorization`, el flujo puede pasar por Cloudflare correctamente, mostrar la pantalla:

```text
Authorize Client -> ChatGPT -> Allow
```

pero después el MCP puede responder:

```json
{"error":"Unauthorized","message":"Missing Bearer token"}
```

Por lo tanto, el servidor debe extraer token desde ambos headers.

---

## 5. Implementación obligatoria en `server.mjs`

La función `getBearerToken(req)` debe quedar exactamente con esta lógica:

```js
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
```

Esta función debe estar implementada en el archivo real:

```text
server.mjs
```

---

## 6. Código incorrecto que debe rechazarse

Este código es **incorrecto** para Cloudflare Access Managed OAuth:

```js
function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.trim()) {
    const match = auth.trim().match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return normalizeToken(match[1]);
  }
  return null;
}
```

Ese código solo acepta:

```http
Authorization: Bearer <jwt>
```

y no acepta:

```http
Cf-Access-Jwt-Assertion: <jwt>
```

Por lo tanto, no cumple la arquitectura requerida para Cloudflare Access.

---

## 7. Validación obligatoria del código

Antes de entregar el programa, programación debe ejecutar:

```powershell
cd D:\mcp\docs-mcp; Select-String -Path server.mjs -Pattern "cf-access-jwt-assertion|getBearerToken" -Context 0,12
```

Debe aparecer este bloque:

```js
const cfAccessJwt = req.headers["cf-access-jwt-assertion"];
if (typeof cfAccessJwt === "string" && cfAccessJwt.trim()) {
  return normalizeToken(cfAccessJwt);
}
```

Si ese bloque no aparece, el programa no está corregido.

---

## 8. Validación JWT OAuth

Después de obtener el token desde `Authorization` o desde `Cf-Access-Jwt-Assertion`, el servidor debe validar el JWT con JWKS remoto.

La validación esperada es:

```js
jwtVerify(token, getOauthJwks(), {
  issuer: OAUTH_ISSUER,
  audience: OAUTH_AUDIENCE
});
```

Debe validar:

1. firma contra JWKS;
2. issuer;
3. audience;
4. expiración;
5. scopes, solo si `OAUTH_REQUIRED_SCOPES` tiene valores.

Si `OAUTH_REQUIRED_SCOPES` está vacío, no debe bloquear por scopes.

---

## 9. Variables `.env` requeridas para OAuth

Para un ambiente real con Cloudflare Access, el `.env` debe incluir:

```env
MCP_AUTH_MODE=oauth
MCP_PUBLIC_URL=https://docs.at-once.cl/mcp

OAUTH_ISSUER=https://at-once.cloudflareaccess.com
OAUTH_AUDIENCE=ba86613db7f94862d55ca39c2de3d5fb36d50ea19328c3d06d30feda562c34be
OAUTH_JWKS_URL=https://at-once.cloudflareaccess.com/cdn-cgi/access/certs
OAUTH_REQUIRED_SCOPES=
```

Notas:

- `MCP_PUBLIC_URL` debe incluir `/mcp`.
- `OAUTH_ISSUER` no es el dominio público del MCP. Es el Team Domain de Cloudflare Access.
- `OAUTH_AUDIENCE` es el **Application Audience (AUD) Tag** de la aplicación Cloudflare Access.
- `OAUTH_JWKS_URL` normalmente termina en `/cdn-cgi/access/certs`.
- `OAUTH_REQUIRED_SCOPES` puede quedar vacío si no se validan scopes específicos.

---

## 10. Configuración `.env` completa recomendada

Ejemplo para `docs.at-once.cl`:

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

MCP_AUTH_MODE=oauth
MCP_PUBLIC_URL=https://docs.at-once.cl/mcp

OAUTH_ISSUER=https://at-once.cloudflareaccess.com
OAUTH_AUDIENCE=ba86613db7f94862d55ca39c2de3d5fb36d50ea19328c3d06d30feda562c34be
OAUTH_JWKS_URL=https://at-once.cloudflareaccess.com/cdn-cgi/access/certs
OAUTH_REQUIRED_SCOPES=
```

Los valores concretos de `MCP_PUBLIC_URL` y `OAUTH_AUDIENCE` pueden cambiar por ambiente. No necesariamente deben quedar fijos en el repositorio, pero sí deben estar configurados en el entorno real de Docker o EasyPanel.

---

## 11. `.env.example` obligatorio

El repositorio debe incluir un `.env.example` sin secretos reales.

Ejemplo recomendado:

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

# Auth modes: oauth | api_key | none
MCP_AUTH_MODE=oauth

# Public MCP endpoint. Must include /mcp
MCP_PUBLIC_URL=https://your-mcp-domain.example.com/mcp

# Required only when MCP_AUTH_MODE=api_key
# MCP_API_KEY=change-me-with-a-long-random-secret

# Legacy alias only. Prefer MCP_API_KEY.
# MCP_AUTH_TOKEN=legacy-api-token

# Required when MCP_AUTH_MODE=oauth
# For Cloudflare Access, OAUTH_ISSUER is the Cloudflare Access Team Domain.
OAUTH_ISSUER=https://your-team.cloudflareaccess.com

# For Cloudflare Access, OAUTH_AUDIENCE is the Application Audience (AUD) Tag.
OAUTH_AUDIENCE=replace-with-cloudflare-access-aud-tag

# For Cloudflare Access, JWKS/certs URL usually ends with /cdn-cgi/access/certs
OAUTH_JWKS_URL=https://your-team.cloudflareaccess.com/cdn-cgi/access/certs

# Optional. Leave empty if no app-specific scopes are required.
OAUTH_REQUIRED_SCOPES=
```

---

## 12. `docker-compose.yml` requerido

El contenedor debe cargar `.env` mediante `env_file`.

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

Puntos obligatorios:

- `env_file: - .env` debe existir.
- Los puertos deben ser parametrizables.
- El volumen debe ser parametrizable.
- `MCP_WORKSPACE_ROOT` debe coincidir con la ruta interna del contenedor.

No debe quedar hardcodeado así:

```yaml
ports:
  - "127.0.0.1:8787:8787"
volumes:
  - "D:/MCP/workspace:/workspace"
```

---

## 13. Rebuild obligatorio

Cada vez que cambie:

- `server.mjs`;
- `.env`;
- `docker-compose.yml`;
- `package.json`;
- dependencias;

se debe reconstruir el contenedor:

```powershell
cd D:\mcp\docs-mcp; docker compose up -d --build --force-recreate
```

Luego revisar:

```powershell
docker ps --filter "name=docs-mcp"
```

y:

```powershell
docker logs docs-mcp --tail 200
```

---

## 14. Configuración Cloudflare Access Managed OAuth

### 14.1 Application type

En Cloudflare Zero Trust:

```text
Access -> Applications -> Add an application -> Self-hosted
```

### 14.2 Dominio

Para la app nueva:

```text
Subdomain: docs
Domain: at-once.cl
```

El endpoint MCP real será:

```text
https://docs.at-once.cl/mcp
```

---

## 15. Path en Cloudflare Access

En versiones actuales de Cloudflare puede aparecer este error al intentar configurar Path junto con Managed OAuth:

```text
domain can not have a path if oauth is configured
```

Si aparece ese error, la aplicación Access debe quedar así:

```text
Subdomain: docs
Domain: at-once.cl
Path: vacío
Managed OAuth: enabled
```

Esto significa:

```text
Cloudflare protege:
https://docs.at-once.cl

ChatGPT usa:
https://docs.at-once.cl/mcp

MCP_PUBLIC_URL usa:
https://docs.at-once.cl/mcp
```

El Path `/mcp` debe mantenerse en:

```env
MCP_PUBLIC_URL=https://docs.at-once.cl/mcp
```

y en ChatGPT:

```text
https://docs.at-once.cl/mcp
```

aunque Cloudflare Access no permita configurar Path en la aplicación.

---

## 16. Managed OAuth

Debe estar activado:

```text
Managed OAuth: enabled
```

ChatGPT debe usar:

```text
OAuth
Registro dinámico de cliente / Dynamic Client Registration / DCR
```

No se debe usar Client ID / Client Secret manual salvo que se configure otro proveedor OAuth explícitamente.

---

## 17. Allowed Redirect URIs

En Cloudflare Access, agregar:

```text
https://chatgpt.com/*
```

También se recomienda agregar:

```text
https://chat.openai.com/*
```

Sin estos redirect URIs, Cloudflare puede autenticar al usuario pero fallar al devolver el flujo a ChatGPT.

---

## 18. Policy de acceso

La aplicación Access debe tener una policy que permita al usuario.

Ejemplo:

```text
Allow -> Emails -> usuario@dominio.com
```

o:

```text
Allow -> Emails ending in -> @dominio.com
```

Durante el flujo, Cloudflare debe mostrar una pantalla similar a:

```text
Authorize Client
Client: ChatGPT
Origin: https://chatgpt.com
Resource: docs.at-once.cl
```

El usuario debe presionar:

```text
Allow
```

---

## 19. Valores OAuth de Cloudflare

### 19.1 `OAUTH_ISSUER`

Sale del Team Domain de Cloudflare Access.

Ejemplo:

```text
https://at-once.cloudflareaccess.com
```

### 19.2 `OAUTH_AUDIENCE`

Sale de:

```text
Cloudflare Zero Trust
  -> Access
  -> Applications
  -> docs
  -> Configure
  -> Additional settings
  -> Application Audience (AUD) Tag
```

Para esta app:

```text
ba86613db7f94862d55ca39c2de3d5fb36d50ea19328c3d06d30feda562c34be
```

### 19.3 `OAUTH_JWKS_URL`

Se arma con el Team Domain:

```text
https://at-once.cloudflareaccess.com/cdn-cgi/access/certs
```

---

## 20. Configuración en ChatGPT

En ChatGPT:

```text
Settings -> Apps / Connectors -> Developer mode -> Create app / Add MCP app
```

URL:

```text
https://docs.at-once.cl/mcp
```

Autenticación:

```text
OAuth
```

Método de registro:

```text
Dynamic Client Registration / DCR
```

Scopes:

```text
vacío
```

salvo que `OAUTH_REQUIRED_SCOPES` tenga valores.

---

## 21. Validaciones por PowerShell

### 21.1 Revisar `.env`

```powershell
cd D:\mcp\docs-mcp; Get-Content .env
```

Debe contener:

```env
MCP_AUTH_MODE=oauth
MCP_PUBLIC_URL=https://docs.at-once.cl/mcp
OAUTH_ISSUER=https://at-once.cloudflareaccess.com
OAUTH_AUDIENCE=ba86613db7f94862d55ca39c2de3d5fb36d50ea19328c3d06d30feda562c34be
OAUTH_JWKS_URL=https://at-once.cloudflareaccess.com/cdn-cgi/access/certs
OAUTH_REQUIRED_SCOPES=
```

### 21.2 Validar que `server.mjs` tenga `Cf-Access-Jwt-Assertion`

```powershell
cd D:\mcp\docs-mcp; Select-String -Path server.mjs -Pattern "cf-access-jwt-assertion|getBearerToken" -Context 0,12
```

Debe aparecer:

```js
const cfAccessJwt = req.headers["cf-access-jwt-assertion"];
if (typeof cfAccessJwt === "string" && cfAccessJwt.trim()) {
  return normalizeToken(cfAccessJwt);
}
```

### 21.3 Rebuild

```powershell
cd D:\mcp\docs-mcp; docker compose up -d --build --force-recreate
```

### 21.4 Ver contenedor

```powershell
docker ps --filter "name=docs-mcp"
```

Debe aparecer:

```text
docs-mcp
127.0.0.1:8787->8787/tcp
```

o el puerto configurado en el ambiente.

### 21.5 Ver logs

```powershell
docker logs docs-mcp --tail 200
```

Debe mostrar:

```text
docs-mcp listening on http://0.0.0.0:8787
MCP endpoint available at http://0.0.0.0:8787/mcp
```

### 21.6 Probar endpoint local sin token

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8787/mcp -Method GET
```

Respuesta esperada en OAuth:

```json
{"error":"Unauthorized","message":"Missing Bearer token"}
```

Esto es correcto: el MCP está vivo y exige token.

### 21.7 Probar endpoint público sin token

```powershell
try { Invoke-WebRequest -Uri "https://docs.at-once.cl/mcp" -Method GET -UseBasicParsing } catch { $_.Exception.Response.Headers["WWW-Authenticate"] }
```

Debe devolver un header `WWW-Authenticate` de tipo Bearer/OAuth.

### 21.8 Probar Authorization Server

```powershell
(Invoke-WebRequest -Uri "https://at-once.cloudflareaccess.com/.well-known/oauth-authorization-server" -Method GET -UseBasicParsing).Content
```

Debe incluir:

```json
"registration_endpoint"
```

Esto confirma soporte de Dynamic Client Registration.

### 21.9 Probar metadata local del MCP

```powershell
(Invoke-WebRequest -Uri "http://127.0.0.1:8787/.well-known/oauth-protected-resource" -Method GET -UseBasicParsing).Content
```

Debe devolver algo equivalente a:

```json
{
  "resource": "https://docs.at-once.cl/mcp",
  "authorization_servers": ["https://at-once.cloudflareaccess.com"],
  "scopes_supported": [],
  "bearer_methods_supported": ["header"]
}
```

---

## 22. Checklist de aceptación para programación

El entregable se acepta solo si cumple todo esto:

- [ ] `server.mjs` contiene `cf-access-jwt-assertion`.
- [ ] `getBearerToken(req)` lee `Authorization: Bearer`.
- [ ] `getBearerToken(req)` lee `Cf-Access-Jwt-Assertion`.
- [ ] `requireAuth(req, res)` usa `getBearerToken(req)`.
- [ ] OAuth valida JWT con `issuer`, `audience` y JWKS.
- [ ] `OAUTH_REQUIRED_SCOPES` vacío no bloquea acceso.
- [ ] `.env.example` explica Cloudflare Access.
- [ ] `docker-compose.yml` contiene `env_file: - .env`.
- [ ] Docker se reconstruyó después del cambio.
- [ ] ChatGPT llega hasta Cloudflare `Allow`.
- [ ] Después del `Allow`, ChatGPT puede listar tools MCP.
- [ ] ChatGPT puede ejecutar al menos una tool real como `list_files` o `write_file`.

---

## 23. Criterio de rechazo del entregable

El entregable debe rechazarse si ocurre cualquiera de estos casos:

1. `server.mjs` no contiene `cf-access-jwt-assertion`.
2. `getBearerToken(req)` solo lee `Authorization`.
3. `.env` real del ambiente no contiene `MCP_AUTH_MODE=oauth`.
4. `MCP_PUBLIC_URL` no termina en `/mcp`.
5. `OAUTH_AUDIENCE` no corresponde al AUD Tag de la aplicación Cloudflare Access correcta.
6. `docker-compose.yml` no carga `.env`.
7. Se modificó código o configuración pero no se reconstruyó el contenedor.
8. ChatGPT llega a `Allow` pero el MCP sigue respondiendo `Missing Bearer token`.

---

## 24. Tools MCP esperadas

El servidor debe exponer al menos estas tools:

| Tool | Propósito |
|---|---|
| `list_files` | Lista archivos dentro del workspace permitido. |
| `read_file` | Lee el contenido de un archivo dentro del workspace. |
| `write_file` | Crea o reemplaza un archivo dentro del workspace. |
| `delete_path` | Borra un archivo o carpeta dentro del workspace. |
| `make_dir` | Crea un directorio dentro del workspace. |
| `stat_path` | Devuelve metadata de archivo o carpeta. |
| `search_files` | Busca archivos por nombre o contenido. |
| `git_status` | Muestra el estado Git del workspace. |

---

## 25. Seguridad de filesystem

El servidor debe cumplir estas reglas:

1. Todas las rutas deben resolverse dentro del workspace configurado.
2. No se deben permitir rutas absolutas.
3. No se debe permitir traversal fuera del workspace.
4. Las operaciones destructivas deben estar claramente identificadas.
5. `.env` no debe versionarse.
6. Tokens, llaves privadas y secretos no deben versionarse.
7. No se debe aceptar token por query string.
8. En exposición pública, no usar `MCP_AUTH_MODE=none`.

---

## 26. Compatibilidad de raíz para agentes IA

El servidor debe aceptar como raíz del workspace cualquiera de estas variantes:

```text
relative_dir omitido
relative_dir = "."
relative_dir = "./"
relative_dir = ""
```

Todas deben resolverse como `MCP_WORKSPACE_ROOT`.

Esto no debe permitir salir del workspace.

---

## 27. Multisesión MCP

El servidor no debe reutilizar una única instancia global de `McpServer` para múltiples transports.

Debe cumplir:

1. Crear una instancia `McpServer` por sesión o request según corresponda.
2. Registrar tools mediante una función común, por ejemplo `registerTools(server)`.
3. Mantener sesiones con `{ server, transport }`.
4. Reutilizar sesión cuando venga `mcp-session-id` válido.
5. Cerrar transporte y servidor cuando corresponda.

El error que se debe evitar es:

```text
Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.
```

---

## 28. Resultado esperado final

La configuración se considera correcta cuando:

1. Docker levanta `docs-mcp` sin errores.
2. `/health` responde correctamente.
3. `/mcp` responde `Unauthorized` sin token.
4. Cloudflare Access muestra `Authorize Client` para ChatGPT.
5. Después de `Allow`, ChatGPT conecta.
6. ChatGPT muestra las tools MCP.
7. ChatGPT puede ejecutar `list_files`.
8. ChatGPT puede ejecutar `write_file`.
9. No aparece `Missing Bearer token` después de una autorización Cloudflare exitosa.

---

## 29. Resumen ejecutivo para programación

La corrección más importante es esta:

```text
Aceptar JWT desde Authorization: Bearer y desde Cf-Access-Jwt-Assertion.
```

El error típico del programa incompleto es este:

```text
Solo acepta Authorization: Bearer.
```

La consecuencia es esta:

```text
Cloudflare puede autorizar correctamente, pero docs-mcp rechaza la conexión después del Allow.
```

La solución es modificar `getBearerToken(req)`, configurar `.env` del entorno y reconstruir el contenedor.

---

## 30. Comandos útiles

Clonar:

```powershell
mkdir D:\mcp
cd D:\mcp
git clone https://github.com/mcandiav/docs-mcp.git
```

Revisar `.env`:

```powershell
cd D:\mcp\docs-mcp; Get-Content .env
```

Verificar `Cf-Access-Jwt-Assertion` en código:

```powershell
cd D:\mcp\docs-mcp; Select-String -Path server.mjs -Pattern "cf-access-jwt-assertion|getBearerToken" -Context 0,12
```

Recrear contenedor:

```powershell
cd D:\mcp\docs-mcp; docker compose up -d --build --force-recreate
```

Ver contenedor:

```powershell
docker ps --filter "name=docs-mcp"
```

Ver logs:

```powershell
docker logs docs-mcp --tail 200
```

Probar endpoint local:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8787/mcp -Method GET
```

Probar endpoint público:

```powershell
try { Invoke-WebRequest -Uri "https://docs.at-once.cl/mcp" -Method GET -UseBasicParsing } catch { $_.Exception.Response.Headers["WWW-Authenticate"] }
```

Probar Authorization Server:

```powershell
(Invoke-WebRequest -Uri "https://at-once.cloudflareaccess.com/.well-known/oauth-authorization-server" -Method GET -UseBasicParsing).Content
```

---

## 31. Estado de mantenimiento

Este README es la fuente de verdad técnica.

Toda corrección futura de arquitectura, seguridad, OAuth, Docker, EasyPanel o Cloudflare debe incorporarse aquí.

Si existe contradicción entre README y código, se debe corregir el código o actualizar formalmente esta documentación antes de entregar.
