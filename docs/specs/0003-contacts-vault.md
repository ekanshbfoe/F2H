# 0003. Contacts vault

**Status**: Proposed
**Date**: 2026-10-12
**Mode**: FEATURE · Beta tier (project default) · Tracer Bullet
**Decided by**: Claude during an autonomous run the engineer authorized on 2026-10-12 ("do not pause for architectural, aesthetic or design decisions"). Every call below is a recommendation the engineer may overturn; nothing here is hard to reverse because no migration is involved.

## Summary

Each member keeps their own encrypted address book inside the vault. A contact is one `vault_items` row of kind `contact` with its own data key, exactly like the Admin's recovery note. Contacts are tagged for **Call**, **WhatsApp** or both, and the Contacts screen shows two tabs over the same list. Members can add and edit by hand, or import from the phone's address book with bulk tagging. Search, sorting and duplicate checks all run on the phone over decrypted data, because the server only ever sees ciphertext. No new table, no new Edge Function: everything is the owner's own rows under the existing row level security.

## Requirements

**User stories**:
- As a member, I want my family's important numbers in one encrypted place, split into the people I call and the people I message on WhatsApp.
- As a member, I want to import contacts from my phone once and tag many at a time, instead of typing them.
- As a member, I want to tap a contact and call or open WhatsApp straight away.

**Acceptance criteria**:
- **AC-1**: Home's "Your vault" card opens Contacts. The screen shows two tabs, Call and WhatsApp, each with its count; a contact tagged for both appears in both. Lists sort by name, case and accent insensitive.
- **AC-2**: Add and Edit use one form: name (1 to 80 characters), 1 to 5 phone numbers each with a label, the two channel switches (at least one on), an optional note (up to 500 characters). Invalid input shows the field error and saves nothing. Every number is normalized on save (rule below).
- **AC-3**: The detail screen shows the name, every number with its label, the tags and the note. "Call" opens the dialer with `tel:`; "Open in WhatsApp" opens `https://wa.me/<digits>`. The WhatsApp action is disabled, with a reason, for a number that has no country code.
- **AC-4**: Import asks for the contacts permission; a denial shows an explanation and an "Open settings" button. The phone's contacts load in pages, entries without a number are skipped, and the review list shows each name with its first number and a checkbox. Default tags are Call on, WhatsApp off, changeable for the whole import. Entries whose every normalized number already exists in the vault are marked "Already in your vault" and unselectable. Importing writes the selected contacts in batches with a progress line. The phone's own contact ids are never stored.
- **AC-5**: A search box filters the active tab by name (case and accent insensitive substring) and by number (a run of 3 or more digits matched against the digits of each normalized number).
- **AC-6**: Edit and delete send the row's `version`; a stale version (another phone edited first) re-reads the row and retries once, then reports a conflict. Delete is a soft delete (`deleted_at`), after a confirm.
- **AC-7**: Isolation holds for contacts: a member sees only their own contact rows, a pending device sees none, another member's rows cannot be read, updated or deleted. Proven by pgTAP.
- **AC-8**: The decrypted contacts live only in memory and are dropped on lock, sign out and wipe. Every read and write runs on a copy of the master key through `withKey`, so a lock in the middle never writes under a stale key.
- **AC-9**: The list has loading, empty (with "Add a contact" and "Import from phone"), no search results, and error with retry states. A row that fails to decrypt is skipped and counted in a small notice, never crashes the list.
- **AC-10**: Jest covers the model (normalize, validate, search, dedupe), the api (encrypt round trip, version retry, soft delete), the import mapping, and the list, detail and form screens; pgTAP covers AC-7.

## Decision

Contacts are `vault_items` rows of kind `contact` holding a versioned JSON payload encrypted under a per item data key; the phone holds the decrypted list in a small Zustand store that the lock clears; import reads the address book through the current `expo-contacts` class API; call and WhatsApp use plain URLs.

**Implementation skills**: none.

**Calls made here (recommended items):**
- **Reuse `vault_items`, no migration.** The table, the envelope (`wrapDek`, `encryptItem`), the version guard trigger and the owner policy already exist and are tested. Runner up: a `contacts` table (would leak structure to the server and duplicate every policy).
- **One row per contact.** Edits and conflicts stay per contact; a family address book is a few hundred rows. Runner up: one blob for the whole book (every edit rewrites everything and two phones conflict constantly).
- **Zustand store, not TanStack Query.** The app already uses Zustand for session and lock and has no query client; a store with `load`, `upsert`, `remove`, `clear` is enough and costs no new dependency on a 1 GB phone. Runner up: add TanStack Query (heavier, and its cache would need its own lock wiring).
- **Default country code +91.** The family lives in India (every device row geolocates to Surat), so a bare 10 digit mobile number gets `+91`. Recorded as `DEFAULT_CALLING_CODE` in the model so one line changes it.
- **`https://wa.me/` over `whatsapp://`.** It works whether or not WhatsApp is installed and needs no Android package visibility entry, which Expo Go cannot add.
- **No realtime for contacts.** `vault_items` is not in the Realtime publication (by design, the device header is invisible to Realtime). The list refreshes on screen focus and on pull to refresh.
- **Import cap of 2000 entries, pages of 200.** Keeps memory flat on the LAVA LXX503; the review screen says when the cap was hit.

## Feature design

**Data model**: no schema change. One `vault_items` row per contact: `kind = 'contact'`, `owner_id = auth.uid()`, `dek_wrapped = wrapDek(MK, DEK, id)`, `ciphertext = encryptItem(DEK, JSON, id)`, `version` from the guard trigger, `deleted_at` for soft delete.

**Payload (`v: 1`)**:
| Field | Type | Rule |
|---|---|---|
| `v` | `1` | payload version |
| `type` | `'contact'` | guards against decrypting a note as a contact |
| `name` | string | trimmed, 1 to 80 characters |
| `phones` | `{ number: string; label: string }[]` | 1 to 5; `number` normalized; `label` trimmed, up to 24, default `mobile` |
| `channels` | `{ call: boolean; whatsapp: boolean }` | at least one true |
| `note` | string, optional | up to 500 characters |
| `source` | `'manual' \| 'device'` | how it was created |

**Number normalization** (`normalizePhone`): keep digits and a leading `+`; `00` prefix becomes `+`; a bare 10 digit number starting 6 to 9 gets `+91`; a leading `0` followed by 10 digits drops the `0` and gets `+91`; anything else is kept as typed digits. `isInternational(n)` is true when the result starts with `+` and has 8 to 15 digits. The WhatsApp link uses the digits of an international number.

**State**: `useContacts` (Zustand): `status: 'idle' | 'loading' | 'ready' | 'error'`, `items: Record<id, { id, version, payload }>`, `skipped: number`, `error`, actions `load()`, `save(draft, id?)`, `remove(id)`, `clear()`. `clear()` runs from `useLock.onLock` and on every generation bump.

**API surface** (client side only, `src/features/contacts/api.ts`, all through `withKey`):
| Function | Does | Errors |
|---|---|---|
| `listContacts()` | select own `kind = contact`, `deleted_at is null`, decrypt each, skip failures | `vault_read_failed` |
| `createContact(payload)` | new id, new DEK, insert | `vault_insert_failed` |
| `createContacts(payloads, onProgress)` | inserts in batches of 50 | `vault_insert_failed` (reports how many landed) |
| `updateContact(id, version, payload)` | update with `version`; on `stale_version` re-read the row and retry once with the fresh version and a fresh DEK | `stale_version` after the retry |
| `deleteContact(id, version)` | update `deleted_at = now()` with `version`, same retry | `stale_version` |
| `readDeviceContacts()` (`import.ts`) | permission, `Contact.getAllDetails([FULL_NAME, PHONES], { limit: 200, offset, sortOrder: GivenName })` until a short page or the cap | `permission_denied` |

**Value sourcing**:
| Action | Value produced or displayed | Source |
|---|---|---|
| list | names, numbers, tags | decrypted payloads of the owner's `vault_items` rows (RLS: owner, approved device, active member) |
| list | tab counts | count of payloads with `channels.call` / `channels.whatsapp` |
| list | sort order | `name` with `localeCompare(…, { sensitivity: 'base' })` |
| search | matches | the search text against `name` folded (NFD, marks removed, lower case) and against `digits(number)` when the text holds 3 or more digits |
| form | normalized numbers | `normalizePhone` with `DEFAULT_CALLING_CODE = '91'` |
| detail | call target | `tel:` + the normalized number |
| detail | WhatsApp target | `https://wa.me/` + digits of the normalized number, only when `isInternational` |
| import | candidate list | `Contact.getAllDetails` `fullName` and `phones[].number` / `label` |
| import | "Already in your vault" | every normalized number of the candidate is already a normalized number of a vault contact |
| import | default tags | Call on, WhatsApp off, then the screen's two switches |
| edit/delete | `version` | the `version` column read with the row |
| any write | DEK | fresh `generateDek()` per write; never reused |

**Key invariants**: plaintext never leaves the phone; one DEK per row write, zeroed after use; AAD is the item id (existing envelope); the phone's contact ids never reach the vault; decrypted contacts never touch disk (no AsyncStorage cache); no contact is written while locked.

**Security model**: unchanged row level security: `vault_items_own` (owner, approved device, active member). The Admin gets no contact access here; oversight is Slice 5 through its audited function. The server learns how many contact rows a member has and when they change, which the umbrella already accepts for every item kind.

**Configuration required**: `expo-contacts` installed with `npx expo install` (SDK 57, included in Expo Go). The `expo-contacts` config plugin with `contactsPermission` for the iOS prompt text; Android `READ_CONTACTS` comes from the module.

**Critical test scenarios**:
- Happy path: add "Papa" with `98765 43210`, both tags → saved as `+919876543210`, appears in both tabs; Open in WhatsApp targets `https://wa.me/919876543210`, verifies **AC-1**, **AC-2**, **AC-3**.
- Import: 3 device contacts, one without a number, one already in the vault → review shows 2, one marked existing; import 1 with WhatsApp on → it lands in the WhatsApp tab, verifies **AC-4**.
- Conflict: update with a stale version → re-read and retry succeeds; a second stale answer → conflict message, verifies **AC-6**.
- Isolation: a second member and a pending device read zero contact rows of the first member; a stale version update is refused, verifies **AC-7**.
- Lock: lock while the list is open → the store is empty; unlock → it loads again, verifies **AC-8**.

## Build plan

Tracer Bullet: one contact travels from the form through the envelope to the database and back into the list first; then import, search and conflicts thicken it.

1. [ ] `src/features/contacts/model.ts`: payload schema (zod), `normalizePhone`, `isInternational`, `whatsappUrl`, `telUrl`, `foldName`, `matchesSearch`, `isDuplicate`, `sortContacts`; jest, satisfies **AC-2**, **AC-3**, **AC-5**.
2. [ ] `api.ts` and `store.ts`: list, create, update and delete with the version retry and soft delete, the store cleared on lock; jest; pgTAP `0005_contacts.test.sql`, satisfies **AC-6**, **AC-7**, **AC-8**.
3. [ ] Screens: list with the two tabs, counts, search and states; detail with Call and WhatsApp; the add and edit form; Home link; routes under `src/app/(app)/contacts/`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-9**.
4. [ ] `import.ts` and the import screen: permission, paged read, mapping, dedupe, bulk tags, batched insert with progress; config plugin, satisfies **AC-4**.
5. [ ] Jest for the screens and the import mapping; verify steps appended to the umbrella `verify.md` section for this spec, satisfies **AC-10**.

## Consequences

**Positive**:
- No server change at all: the existing policies, envelope and version guard carry the feature.
- The model and store pattern is the template Credentials (Slice 3) will copy.

**Negative / tradeoffs**:
- Search and dedupe decrypt the whole book on the phone; fine for hundreds of rows, slow past a few thousand.
- No live sync between two phones of one member: the second phone sees changes on its next focus or pull.
- The +91 default is wrong for a contact abroad typed without a country code; the WhatsApp button then explains why it is disabled.

**Neutral**:
- The server keeps seeing the item kind and counts, as for every vault item.

## Follow-up

- [ ] Slice 3 (credentials) should lift `withKey` reads and the version retry into a shared `src/features/vault/items.ts` once a second kind uses them.
- [ ] Slice 5 oversight must decrypt contact payloads with this schema; keep `v: 1` readers when `v: 2` comes.
- [ ] An offline read only cache (umbrella Phase 9) would store these ciphertext rows, never the decrypted store.

## Rationale

**Context**: Slice 2 of the scope. The umbrella spec already fixed contacts as vault items with a per item DEK, the import from `expo-contacts` with bulk tagging, and the `whatsapp` deep link (Section 2 and the data model). What was open: the payload shape, number normalization, where decrypted data lives, how search works over ciphertext, import limits on a 1 GB phone, and the WhatsApp URL form.

**Options considered**:
1. Vault items with client side state, search and dedupe (chosen). Pros: zero knowledge kept, no server work, reuses tested parts. Cons: whole book decrypted on the phone.
2. A searchable blind index (HMAC of name prefixes and number digits stored beside each row). Pros: server side search. Cons: leaks equality and prefix patterns, and adds a migration for a book of a few hundred rows that the phone searches instantly anyway.
3. A single encrypted address book blob. Pros: one read. Cons: every edit rewrites everything, two phones conflict constantly, one corrupt write loses the whole book.

**Rationale**: option 1 keeps the zero trust promise, costs no schema change, and stays fast at family scale. The rest are local calls recorded above with their runner up.
