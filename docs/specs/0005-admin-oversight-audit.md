# 0005. Admin oversight and audit

**Status**: Proposed
**Date**: 2026-10-12
**Mode**: FEATURE · Beta tier (project default) · Tracer Bullet
**Decided by**: Claude during the autonomous run the engineer authorized on 2026-10-12. Every call below is a recommendation the engineer may overturn.

## Summary

The Admin can open any member's vault read only, through the recovery key the umbrella design already seals every master key to. Each open goes through one Edge Function that writes an audit row and pushes the member ("The Admin opened your vault"), so oversight is never silent. Every member gets an Activity screen over `audit_log` (their own rows; the Admin sees all), the Admin can sign out any member's phone from Members, and the vault lists fall back to a read only copy of their ciphertext when the phone is offline.

## Requirements

**Acceptance criteria**:
- **AC-1**: Members → a member → "Open vault (logged)" asks for confirmation that says the member will be told, then calls `oversight-open`. Only the Admin on an approved phone reaches it (403 otherwise); the Admin cannot "oversee" their own vault.
- **AC-2**: `oversight-open` writes `oversight.open` (actor Admin, target member, counts per kind) before it returns anything, pushes the member, and returns the member's `mk_wrapped_admin`, `mk_verifier` and live vault rows (id, kind, version, dek_wrapped, ciphertext).
- **AC-3**: The Admin phone unseals the member master key with the recovery secret from its own vault note, checks the verifier (a failed check shows "key material tampered" and decrypts nothing), decrypts the rows with the contact, credential and file parsers, then zeroes the member key and the recovery secret.
- **AC-4**: The oversight screen shows the member's contacts, credentials and file names in three tabs, read only (no add, edit, delete or import). Credential secrets stay masked until Reveal, as in spec 0004. Files show name, size and date only (opening a member's file is out of scope). The decrypted data lives in screen state only and is dropped on leaving the screen and on lock.
- **AC-5**: Home → Activity lists the newest 100 audit rows the caller may see (RLS: own as actor or target; the Admin all), newest first, each with a plain label ("The Admin opened your vault", "Phone approved", "Signed out by the Admin" …), the time and the device model when known. A member sees the oversight rows about them.
- **AC-6**: Members → a member's devices → "Sign out this phone" on an approved device calls `admin_revoke_device` after a confirm; the row becomes `revoked` and the list updates; the Admin's own current phone has no such button.
- **AC-7**: Contacts, credentials and files keep a local copy of the ciphertext rows they last loaded (SQLite, never plaintext). When the list request fails, the screen shows that copy with an "Offline, read only" banner and disables add, edit, delete and import; the next successful load replaces the copy. The copy is erased by `wipeLocalState`.
- **AC-8**: pgTAP proves audit visibility (a member sees only rows about them, the Admin sees all) and that members cannot insert audit rows; jest covers the oversight decrypt (good wrap, tampered verifier), the action labels, the offline fallback and the screens.

## Decision

One audited Edge Function hands the Admin a member's sealed wrap and ciphertext; the Admin phone decrypts with the recovery key and shows it read only; Activity reads `audit_log` under the existing policies; device sign out reuses `admin_revoke_device`; the offline copy is a ciphertext only SQLite cache inside the shared vault items module.

**Implementation skills**: none.

**Calls made here (recommended items):**
- **A function, not an RPC, for the open.** It must write the audit row and send a push in one place, and it needs every member row regardless of RLS. Runner up: an RPC plus a client side push (the push could be skipped by a modified client).
- **Audit before data.** If the audit insert fails, nothing is returned.
- **Files metadata only.** `drive-download-token` serves owners only; extending it to the Admin is a second audited path, left for later.
- **Ciphertext only cache in SQLite (`expo-sqlite`, in Expo Go).** The rows are already encrypted under the member key, so the cache adds no plaintext at rest; AsyncStorage would struggle with hundreds of rows. Runner up: no offline mode (the scope asks for it).
- **100 newest audit rows, no paging yet.** A family of four produces a few rows a day.

## Feature design

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `functions/v1/oversight-open` | POST | `member_id` | `mk_wrapped_admin`, `mk_verifier`, `items[]` | `requireAdmin` | 400 `bad_member`, 400 `own_vault`, 404 `member_not_found`, 500 `audit_failed` |
| `rpc/admin_revoke_device` (existing, 0012) | POST | `p_device_id` | `revoked` | Admin + approved device | `not_other_device`, `device_not_approved` |
| `audit_log` select (existing RLS) | GET | newest 100 | rows | JWT | none |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| oversight | member MK | `box.open(recovery secret, mk_wrapped_admin)`; recovery secret from `loadRecoverySecretKey(admin MK)` |
| oversight | proof the MK is right | `verifier.check(mk, member id, mk_verifier)` |
| oversight | items | `openItem(member MK, row, parser)` per kind |
| push to member | body | fixed text plus the Admin's display name |
| activity | label | a fixed map from `action` to text; unknown actions show the raw name |
| activity | device model | `meta.model` when present |
| sign out | target | `member_devices_view` rows with `status = approved`, not the current device |
| offline | rows shown | SQLite `items_cache` rows for the kind, written after the last successful load |

**Data**: no migration. Local SQLite database `f2h-cache.db`, table `items_cache (owner_id text, kind text, id text, version int, dek_wrapped text, ciphertext text, primary key (owner_id, id))`.

**Key invariants**: no oversight data without an audit row; the member key and the recovery secret are zeroed after decrypting; oversight is read only in the UI; the cache holds ciphertext only and is erased on wipe; members never see other members' audit rows.

**Security model**: unchanged policies. The new function runs with the service role after `requireAdmin` and reads only the named member's rows.

## Build plan

1. [ ] `oversight-open` function and the client `openMemberVault` (unseal, verify, decrypt, zero); jest, satisfies **AC-1**, **AC-2**, **AC-3**.
2. [ ] Oversight screen with three read only tabs and the shared secret row; entry on Members with the confirm, satisfies **AC-1**, **AC-4**.
3. [ ] Activity screen with labels; Home link; device sign out on Members; pgTAP `0008_audit_visibility.test.sql`, satisfies **AC-5**, **AC-6**, **AC-8**.
4. [ ] Ciphertext cache in `vault/items.ts`, offline flag in the three stores, banners and disabled actions; erased by `wipeLocalState`, satisfies **AC-7**.
5. [ ] Screen jest and the verify steps, satisfies **AC-8**.

## Consequences

**Positive**: oversight is always visible to the member; the family audit trail becomes readable; phones keep working read only on a bad connection.
**Negative**: the Admin phone holds a member's decrypted vault in memory while the oversight screen is open; the offline copy can be up to one load stale.
**Neutral**: the server learns when the Admin looked, which is the point.

## Follow-up

- [ ] Admin download of a member's file through an audited extension of `drive-download-token`.
- [ ] Paging in Activity once rows exceed a few hundred.

## Rationale

**Context**: the umbrella spec (Section 4, "Admin oversight") fixed the mechanism: the recovery private key unseals `mk_wrapped_admin`, every open is audited and pushed, browsing is read only. Open were the transport, the UI scope, the audit presentation and the offline cache.

**Options considered**:
1. Audited function plus phone side decrypt (chosen).
2. Server side decrypt. Rejected: the server would need the recovery key, which breaks zero knowledge.
3. Reuse `admin_key_material_for_approval` and read rows from the phone. Rejected: the Admin has no RLS path to member rows, and the push would be client side.

**Rationale**: option 1 is the only one that keeps keys off the server and makes the audit and push unavoidable.
