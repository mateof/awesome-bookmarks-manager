# Encryption and sharing

What is encrypted, with which key, and what that does and does not protect you
from. Written for whoever runs the instance or reads the code; the end-user
view of sharing lives in [guia-usuario.md](./guia-usuario.md).

The short version: **content is encrypted at rest, not end-to-end**. The server
decrypts to answer your requests, because it is the thing rendering your
bookmarks. What at-rest encryption buys you is that the database file alone,
without keys derived from somebody's password, is not readable.

---

## The keys

Five kinds, each solving a different problem.

| Key | Where it lives | Protects |
|---|---|---|
| `MASTER_KEY` | environment variable | wraps envelopes so a stolen database alone is useless |
| User **DEK** | derived from the password (Argon2id), cached in memory | everything personal |
| User **keypair** (X25519) | public in the clear, private sealed with the DEK | receiving a group key while offline |
| **Group key** | sealed to each member's public key | the group's own membership, and the scopes it holds |
| **Scope key** | sealed with the key of each group that may read it | one shared item, across any number of groups |

Personal content is sealed field by field with the owner's DEK, with the AAD
bound to `<userId>|<field>` so a blob cannot be moved between fields or between
accounts. `MASTER_KEY` never encrypts content directly; it wraps envelopes (the
password-derived envelope, an API token's copy of the DEK, a passkey's copy).

Losing `MASTER_KEY` loses everything. Losing a password loses that user's
content: there is no reset, by design.

## Why user keypairs exist

To put a group key into somebody's hands you need to encrypt it *to* them, and
they are usually not online when you do it. A keypair solves exactly that: seal
to the public half, and only the private half opens it.

The obvious alternative, generating a shared secret at invitation time and
sending it along, puts a live key in an email, a URL and a log file. Nothing
secret travels here: the invitation carries an id, and the sealed key sits in a
row that is useless to anybody but its recipient.

Each seal uses a throwaway sender keypair (the classic ECIES shape, the one
`age` uses), so two seals of the same key to the same person share nothing and
cannot be correlated by looking at the table.

Accounts created before keypairs existed get one on their next authenticated
request, which is the only moment the server holds their DEK and can seal the
private half.

## Group keys

A group has a 256-bit key, **sealed to each member's public key**, one row per
`(group, member, key version)`.

Version 1 of this wrapped the group key with `MASTER_KEY` alone, which meant
anybody holding the database and that env var could read every group's shared
content. That is no longer the case, with one deliberate exception.

### The recoverable exception

A group may opt into `recoverable`, which additionally keeps a
`MASTER_KEY`-wrapped copy. That is a trade the group makes explicitly:

- **off** (the default): if every member forgets their password, the group's
  content is gone. The server cannot open it.
- **on**: recoverable by whoever holds the server, which is also what makes it
  readable by them.

There is no third option, and pretending otherwise would be dishonest: a key
the server can use to rescue you is a key the server can use.

### Reading what an older release wrote

The master-wrapped copy exists in two shapes, because its meaning changed:

| AAD | Written by | Meaning then |
|---|---|---|
| `group\|<id>` | up to v0.77 | the *only* copy of the key |
| `master\|<id>` | v0.78 onwards | the recoverable extra copy |

Both are opened on read, oldest first, since the old shape is the one an
upgraded instance is full of. Reading only the current shape made every group
created before v0.78 unopenable, which surfaced as "Unsupported state or unable
to authenticate data" the moment anybody shared into one. Writes use one shape.

The general form of that mistake is worth naming, because it has now caused two
production incidents: **a fresh install never exercises the upgrade path.** The
end-to-end suite starts from an empty data directory, so it only ever handles
rows sealed the way the current version seals them. Tests that seed the *old*
shape and then operate on it are the only ones that cover the case anybody with
existing data actually hits (`groups/__tests__/legacyShare.test.ts`,
`db/__tests__/bootstrap.migration.test.ts`).

## Key scopes: content shared with more than one group

Sealing shared content with the *group's* key works until the same item is
shared with a second group. A key cannot be narrowed to a subset, so handing
group B the key of group A would hand B everything A owns.

So a shared item gets a **key of its own**, and every group that may read it
holds that key wrapped with theirs:

    key_scopes(id)
    key_scope_grants(scope_id, group_id, wrapped_key, group_key_version)
    folders/bookmarks/databases.key_scope_id

Two consequences worth knowing:

- **Widening the audience is cheap.** Adding a group is one small row. The
  content's key does not change, so nothing is re-encrypted however large the
  folder is.
- **Rotating a group's key re-wraps its grants** rather than re-encrypting the
  content. Without that step, rotation would quietly cut the remaining members
  off from everything shared with them through a scope.

When somebody can reach a scope through several groups, the level that applies
is the **best** one they hold. Taking the worst would mean joining a read-only
group silently removed write access they already had elsewhere.

`key_group_id` is the older mechanism, kept for content shared before scopes
existed. It is promoted to a scope the first time that content is shared again.

## Shared content belongs to the group

Every folder, bookmark and database row says which key seals it:

- **neither column set** — sealed with its owner's DEK. The normal case.
- **`key_scope_id`** — sealed with a scope key, which any number of groups may
  hold. This is what sharing does today.
- **`key_group_id`** — sealed with one group's own key. The older mechanism,
  described above.

A member with the key reads and writes those rows through the ordinary
endpoints. That is the whole point: an editor is not given an imitation of the
owner's capabilities, they are given the same rows.

Which is why they also get the ordinary **pages**. A shared folder opens at
`/folder/<id>` like any other, with the breadcrumbs, tags, attachments and view
modes that live there. `/shared/<shareId>` resolves to the row and hands over.

The reduced screen that used to render a share is kept for one case only:
shares made before key scopes, whose content never was anything but a
materialised copy and so has no row to open. `GET /shared/:id/source` says
which case a share is, and it is deliberately a separate endpoint from the one
returning the payload, because that one is also read by the linked-folder
portal and by drag-and-drop.

What the split cost while it lasted is worth recording: every feature had to be
built twice, so in practice it was built once. The reduced page never grew tags
or attachments. The reverse also bit, and harder — the ordinary page had no
notion of a viewer, because until this change nobody but the owner opened it.
Sending viewers there meant teaching it to read `canWrite`, which is the same
authority the server enforces rather than a second opinion about it.

What this replaced: a materialised copy of the owner's content sealed for the
group, plus a queue of edits waiting for the owner to log in so they could be
replayed into the owner's rows. That queue existed only because the two sides
were sealed with different keys.

### Databases are shared on their own

A database carries its own key scope rather than inheriting one from a note.
The same table can be embedded in several folders and bookmarks, and those are
not necessarily shared with the same people, so inheriting would give the wrong
answer as soon as there are two.

Sharing a folder does drag in the databases its notes embed, or the notes would
arrive with holes; each is marked separately.

## Permission levels

Five, each strictly containing the one below:

| Level | Adds |
|---|---|
| `viewer` | read |
| `editor` | change the content |
| `admin` | grant and revoke `viewer` and `editor` |
| `super` | grant and revoke `admin` and `super` |
| `owner` | cannot be removed by anybody |

The rule that holds it together: **you may only act on somebody strictly below
you**, and you may never grant your own level. Without that, two admins can
remove each other, and granting a peer creates somebody you can no longer
manage.

### Where the cryptography stops

Holding the group key lets you **decrypt**. Everything above that line is
authorisation the server enforces, not mathematics:

- A `viewer` holds the same key an `editor` does. What stops them writing is a
  check in `groups/roles.ts`, not their key.
- Read/no-read is the only boundary the encryption itself draws.

This is normal for any system with permission tiers, and worth stating so
nobody assumes the key is doing more than it does.

## The one mistake this design keeps inviting

Reading or writing a sealed field with `ctx.dek` instead of the row's key. It
has now caused four separate bugs, so it is worth stating as a rule rather than
leaving it to be rediscovered:

> **Every field of an entity row goes through `openRowField` / `sealRowField`.**
> `openField(ctx.dek, …)` is for things that belong to a *user* and never to a
> group: the TOTP secret, the private half of the keypair, saved searches.

What makes it easy to get wrong is that sharing does **not** change who owns a
row. `user_id` still points at the person who made it, so a query filtered by
owner still returns the row and the code still runs. It just cannot open what
it selected, because the ciphertext moved to a scope key underneath it.

It surfaces two ways, and the second is the dangerous one:

- **Loudly**, as `Unsupported state or unable to authenticate data`. That is
  AES-GCM refusing to authenticate, and it reads like a network or browser
  problem when it reaches the user as "could not capture the snapshot".
- **Silently**, when the failure is caught, or when the *write* side is wrong.
  A row inserted into a shared folder without inheriting its key is perfectly
  readable by its owner and invisible to the group. Nobody reports that,
  because nobody can see it.

Writing with the wrong key is worse than reading with it: a read fails and
stops, a write leaves a row whose fields sit under two different keys, and then
nobody can read it, owner included.

The conversion to row keys was done field by field, which is why the fields
nobody happened to exercise kept the old call for several releases: the URL of
a bookmark went through the row key while its title did not. When touching a
handler, check every field it opens, not the one in the bug report.

## Rotation

Removing somebody from a group replaces the key: a new version is generated,
sealed for the members who remain, and the group's content is re-encrypted with
it. The removed member's sealed copies are deleted.

Three properties worth knowing:

**It protects the future only.** Whoever was removed had the old key and may
have kept a copy of what they could already see. Nothing can undo that, and a
scheme claiming otherwise is lying.

**Changing somebody's level does not rotate.** Demoting an editor to viewer
changes nothing they could already decrypt, so rotating would re-seal every row
for no gain. Rotation is the expensive part of the scheme, and only losing
*read* access triggers it.

**The server cannot rotate by itself**, because by design it does not hold the
key. Rotation happens inside the request of whoever performs the removal, which
means removal completes while an authorised member is present.

Re-sealing runs inline rather than as a background job. A queued rotation leaves
a window where the removal has been reported as done and the content is still
readable by the person removed, and that window is precisely what somebody being
removed would try to use.

## Deliberate exposures

Two places where content is readable without a user's key, both on purpose and
both scoped:

- **Public panels** materialise a decrypted snapshot of a folder subtree sealed
  with `MASTER_KEY`, so the page renders for visitors who are not logged in.
  Per panel, and only of what that panel publishes.
- **Recoverable groups**, as described above.

Embedded databases are flattened into a static table inside those payloads,
because the reader has no session to query with. Hidden columns stay hidden and
reference columns are omitted, since they point at content the reader cannot
open anyway.

## The browser holds plaintext too

The server decrypts to answer a request, so what reaches the browser is
plaintext, and the query cache keeps it for as long as the tab lives. That is
what makes the app usable; the rule it imposes is that **the cache belongs to
the session, not to the tab**.

Concretely: signing in or out drops every cached answer, and the identity is
watched so a session that changes any other way is caught too. Without that,
logging out and back in as somebody else showed the previous account's folder
names, because a cache keyed by query has no idea the account changed.

The clearing is deliberately total rather than a list of user-scoped keys. Such
a list is wrong the first time a query is added without reading this page, and
the cost of over-clearing is refetching a couple of public config calls.

One thing it does not do: a 401 on its own clears nothing. That fires for
visitors with no session at all, on every public panel, and clearing there would
cancel the request the page is waiting on.

## Where to look in the code

| Concern | File |
|---|---|
| AES-GCM, key wrapping | `packages/crypto/src/aead.ts`, `keys.ts` |
| X25519 sealing | `packages/crypto/src/asymmetric.ts` |
| Per-user keypairs | `apps/api/src/auth/userKeys.ts` |
| Group keys, rotation | `apps/api/src/groups/keys.ts` |
| Re-sealing after rotation | `apps/api/src/groups/reseal.ts` |
| Handing content to a group | `apps/api/src/groups/adopt.ts` |
| Which key opens a row | `apps/api/src/groups/scope.ts` |
| Permission levels | `apps/api/src/groups/roles.ts` |
| Session-scoped browser cache | `apps/web/src/auth.tsx` |

See also [authentication.md](./authentication.md) for how API tokens and
passkeys get a copy of the user's DEK without a password.
