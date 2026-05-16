# mcp-oauth

Servidor MCP HTTP multiusuario para exponer operaciones controladas de filesystem sobre workspaces aislados por usuario autenticado con Cloudflare Access.

Este proyecto nace como copia/evolución de `docs-mcp`, pero cambia el requisito central: ya no debe existir una raíz documental común para todos los usuarios. `mcp-oauth` debe publicar un solo endpoint MCP y resolver automáticamente el workspace permitido a partir del email autenticado.

Este `README.md` es la fuente de verdad técnica del proyecto `mcp-oauth`. Si el código no cumple lo descrito aquí, el proyecto está incompleto.

---

## 1. Objetivo funcional

`mcp-oauth` debe permitir que varias personas usen IA conectada al mismo MCP sin que sus archivos, carpetas o configuraciones se mezclen.

El servidor debe exponer un único endpoint:

```text
/mcp
```

Ejemplo público esperado:

```text
https://mcpdocs.at-once.cl/mcp
```

Cada usuario autenticado por Cloudflare Access debe operar solo dentro de su propio workspace.

Ejemplo:

```text
mcandia@at-once.cl -> /workspaces/mcandia_at-once_cl/
usuario@cliente.cl -> /workspaces/usuario_cliente_cl/
```

La IA no debe poder elegir, modificar ni saltar a otra raíz de workspace.

---

## 2. Diferencia con docs-mcp

`docs-mcp` es el proyecto base de MCP documental con workspace único.

`mcp-oauth` es la versión multiusuario con aislamiento por identidad.

| Aspecto | docs-mcp | mcp-oauth |
|---|---|---|
| Endpoint | Uno | Uno |
| Workspace | Raíz común | Raíz por usuario |
| Identidad | Opcional o configurable | Obligatoria |
| Autorización | Global | Por email autenticado |
| Cloudflare Access | Protege acceso | Protege acceso y entrega identidad |
| Escalabilidad | Puede requerir un MCP por usuario | Un MCP para múltiples usuarios |

Regla principal:

```text
No crear un MCP por usuario.
Crear un MCP multiusuario que calcule el workspace desde el login.
```

---

## 3. Arquitectura esperada

Flujo lógico:

```text
Usuario / IA
  -> ChatGPT u otro cliente MCP
  -> Cloudflare Access
  -> mcp-oauth
  -> validación JWT Cloudflare
  -> extracción de email
  -> resolución/creación de workspace
  -> tools MCP operando solo bajo esa carpeta
```

Flujo de aislamiento:

```text
request MCP
  -> validar identidad
  -> email = claim validado
  -> workspace = WORKSPACES_ROOT + sanitize(email)
  -> ejecutar operación solo dentro de workspace
```

El cliente MCP puede pedir leer, escribir, buscar o borrar archivos, pero siempre con rutas relativas. El servidor debe convertir esas rutas relativas a rutas absolutas internas bajo el workspace autorizado.

---

## 4. Identidad y autenticación

Cloudflare Access es el proveedor de acceso definido para este proyecto.

El servidor debe aceptar el JWT validable desde estos headers:

```http
Authorization: Bearer <jwt>
```

```http
Cf-Access-Jwt-Assertion: <jwt>
```

La identidad confiable debe salir del JWT validado, no de parámetros enviados por la IA.

El claim principal para resolver workspace será:

```text
email
```

También puede registrarse en auditoría:

```text
sub
aud
iss
exp
iat
```

---

## 5. Validación obligatoria del JWT

El servidor debe validar el JWT antes de ejecutar cualquier tool MCP.

Validaciones mínimas:

1. firma contra JWKS de Cloudflare Access;
2. issuer esperado;
3. audience esperado;
4. expiración;
5. presencia de email;
6. scopes solo si `OAUTH_REQUIRED_SCOPES` tiene valores.

Si `OAUTH_REQUIRED_SCOPES` está vacío, el servidor no debe bloquear por scopes.

Si el token falta, está expirado, no valida o no contiene email, la request debe rechazarse.

---

## 6. Resolución de workspace por email

El código debe implementar una función conceptual equivalente a:

```text
getWorkspaceForRequest(req)
```

Esa función debe:

1. validar la identidad Cloudflare;
2. extraer el email autenticado;
3. normalizar el email a nombre seguro de carpeta;
4. crear el directorio si no existe;
5. devolver la raíz efectiva del workspace para esa request.

Ejemplo de normalización:

```text
mcandia@at-once.cl -> mcandia_at-once_cl
usuario@cliente.cl -> usuario_cliente_cl
```

Caracteres permitidos recomendados para el nombre derivado:

```text
a-z A-Z 0-9 _ - .
```

Los demás caracteres deben reemplazarse por `_` o rechazarse de forma controlada.

---

## 7. Estructura de directorios

La raíz multiusuario debe definirse por variable de entorno:

```env
MCP_WORKSPACES_ROOT=/workspaces
```

Estructura esperada:

```text
/workspaces/
  mcandia_at-once_cl/
    files...
  usuario_cliente_cl/
    files...
```

Si en el futuro se requiere aislar además por agente/IA, se podrá extender a:

```text
/workspaces/
  mcandia_at-once_cl/
    chatgpt/
    claude/
    cursor/
```

Esa separación por agente no es obligatoria para la primera versión. La primera versión debe aislar por usuario/email.

---

## 8. Reglas obligatorias de seguridad de filesystem

Todas las tools deben cumplir estas reglas:

1. No aceptar rutas absolutas enviadas por el cliente.
2. No aceptar rutas con traversal fuera del workspace.
3. Bloquear `../` y variantes equivalentes.
4. Resolver toda ruta final contra el workspace del email autenticado.
5. Verificar que la ruta resuelta siga dentro del workspace autorizado.
6. No seguir symlinks que apunten fuera del workspace.
7. No usar una variable global única tipo `MCP_WORKSPACE_ROOT` como raíz final compartida para todos.
8. No aceptar `workspace`, `root`, `basePath` o equivalentes desde la request del cliente.
9. No aceptar token por query string.
10. No usar `MCP_AUTH_MODE=none` en exposición pública.

Regla principal:

```text
El usuario/IA puede elegir una ruta relativa dentro de su espacio.
El servidor elige la raíz absoluta del workspace.
```

---

## 9. Creación automática de workspace

Cuando un usuario autenticado entra por primera vez, el servidor debe crear su carpeta si no existe.

Ejemplo:

```text
email validado: mcandia@at-once.cl
workspace calculado: /workspaces/mcandia_at-once_cl/
```

Si la carpeta no existe, el servidor la crea.

Esto no debe requerir crear manualmente un MCP por usuario.

---

## 10. Variables de entorno requeridas

Ejemplo base:

```env
MCP_CONTAINER_NAME=mcp-oauth

MCP_BIND_ADDRESS=127.0.0.1
MCP_HOST_PORT=8787
MCP_CONTAINER_PORT=8787

PORT=8787
MCP_PORT=8787
MCP_HOST=0.0.0.0

MCP_WORKSPACES_HOST_PATH=D:/MCP/workspaces
MCP_WORKSPACES_CONTAINER_PATH=/workspaces
MCP_WORKSPACES_ROOT=/workspaces

MCP_MAX_INLINE_BYTES=1000000
MCP_HTTP_JSON_LIMIT=25mb

MCP_AUTH_MODE=oauth
MCP_PUBLIC_URL=https://mcpdocs.at-once.cl/mcp

OAUTH_ISSUER=https://at-once.cloudflareaccess.com
OAUTH_AUDIENCE=replace-with-cloudflare-access-aud-tag
OAUTH_JWKS_URL=https://at-once.cloudflareaccess.com/cdn-cgi/access/certs
OAUTH_REQUIRED_SCOPES=
```

Notas:

- `MCP_PUBLIC_URL` debe incluir `/mcp`.
- `OAUTH_ISSUER` es el Team Domain de Cloudflare Access.
- `OAUTH_AUDIENCE` es el Application Audience (AUD) Tag de la aplicación Cloudflare Access.
- `OAUTH_JWKS_URL` normalmente termina en `/cdn-cgi/access/certs`.
- `MCP_WORKSPACES_ROOT` es la raíz multiusuario, no el workspace final de cada usuario.

---

## 11. Comportamiento de sesión Cloudflare Access

La expiración de sesión o token de Cloudflare no debe borrar workspaces.

Cuando vence la sesión o el token, el usuario deberá autenticarse nuevamente si Cloudflare lo exige. Después de autenticarse, el mismo email debe resolver al mismo workspace.

Ejemplo:

```text
Día 1: mcandia@at-once.cl -> /workspaces/mcandia_at-once_cl/
Día 31: reautentica -> /workspaces/mcandia_at-once_cl/
```

La sesión expira. El workspace permanece.

---

## 12. Tools MCP esperadas

El servidor debe exponer al menos estas tools, todas operando dentro del workspace del usuario autenticado:

| Tool | Propósito |
|---|---|
| `list_files` | Lista archivos dentro del workspace del usuario. |
| `read_file` | Lee contenido dentro del workspace del usuario. |
| `write_file` | Crea o reemplaza archivos dentro del workspace del usuario. |
| `delete_path` | Borra archivos o carpetas dentro del workspace del usuario. |
| `make_dir` | Crea directorios dentro del workspace del usuario. |
| `stat_path` | Devuelve metadata dentro del workspace del usuario. |
| `search_files` | Busca archivos por nombre o contenido dentro del workspace del usuario. |
| `git_status` | Muestra estado Git si el workspace lo permite. |

Cada tool debe declarar `inputSchema` y `outputSchema`.

Si ChatGPT muestra la advertencia `ESQUEMA DE SALIDA RECOMENDADO`, la tool se considera incompleta.

---

## 13. Auditoría mínima

Cada operación debe registrar al menos:

```text
fecha/hora
email autenticado
tool ejecutada
ruta relativa solicitada
resultado
error si corresponde
```

La auditoría no debe registrar secretos ni contenido completo de archivos sensibles.

---

## 14. Criterios de aceptación

El proyecto se considera aceptado cuando:

- [ ] existe un solo endpoint `/mcp`;
- [ ] Cloudflare Access protege el endpoint;
- [ ] `server.mjs` acepta token desde `Authorization: Bearer`;
- [ ] `server.mjs` acepta token desde `Cf-Access-Jwt-Assertion`;
- [ ] el JWT se valida con issuer, audience, expiración y JWKS;
- [ ] el email se obtiene desde el token validado;
- [ ] el workspace se calcula desde el email;
- [ ] el workspace se crea automáticamente si no existe;
- [ ] dos usuarios distintos reciben carpetas distintas;
- [ ] ningún usuario puede listar, leer, escribir ni borrar fuera de su carpeta;
- [ ] rutas absolutas y `../` son rechazadas;
- [ ] todas las tools usan el workspace calculado por request;
- [ ] ninguna tool usa una raíz global compartida como workspace final;
- [ ] todas las tools tienen `outputSchema`;
- [ ] la expiración de sesión no borra datos.

---

## 15. Criterios de rechazo

El entregable debe rechazarse si ocurre cualquiera de estos casos:

1. el servidor permite `MCP_AUTH_MODE=none` en producción;
2. el usuario puede indicar manualmente la raíz del workspace;
3. una IA puede pasar una ruta absoluta;
4. una IA puede usar `../` para salir de su carpeta;
5. dos emails distintos terminan usando la misma carpeta sin intención explícita;
6. `server.mjs` solo usa `Authorization` y no lee `Cf-Access-Jwt-Assertion`;
7. el email se toma desde body/query/header no validado;
8. el código valida presencia de token pero no firma/issuer/audience;
9. las tools siguen apuntando a una raíz compartida única;
10. se siguen creando despliegues MCP separados por usuario.

---

## 16. Decisión vigente

La decisión vigente del proyecto es:

```text
Un solo MCP multiusuario.
Cloudflare Access como proveedor de identidad.
Email autenticado como base de aislamiento.
Workspace automático por email.
Aislamiento aplicado dentro del servidor MCP.
```

---

## 17. Estado de mantenimiento

Este README debe actualizarse antes o junto con cualquier cambio relevante de:

- autenticación;
- Cloudflare Access;
- resolución de workspace;
- estructura de carpetas;
- tools MCP;
- reglas de seguridad;
- despliegue Docker/EasyPanel;
- comportamiento multiusuario.

Si existe contradicción entre código y README, el entregable no debe considerarse cerrado hasta corregir la contradicción.
