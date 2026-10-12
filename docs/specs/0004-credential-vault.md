# 0004. Credential vault

**Status**: Proposed
**Date**: 2026-10-12
**Mode**: FEATURE · Beta tier (project default) · Tracer Bullet
**Decided by**: Claude during the autonomous run the engineer authorized on 2026-10-12. Every call below is a recommendation the engineer may overturn; no migration is involved.

## Summary

Each member stores bank logins, email accounts and other secrets as encrypted vault items of kind `credential`, built exactly like contacts (spec 0003). Secrets are masked until the member taps Reveal, re-mask after 30 seconds, and a copied secret is wiped from the clipboard after 30 seconds or on lock. A password generator uses the phone's secure random source. The shared item code (seal, open, list, version retry, soft delete) moves into `src/features/vault/items.ts`, as the contacts spec asked when a second kind arrived.

## Requirements

**User stories**:
- As a member, I want my bank and email logins in one encrypted place, grouped by type, that I can search quickly.
- As a member, I want to reveal or copy a password without it lingering on screen or in the clipboard.
- As a member, I want a strong password made for me when I open a new account.

**Acceptance criteria**:
- **AC-1**: Home's "Your vault" card opens Credentials. The list groups items into Bank, Email and Other sections with counts, each sorted by title (case and accent insensitive). Search matches the title, the username and the website host, never a password or a secret field.
- **AC-2**: Add and Edit use one form: type (Bank, Email, Other), title (1 to 80), username (up to 200), password (up to 256), website (up to 300, `https://` added when no scheme is typed, only `http` and `https` accepted), up to 8 extra fields (label up to 40, value up to 500, a Secret switch), and a note (up to 1000). At least one of username, password or an extra field value is required. A new Bank item starts with empty "Customer ID" and "Account number" extra fields.
- **AC-3**: The generator makes a password of 12 to 64 characters (default 20) from the enabled sets (lower, upper, digits, symbols; at least one on), with at least one character from each enabled set, using unbiased rejection sampling over `expo-crypto` random bytes. It shows the strength in bits (`length × log2(alphabet size)`) and fills the password field on "Use this password".
- **AC-4**: On the detail screen the password and every Secret field show as 8 dots (never their real length) until Reveal; a revealed value masks itself again after 30 seconds and when the screen loses focus. Copy puts the value on the clipboard and clears it 30 seconds later if the clipboard still holds that value; a lock clears it at once. The screen says "Copied. Clears in 30 seconds."
- **AC-5**: The detail and form screens hold their own screenshot block key on top of the app wide one (spec 0002 AC-9), so screenshots stay blocked even if the app wide hold were released.
- **AC-6**: Edit and delete send the row's `version` with one automatic retry on `stale_version`; delete is a soft delete after a confirm. Same helper as contacts.
- **AC-7**: Isolation holds for credentials: a member sees only their own credential rows, a pending device sees none, and the server stores only ciphertext. Proven by pgTAP.
- **AC-8**: The decrypted credentials live only in memory, are dropped on lock, sign out and wipe, and every read and write goes through `withKey`.
- **AC-9**: Loading, empty (with "Add a credential"), no search results, and error with retry states; a row that fails to decrypt is skipped and counted.
- **AC-10**: Jest covers the model, the generator (length, sets, distribution sanity, no modulo bias), the clipboard timer, the shared items module, and the list, detail and form screens; pgTAP covers AC-7; the contacts suites stay green after the refactor.

## Decision

Credentials are `vault_items` rows of kind `credential` holding a versioned JSON payload under a per item data key, read and written through a new shared `vault/items.ts` that contacts also moves onto; the decrypted list sits in a Zustand store the lock clears; reveal and clipboard exposure are time boxed to 30 seconds; the generator samples the phone's secure random source without bias.

**Implementation skills**: none.

**Calls made here (recommended items):**
- **Shared items module now.** Two kinds share seal, open, list, version retry and soft delete; one tested copy beats two. Runner up: copy the contacts api (drifts).
- **Fixed 8 dot mask.** Showing the real length leaks it to a shoulder surfer. Runner up: a length matched mask.
- **30 second reveal and clipboard windows.** Long enough to type a password into another app, short enough not to linger. Runner up: 60 s (the scope says 30 s).
- **Clipboard cleared only when it still holds our value.** Never wipes something the member copied afterwards. Limitation recorded: Expo Go cannot mark clipboard content as sensitive, so Android 13+ may show it in the system preview; an EAS build can add that flag later.
- **Website host only in search.** The host identifies the account; paths can carry tokens.
- **No passphrase mode yet.** A character password covers bank and email rules; a word list mode can follow.

## Feature design

**Data model**: no schema change. One `vault_items` row per credential: `kind = 'credential'`, envelope as in spec 0003.

**Payload (`v: 1`)**:
| Field | Type | Rule |
|---|---|---|
| `v`, `type` | `1`, `'credential'` | version and kind guard |
| `category` | `'bank' \| 'email' \| 'other'` | the section |
| `title` | string | trimmed, 1 to 80 |
| `username` | string, optional | up to 200 |
| `password` | string, optional | up to 256, never trimmed |
| `url` | string, optional | normalized to `https://` when no scheme, `http(s)` only, up to 300 |
| `fields` | `{ label, value, secret }[]` | up to 8; rows with an empty value are dropped |
| `note` | string, optional | up to 1000 |

**Shared items module** (`src/features/vault/items.ts`): `sealItem`, `openItem`, `listItems(kind, parse)`, `createItems(kind, payloads, onProgress)`, `updateItem(id, version, payload)`, `softDeleteItem(id, version)`, `VaultItemError` (codes as `ContactsError` today). Contacts keeps its public api by delegating.

**Clipboard service** (`src/services/clipboard.ts`): `copySecret(value, ms = 30000)` sets the string, remembers it, schedules a clear that checks `getStringAsync() === value` first; `clearSecretClipboard()` runs the same check at once and is called from a lock generation subscription.

**Generator** (`src/features/credentials/generator.ts`): sets `lower = a-z`, `upper = A-Z`, `digits = 0-9`, `symbols = !#$%&*+-=?@^_~`; one character from each enabled set first, the rest from the union, then a Fisher Yates shuffle, every index drawn by rejection sampling from `randomBytes` so no value is favoured.

**Value sourcing**:
| Action | Value produced or displayed | Source |
|---|---|---|
| list | sections, counts, titles, usernames | decrypted payloads of the owner's credential rows |
| search | matches | the query folded against `title`, `username` and the host of `url` |
| form | normalized website | `normalizeUrl` (scheme added, `http(s)` only) |
| form | Bank starter fields | "Customer ID" and "Account number" with empty values, only on a new Bank item |
| generator | characters | `randomBytes` from `@/crypto` through rejection sampling |
| generator | strength | `length × log2(size of the enabled union)` rounded down |
| detail | mask | the constant `••••••••` |
| detail | reveal window | 30 s timer per field, cancelled on blur and unmount |
| clipboard | clear | 30 s timer, and on every lock generation bump, only if the clipboard still equals the copied value |
| edit, delete | `version` | the `version` column read with the row |

**Key invariants**: plaintext never leaves the phone; a fresh DEK per write; the mask never reveals length; no credential value is ever logged or put in a test ID or accessibility label; search never reads secret values.

**Security model**: unchanged row level security (`vault_items_own`). The Admin gets no credential access here (oversight is Slice 5).

**Configuration required**: none (`expo-clipboard` is already installed).

**Critical test scenarios**:
- Happy path: add a Bank item with username, generated password and an account number → it appears under Bank; detail masks both secrets; Reveal shows them; after 30 s they mask again, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
- Clipboard: Copy → clipboard holds the value → 30 s later it is empty; copy, then copy something else in another app → the timer leaves the newer value alone; lock → cleared at once, verifies **AC-4**, **AC-8**.
- Generator: 1000 passwords of length 20 with all sets → every one has each class; symbols only → every character is a symbol, verifies **AC-3**.
- Isolation: a second member reads zero credential rows of the first; a pending phone reads none, verifies **AC-7**.

## Build plan

1. [ ] `src/features/vault/items.ts` with tests; contacts api delegates to it with its suites still green, satisfies **AC-6**, **AC-10**.
2. [ ] `model.ts` (payload schema, form schema, `normalizeUrl`, `hostOf`, search, sections), `generator.ts`, `src/services/clipboard.ts`, `store.ts`; jest; pgTAP `0006_credentials.test.sql`, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-7**, **AC-8**.
3. [ ] Screens: list with sections and search, detail with reveal and copy, form with extra fields and the generator; routes under `src/app/(app)/credentials/`; Home link, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-9**.
4. [ ] Screen jest and the verify steps in the umbrella `verify.md`, satisfies **AC-10**.

## Consequences

**Positive**: no server change; one shared item module for every later kind (files metadata, notes).

**Negative / tradeoffs**: no sensitive clipboard flag in Expo Go; search cannot find text inside the note (kept out on purpose, notes often hold secrets).

**Neutral**: the server keeps seeing item kinds and counts, as before.

## Follow-up

- [ ] EAS build: set the Android `ClipDescription.EXTRA_IS_SENSITIVE` flag on copied secrets (needs a config plugin or a native module).
- [ ] Optional passphrase generator from the BIP39 word list.
- [ ] Slice 5 oversight reads this schema; keep `v: 1` readers.

## Rationale

**Context**: Slice 3 of the scope; the umbrella fixed credentials as vault items, the 30 s clipboard clear and the screenshot protection. Open were the payload shape, reveal behaviour, the generator construction and code sharing with contacts.

**Options considered**:
1. Vault items with the shared module, time boxed reveal and clipboard (chosen). Pros: no server change, one tested envelope path. Cons: the clipboard flag limit in Expo Go.
2. A separate encrypted blob per category. Pros: fewer rows. Cons: conflicts and whole blob rewrites, as rejected for contacts.
3. Keep secrets out of the list payload in a second encrypted field decrypted only on Reveal. Pros: less plaintext in memory while browsing. Cons: two ciphertexts per row and a second DEK path for a few dozen items; the list already holds the master key in memory while unlocked, so the gain is small.

**Rationale**: option 1 reuses everything proven in Slices 1 and 2 and keeps the exposure windows short; option 3 can be revisited if the vault grows large.
