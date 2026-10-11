---
title: API overview
description: The windle HTTP API at api.windle.fun. Base URL, versioning, errors, CORS, health checks and the interactive OpenAPI reference. Early and unstable.
---

:::caution[Early and unstable]
The API is in early development. Endpoints, fields and behaviour can change without notice and without a deprecation
period until it is declared stable. Don't build anything you can't afford to rewrite on it yet.
:::

## Reference

The interactive OpenAPI reference is generated from the API itself and is the source of truth:

**[api.windle.fun/reference ↗](https://api.windle.fun/reference)**

This page gives the conventions; [Authentication](/api/auth/) covers the auth endpoints.

## Basics

| | |
| --- | --- |
| Base URL | `https://api.windle.fun` |
| Versioning | Path prefix: `/v1/…` |
| Format | JSON requests and responses (`content-type: application/json`) |
| Auth | Session cookie `wl_session`, set by [SIWS sign-in](/api/auth/) |
| Transport | HTTPS only |

## Errors

Every non-2xx response has the same shape:

```json
{
  "error": {
    "code": "not_found",
    "message": "GET /v1/unknown not found"
  }
}
```

`code` is a stable machine-readable string; `message` is for humans and may change. Branch on `code`, never on
`message`.

## Browsers and CORS

The API accepts credentialed cross-origin requests only from windle's own origins (`*.windle.fun`). A page on another
site can't use a visitor's windle session. Calls from servers and scripts (no browser) are not affected by CORS.

## Rate limits

Requests are rate limited per client. Limits are not published yet and will change. A limited request gets HTTP `429`
with the standard error body; back off and retry later.

## Health

| Endpoint | Meaning |
| --- | --- |
| `GET /health` | The API process is up (liveness). |
| `GET /ready` | The API can reach its database and cache (readiness). |

Both are meant for monitoring, not for application logic.
