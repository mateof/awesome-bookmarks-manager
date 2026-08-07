# Authentication & the token security model

## API tokens

Programmatic clients authenticate with a **Bearer token**:

```
Authorization: Bearer <token>
```

Tokens are created and revoked from the web app under **Settings → API**.
A token looks like `41d9f0a2-....<random>` (an id, a dot, and a secret).
The full string is shown **once** at creation time and never again — copy
it then. If you lose it, revoke it and create a new one.

A token grants **full access to that user's bookmarks, folders and tags** —
the same power the web session has. Treat it like a password. Revoking a
token (deleting it in the UI) stops it working immediately and destroys its
ability to decrypt data (see below).

The same header/token also works for the browser extension endpoint
(`POST /api/ext/quick-add`).

## Why tokens can decrypt your data without your password

AwesomeBookmarks encrypts every title, URL and description at rest. The
encryption key (the **DEK**, Data Encryption Key) is normally derived from
your password at login and held in server memory only.

A headless client (native app, MCP server, cron script) has no password to
offer, and the in-memory key is evicted after an idle timeout. To make
tokens work unattended, token creation stores a **wrapped copy of the DEK**
alongside the token:

```
tokenKEK = HKDF-SHA256(token-secret, salt = "<userId>:<tokenId>", info = "api-token-dek")
envelope = masterWrap( userId, AES-256-GCM(tokenKEK, DEK) )
```

- `masterWrap` seals the inner envelope with the server's `MASTER_KEY`.
- The envelope is stored in the token's DB row (`dek_wrap`).

On each API request the server derives `tokenKEK` from the presented token,
unwraps the DEK and caches it in memory. So the token is self-sufficient: no
password, no prior web login needed.

### Threat model

To decrypt your data an attacker needs **both**:

1. the token secret, **and**
2. the server's `MASTER_KEY` (env) + the database row.

This is the same two-of-two property as the password path (password +
master key), with the token secret standing in for the password. A stolen
database alone reveals nothing. A stolen token alone (without the server)
reveals nothing.

### Consequences

- **Create tokens from the web app while logged in.** The server needs the
  live DEK to build the envelope. (The UI handles this automatically.)
- **Changing your password does not invalidate tokens.** Each token wraps
  the DEK independently. Revoke tokens explicitly if you rotate access.
- **Legacy tokens** created before this feature have no envelope; they only
  work while the DEK is warm in the cache (i.e. shortly after a web login)
  and otherwise return `423 Locked`. Recreate them to get headless access.

## Session auth (web app only)

The bundled SPA uses an `httpOnly`, `SameSite=Lax` session cookie set at
login. The public `/api/v1` endpoints accept that cookie too (so the web
app could call them), but external clients should always use a Bearer token.

### Surviving restarts (`PERSIST_SESSION_KEY`)

The cookie lasts 30 days, but the DEK lives only in memory, so restarting the
container (e.g. an image update) clears it and the next request returns
`423` — the web app then asks for the password again. That is the strict,
zero-knowledge default.

Set `PERSIST_SESSION_KEY=true` to avoid it. On login the DEK is stored,
wrapped with `MASTER_KEY`, inside the (already `SESSION_SECRET`-encrypted)
cookie; after a restart the server unwraps it from the cookie and refills the
cache without a password prompt. The trade-off: whoever holds both server
secrets (`MASTER_KEY` + `SESSION_SECRET`) can then recover the DEK from a
cookie without the password. Off by default.

## HTTPS

Serve behind HTTPS in production and set `COOKIE_SECURE=true`. Bearer tokens
travel in a header; over plain HTTP they can be sniffed on the network, same
as any password. For a LAN-only instance over HTTP this may be acceptable —
it's your call.

## Error codes

| Status | Meaning |
|--------|---------|
| `401 Unauthorized` | missing/invalid token or session |
| `423 Locked` | valid token but the DEK can't be unlocked (legacy token, needs a web login to warm the cache) |
| `400 Bad Request` | validation error (body/query); details in the response |
| `404 Not Found` | resource doesn't exist or isn't yours |
| `409 Conflict` | e.g. duplicate tag name |
