# API reference

The backend ships an OpenAPI 3.1 spec at
[`backend/openapi.yaml`](https://github.com/0xNoramiya/ctf-blockchain-infra/blob/main/backend/openapi.yaml)
and serves it live at **`/api/openapi.yaml`** for codegen.

## Quick reference

| Tag | Endpoints |
|---|---|
| `public` | `/api/config`, `/api/status/:id`, `/api/flag/:id`, `/api/sign/:id` |
| `launcher` | `/api/launch/:id`, `/api/kill/:id`, `/api/reset/:id`, `/api/instance/:id`, `/api/rpc/:instanceId` |
| `admin` | `/api/admin/{instances,solves,challenges,manifest/reload,webhook/test}` |
| `ops` | `/api/health`, `/metrics`, `/api/openapi.yaml` |

## Generating a typed client

The spec validates against any OpenAPI 3.1 toolchain. Quick paths:

=== "openapi-typescript-codegen"

    ```bash
    npx openapi-typescript https://ctf.example.com/api/openapi.yaml \
      --output src/ctf-types.ts
    ```

=== "openapi-generator"

    ```bash
    openapi-generator-cli generate \
      -i https://ctf.example.com/api/openapi.yaml \
      -g python -o client/
    ```

=== "Speakeasy / Fern / Stainless"

    Point your platform of choice at the same URL.

## Browsing it

Drop the spec into [editor.swagger.io](https://editor.swagger.io) or
[apidog.com](https://apidog.com). No need to host Swagger UI from the
backend — keeps the dependency surface small.

If you really want a hosted Swagger UI for your event, mount the
[swagger-ui-dist](https://www.npmjs.com/package/swagger-ui-dist) static
files behind your nginx with `url: '/api/openapi.yaml'`. Three files,
no build step.

## Authentication summary

- `public` and `launcher` endpoints — no auth. Per-IP rate-limited.
- `admin` endpoints — `Authorization: Bearer <ADMIN_TOKEN>`. Endpoints
  return `404` when `ADMIN_TOKEN` is unset on the backend; `401` when
  set but the token doesn't match.
- `ops` endpoints — unauthenticated; restrict via firewall/ingress if
  you care.

## Stability

The spec is the contract. Backward-incompatible changes bump the
`info.version` major number. The CLI in `bin/ctf-admin` is the
reference consumer; any breakage there will be visible in CI.
