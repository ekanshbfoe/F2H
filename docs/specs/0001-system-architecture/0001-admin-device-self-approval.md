# 0001 child: Admin device self approval

Part of [0001 system architecture](index.md). Extends [0001-account-and-device-gate](0001-account-and-device-gate.md) (feature 6) and the wipe paths of [0002 App lock](../0002-app-lock/index.md). GA tier. Written 2026-10-08, revised the same day after a cross model check.

## Summary

Today the Admin's phone is approved only on the very first run. Once that phone is wiped (Forgot PIN, ten wrong PINs, a revoke) or lost, a fresh login lands on the waiting screen and nobody is left to tap Approve: a deadlock that happened on 2026-10-08 during verification. This spec lets the Admin approve their own new phone by proving they hold the paper recovery kit (the 24 words printed at first run). The server sends a one time public key; the phone combines it with the recovery key into a short answer only the kit holder can produce, and the phone never decrypts anything, so the proof cannot be turned against the members' sealed keys. The success step lets the Admin sign out any other admin phone (the lost one), and the Forgot PIN confirm warns when the phone being wiped is the only approved admin phone.

## Requirements

**User stories**:
- As the Admin, I want to get back into F2H on a new or wiped phone with my password and my paper kit, without a second admin phone.
- As the Admin, I want to sign out a lost phone in the same step, so whoever has it cannot act before I do.
- As the Admin, I want a clear warning before I wipe my only approved phone, so I know the kit is about to become necessary.

**Acceptance criteria**:
- **AC-1**: When the Admin's registration lands `pending` and `family_config.admin_recovery_pubkey` is published, the waiting screen shows a "Use my recovery kit" card: the main action when the Admin has no other approved device, a secondary "Can't reach your other phone?" link when one exists. Members never see it. If the published key cannot be fetched (offline), the card is disabled with a retry.
- **AC-2**: The phone takes the 24 words first and checks them locally, then calls `self-approve-device` with `step = challenge`. The function creates an ephemeral X25519 keypair, computes the expected tag (design below), stores only `sha256(tag)` and a 10 minute expiry on the pending row, discards the ephemeral secret, and returns `eph_pub` and `expires_at`. A new call replaces an open challenge; at most 5 challenges per pending row. A caller that is not the Admin on their own `pending` device gets 403.
- **AC-3**: The words are entered in 24 numbered boxes with suggestions from the BIP39 word list, pasting a whole line fills all 24, the clipboard is cleared after a paste, and the boxes disable autocorrect, autofill and keyboard learning. A failed checksum, or a derived public key that differs from the published `recovery_pub` bytes, is reported on the phone with no network call. The seed, the derived secret key and the word state are zeroed or cleared on every outcome and on unmount.
- **AC-4**: `step = answer` with the right tag before the expiry sets the device `approved` in one transaction (`pending` checked under a row lock, `decided_by` = the Admin, `decided_at` = now, `profiles` untouched), optionally revokes every other admin device in the same transaction when the phone asked for it, writes `device.self_approve`, and returns `status = approved`. The phone shows the success step first, then runs the normal post approval key release (gate spec AC-12) to Set PIN; after a cold start (KEK gone) the success step still runs and the phone then returns to login.
- **AC-5**: A wrong tag increments `challenge_attempts`, which survives a re-issued challenge; an expired challenge is never a miss. The third wrong tag sets the device `rejected`, writes `device.self_approve_failed`, and the phone wipes exactly as for an Admin rejection (gate spec AC-13). The counter is per pending row; a new login starts a new row at zero (bounded in practice by the 256 bit tag, stated here so nobody relies on the counter).
- **AC-6**: The success step reads the Admin's other approved devices itself (model, name, last seen) and offers "Sign out that phone" through `admin_revoke_device`, which revokes an `approved` device of any member, refuses the caller's own current device, writes `device.revoke`, and leaves the revoked phone to wipe on its next foreground (spec 0002 AC-10). Other admin phones receive a push "Your admin account was recovered with the paper kit on <model>".
- **AC-7**: On the Admin's only approved device, the Forgot PIN confirm (spec 0002 AC-6) shows the "only approved admin phone" warning before the wipe. The count includes this device, comes from one shared helper cached on the phone, is written only for the admin role, is removed by `wipeLocalState`, and a missing or 1 or lower value shows the warning.
- **AC-8**: The first run auto approve (public key not yet published, no device rows) and the Approvals inbox path stay as they are. `decide_device`, `answer_admin_challenge`, `cancel_my_device` and the expire cron all leave the challenge columns null because a trigger clears them whenever status leaves `pending`. A concurrent Approve and a self approval of the same row cannot both succeed. An Admin registration may replace a foreign pending row of the same account (the old row becomes `expired` with `device.replaced`), so a password holder cannot hold the single pending slot.
- **AC-9**: pgTAP covers both RPCs, the trigger on the expire and cancel paths with an open challenge, and the replace path; a Deno test proves the server tag equals the client tag for fixed vectors; jest covers the word entry, the waiting card, the success step ordering and the warning.

## Decision

Recovery kit proof by an X25519 agreement tag (no sealed box, no decryption on the phone), served by a new `self-approve-device` Edge Function and an `answer_admin_challenge` RPC, with the challenge state held in three columns on the pending `devices` row cleared by a trigger, a generic `admin_revoke_device` RPC plus an "also sign out my other phones" option inside the answer, and a last admin phone warning on Forgot PIN.

**Implementation skills**: none.

**Calls made here (recommended items):**
- **Tag, not sealed box**: the sealed box was the first draft and the cross check showed it turns the Admin's phone into a decryption oracle for every member's `mk_wrapped_admin` (same construction, same 32 byte plaintext). The tag is `hkdf(x25519(recovery_sk, eph_pub), salt = eph_pub || recovery_pub || device_id, info = "f2h:admin-challenge:v1", 32)`. The phone only ever outputs an HKDF of a fresh agreement bound to its own device id and a fixed info string, so no input can make it reveal anything else. Both sides compute the same tag; the server keeps `sha256(tag)` and nothing else. Libraries: the same `@noble/curves` and `@noble/hashes` as the app, pinned in `supabase/functions/deno.json`.
- **One function, two steps**: `self-approve-device` takes `step: 'challenge' | 'answer'`, like `approve-device` takes `decision`. Runner up: two functions (one more deploy, no gain).
- **Words first, then one burst**: the screen collects and checks the words, then calls challenge and answer back to back, so the 10 minute expiry only ever bites on a dead network. Runner up: challenge on card open (the first draft), which penalised slow typists.
- **One atomic RPC for the answer**: `answer_admin_challenge(p_device_id, p_tag_hash, p_revoke_others)` returns `outcome in (approved, wrong, expired, rejected)` plus `attempts_left`; lock, compare, count, approve or reject, optional revokes and audit rows in one transaction. Runner up: compare in the function then `decide_device` (a race window).
- **Trigger, not scattered clearing**: a `before update` trigger on `devices` nulls the three columns whenever `status` changes away from `pending`, so the check constraint can never fail a decision, an expiry or a cancel. Runner up: editing every path (the first draft missed two).
- **Other device count on the phone**: one helper `countMyApprovedDevices()` (own `devices` rows over RLS, owner policy has no device check and the `status` column is granted since 0010), used live by the waiting screen and cached as `f2h.admin_approved_count` for the lock warning. Runner up: a field on the register response (stale by the time it matters).
- **Audit at answer time**: no audit row per challenge (spam); `device.self_approve`, `device.self_approve_failed`, `device.revoke`, `device.replaced` only.
- **10 minute expiry, 3 wrong tags, 5 challenges**: all generous against a 256 bit tag; they exist to bound a forged client, not the Admin.

## Feature design

**Data model**: three nullable columns added to `devices`, meaningful only while `status = pending`, **not** added to the `authenticated` column grant (so neither RLS reads nor Realtime ever carry them):

| Column | Type | Notes |
|---|---|---|
| `challenge_hash` | text null | hex `sha256` of the expected tag |
| `challenge_expires_at` | timestamptz null | `now() + interval '10 minutes'` at issue |
| `challenge_attempts` | smallint not null default 0 | wrong tags so far, kept across re-issued challenges |
| `challenge_count` | smallint not null default 0 | challenges issued for this row, capped at 5 |

Check constraint: `challenge_hash is null or status = 'pending'`. Trigger `devices_clear_challenge` (`before update`, when `new.status <> 'pending'`) nulls `challenge_hash` and `challenge_expires_at`. `decide_device` is unchanged; `register-device` gains the replace path.

**State transitions**: the device machine is unchanged (`pending → approved | rejected | expired`, `approved → revoked`). Within `pending`: `no challenge → open → (right tag) approved | (wrong tag) open, attempts + 1 → (third wrong) rejected`. `pending → expired` also when replaced by a newer Admin registration.

**Tag construction** (both sides, bytes): `shared = x25519(recovery_sk, eph_pub)` on the phone and `x25519(eph_sk, recovery_pub)` on the server; `tag = hkdf_sha256(ikm = shared, salt = eph_pub(32) || recovery_pub(32) || device_id (16 raw uuid bytes), info = "f2h:admin-challenge:v1", len = 32)`. The phone sends `tag` base64; the server compares `sha256(tag)` to `challenge_hash` in constant time inside the RPC.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `functions/v1/self-approve-device` | POST | `step: 'challenge'` | `eph_pub` (base64), `expires_at`, `attempts_left` | `requirePendingAdmin`: user JWT, device header naming the caller's own `pending` row, profile role admin and status active, `family_config.admin_user_id = uid`, `admin_recovery_pubkey` not null | 401; 403 `admin_required`, `device_not_pending`, `recovery_not_published`; 409 `too_many_challenges` |
| `functions/v1/self-approve-device` | POST | `step: 'answer'`, `tag` (base64, 32 bytes), `revoke_others: boolean` | `status`, `attempts_left` | same | 400 `bad_tag_format`; outcome mapping below |
| `rpc/answer_admin_challenge` | internal | `p_device_id`, `p_tag_hash`, `p_revoke_others` | `outcome`, `attempts_left` | service role only | P0001 `device_not_pending` |
| `rpc/admin_revoke_device` | POST | `p_device_id` | `device_status` | admin JWT + approved device header | 42501 `admin_required`, 42501 `not_other_device`, P0001 `device_not_approved`, P0002 `device_not_found` |
| `functions/v1/register-device` (existing, extended) | POST | as today plus `replace_pending: true` | as today | user JWT | the foreign pending row of an Admin account becomes `expired` with `device.replaced` before the insert |
| `rpc/recovery_pubkey` (existing) | POST | none | `recovery_pub`, `fingerprint` | any authenticated user | none |
| `member_devices_view` (existing) | select | own rows | id, model, name, status, last_seen_at | JWT, owner | none |

**Outcome mapping** (answer step):
| RPC outcome | HTTP | Body | Client action |
|---|---|---|---|
| `approved` | 200 | `status: approved` | success step, then key release |
| `wrong` | 409 | `code: wrong_tag`, `attempts_left` | keep the words, re-issue a challenge and answer again once; then show the count |
| `expired` | 409 | `code: challenge_expired` | re-issue a challenge and answer again, not a miss |
| `rejected` | 200 | `status: rejected` | wait for the Realtime watcher, which wipes (gate AC-13) |
| network error or `device_not_pending` | n/a | n/a | re-read the row status and let the watcher decide; never a miss |

Client api (`src/features/device/self-approve.ts`): `checkRecoveryWords(words, recoveryPub)`, `selfApprove(words, revokeOthers)` (challenge, tag, answer, mapping above), `countMyApprovedDevices()`, `listOtherApprovedDevices()`, `revokeOtherDevice(id)`. The session store gains `selfApproving: boolean`; the waiting screen's watcher does not route on `approved` while it is true. Screens live under `src/features/device/screens/` (the card, the words step, the success step).

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| waiting screen | show the card at all | session profile `role = admin` and `recovery_pubkey` RPC returning a row |
| waiting screen | `recovery_pub` bytes and fingerprint | `fetchRecoveryPubkey()` at card mount, base64 decoded into screen state; the fingerprint shown is computed locally with `recovery.fingerprint` from those bytes |
| waiting screen | main action vs secondary link | `countMyApprovedDevices()` live, refetched on each Realtime event and poll tick |
| word entry | suggestions | the English BIP39 list bundled by `@scure/bip39` |
| word entry | local validity | `mnemonic.isValid` (checksum) and `recovery.deriveRecoveryKeypair(mnemonic.toSeed(words)).publicKey` equal to the published bytes |
| challenge | `eph_pub`, expected tag | ephemeral keypair from `@noble/curves` in the function; tag per the construction above with `recovery_pub` from `family_config` and the device id from the header lookup |
| challenge | `expires_at` | `now() + 10 minutes` in the function, stored on the row |
| answer | the tag | the same construction on the phone with the derived recovery secret key, zeroed right after |
| answer | `attempts_left` | `3 - challenge_attempts` from the row |
| answer | `decided_by`, `decided_at` | the Admin's user id and `now()` inside the RPC |
| answer | audit meta | `device_id`, `model`, `last_ip`, `last_geo.city` from the row; `actor_device_id` = the pending row; `target_user_id` = the Admin |
| answer, revoke others | which rows | `devices` where `user_id = admin`, `status = approved`, `id <> p_device_id`, inside the RPC |
| success step | other admin devices | `member_devices_view` filtered to `status = approved` and `id <> this device`, read by the now approved phone |
| success step | "last seen" | `last_seen_at` vs device clock |
| push to other admin phones | body | `profiles.display_name` and the new row's `model`; best effort through the existing `sendPush` |
| post approval | master key | `key_material.mk_wrapped_pw` unwrapped with the KEK still in memory (gate AC-12); when the KEK is gone, `completeApproval()` returns `login` as today |
| Forgot PIN confirm | "only approved admin phone" | AsyncStorage `f2h.admin_approved_count` written by `checkDeviceStatus()` via `countMyApprovedDevices()` for role admin; missing counts as 1 |
| replace pending | the row to expire | the caller's own pending row by `user_id` with a different `registration_nonce` |

**Key invariants**: a challenge exists only on a `pending` row (trigger plus check); only the hash of the expected tag is stored; the ephemeral secret never leaves the function invocation; at most 3 wrong tags and 5 challenges per pending row; the phone never decrypts anything during the proof; `admin_revoke_device` never revokes the caller's own current device; the first run rule is untouched; members cannot reach any step; the new columns are never granted to `authenticated`.

**Security model**: `self-approve-device` runs with the service role after `requirePendingAdmin`. The proof is possession of the recovery seed: without `recovery_sk` nobody can compute the tag, and because the phone only ever derives a tag from a fresh agreement with a fixed info string and its own device id, a hostile function cannot use the flow to open a member's `mk_wrapped_admin` or anything else. The seed and the derived key live in memory only for the computation. `admin_revoke_device` is `security definer` guarded by `is_approved_device()` and the admin role. The optional "sign out my other phones" happens inside the approval transaction so a thief holding the unlocked lost phone has no window to revoke the new one first; the push to other admin phones makes a recovery visible. Every outcome writes `audit_log` so a member can see when the Admin regained access and which phones were signed out. Known limit, unchanged from the umbrella: whoever holds the paper kit and the Admin password owns the family vault; the kit stays offline by design.

**Configuration required**: none. `supabase/functions/deno.json` pins `npm:@noble/curves` and `npm:@noble/hashes` to the app's versions.

**Critical test scenarios**:
- Happy path: Admin logs in on a wiped phone, lands pending, taps the kit card, types the 24 words, ticks "also sign out my other phones", gets approved, sees the success step, reaches Set PIN; `devices` shows `approved` with null challenge columns, the lost phone `revoked`, and the audit rows, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**.
- Failure case: two forged tags return `wrong_tag` with `attempts_left` 2 then 1; the third sets `rejected` and the phone wipes; an expired challenge returns `challenge_expired` and the attempts count is unchanged, verifies **AC-5**.
- Oracle resistance: the Deno test feeds the function a member's `mk_wrapped_admin` bytes as `eph_pub`; the phone side tag computation returns a 32 byte HKDF output that reveals nothing, and no decrypt path exists, verifies **AC-2**.
- Auth/permission: a member's pending phone gets 403 `admin_required`; an Admin calling with an approved device header gets 403 `device_not_pending`; `admin_revoke_device` on the caller's own device raises `not_other_device`, verifies **AC-2**, **AC-6**.
- Paths: `expire-requests` and `cancel_my_device` on a row with an open challenge succeed and leave the columns null; `decide_device` and `answer_admin_challenge` on the same row, the second raises `device_not_pending`; an Admin registration with `replace_pending` expires the foreign row, verifies **AC-8**.
- Lock: Forgot PIN on the only approved admin phone shows the warning; with two approved admin devices it does not; after sign out the cached count is gone, verifies **AC-7**.
- Cold start: kill the app on the words step, reopen, finish the proof; the success step shows, then login, verifies **AC-4**.

## Build plan

Tracer Bullet: the first three tasks carry one real proof from the database through the function to the phone and back to Set PIN; the rest thickens.

1. Migration 0012: the four `devices` columns, check and trigger, `answer_admin_challenge` (with `p_revoke_others`) and `admin_revoke_device` RPCs with grants, `device.replaced` support, pgTAP for both RPCs, the trigger on the expire and cancel paths, the race and the replace path; regenerate types, satisfies **AC-4**, **AC-5**, **AC-6** (server), **AC-8**, **AC-9** (pgTAP).
2. `functions/_shared/challenge.ts` (tag construction in Deno, `npm:` pins in `deno.json`) with a Deno vectors test shared with `src/crypto/__tests__/vectors.json`; `requirePendingAdmin` in `_shared/auth.ts`; the `self-approve-device` function with both steps, the outcome mapping, the push to other admin phones; `register-device` `replace_pending`, satisfies **AC-2**, **AC-4**, **AC-5**, **AC-8**, **AC-9** (Deno).
3. Client api `self-approve.ts` (local checks, tag, one burst, outcome handling), the `MnemonicEntry` component (24 boxes, suggestions, paste, hygiene, zeroing), the kit card on the waiting screen with the `recovery_pub` fetch and the main vs secondary placement, the `selfApproving` flag and the handoff into `completeApproval()`, satisfies **AC-1**, **AC-3**, **AC-4**.
4. Success step reading `member_devices_view` with "Sign out that phone" over `admin_revoke_device` and the "also sign out my other phones" option on the words step, satisfies **AC-6**.
5. `countMyApprovedDevices()` shared by the waiting screen and `checkDeviceStatus()`, the cache key and its removal in `wipeLocalState`, the Forgot PIN warning, satisfies **AC-7**.
6. Jest for `MnemonicEntry`, the waiting card, the watcher ordering and the warning; `verify.md` for this child, satisfies **AC-9**.

## Consequences

**Positive**:
- The deadlock is gone for every way an admin phone can be lost: wipe, ten misses, revoke, theft.
- The proof is stronger than today's tap on a second phone, reuses the kit and the audit trail, and cannot be turned into a decryption oracle.
- The generic revoke RPC and the "sign out my other phones" option are what the Slice 5 device list needs anyway.

**Negative / tradeoffs**:
- The Edge Functions gain crypto code (`_shared/challenge.ts`), a second place that must match the client vectors.
- Typing 24 words on a phone is slow and error prone; the local checks soften it, they do not remove it.
- If the kit is lost together with every admin phone, the answer is still a fresh bootstrap. This spec only makes the kit matter.
- A password holder and the real Admin can expire each other's pending rows in turn; nobody gains access, but the audit log shows the tug of war.

**Neutral**:
- Four columns on `devices` sit empty on every row that is not a pending admin phone.
- Audit log gains four action names; the member facing audit screen (Slice 5) should label them.

## Follow-up

- [ ] Gate spec Consequences still say "losing the Admin phone and the paper kit means a fresh bootstrap"; after this ships, reword to "losing the paper kit and every admin phone".
- [ ] Spec 0002 AC-6 gains the warning copy; record it there when `/develop` lands task 5.
- [ ] The Slice 5 device list should reuse `admin_revoke_device` and label the four new audit actions.
- [ ] Runbook: the manual SQL approval used on 2026-10-08 (`decide_device` from the dashboard) stays documented in `docs/runbooks/` as the operator break glass for the day the kit is gone too.
- [ ] The crypto child spec should list the admin challenge tag construction beside the sealed box, with its vectors.

## Rationale

**Context**: `register-device` auto approves the Admin only on the true first run (no recovery key published, no device row of any status). The gate spec accepted "a lost Admin phone means a fresh bootstrap" when the only way to lose a phone was to lose it. Spec 0002 then added three ways to revoke the Admin's own device from the device itself, and the verify run of 2026-10-08 hit the deadlock within an hour. The forces: a four person family with one Admin and usually one admin phone; no email, so no out of band reset; a zero knowledge design where the server must never learn a secret and the phone must never be tricked into revealing one; a paper kit that already exists and whose public key is already published; Expo Go, so no biometrics or hardware attestation to lean on.

**Options considered**:
1. Recovery kit proof by an X25519 agreement tag (chosen). Pros: unguessable, nothing new to remember, the phone never decrypts anything so the flow cannot be abused against the members' sealed keys, strong enough to also cover a lost but still approved phone. Cons: 24 words to type, crypto code in the functions, useless when the kit is gone.
2. Recovery kit proof by a sealed box challenge (the first draft). Pros: reuses the existing sealed box and its vectors. Cons: `mk_wrapped_admin` is a sealed box to the same key with the same plaintext length, so a hostile function could present a member's wrap as the challenge and the Admin's phone would return that member's master key. Rejected after the cross check.
3. Password only self approval when no approved admin device exists. Pros: a one line change in `register-device`. Cons: a leaked Admin password becomes a full takeover at the exact moment a stolen admin phone was wiped by ten wrong PINs, which is the moment the design is supposed to hold.
4. Operator break glass only (the SQL run today). Pros: zero code. Cons: needs a laptop, the CLI and the service role every time; not a product behaviour. Kept as the runbook of last resort.
5. Always keep two admin phones. Pros: no new flow. Cons: a rule, not a mechanism; one lost phone still deadlocks, and the family has one spare phone at most.
6. A memorised secret phrase or a known fact (the engineer first suggested a birth time). Pros: nothing on paper. Cons: a known fact is guessable by the family the threat model names, and any typed secret is weaker than 256 random bits; a chosen phrase would be a second kit to lose. Declined after discussion.

**Rationale**: option 1 is the only one that keeps the zero knowledge promise on both sides (the server learns a hash of a tag, the phone reveals only a tag) while removing the deadlock for every loss path, and it costs one function, one migration and one screen. Offering it whenever the Admin's phone is pending, not only when no approved device exists, is what makes the lost phone case recoverable, and the proof is strong enough to allow that; doing the optional revoke inside the approval transaction closes the window a thief with the lost phone would otherwise have. The columns on `devices` with a trigger beat a new table because the challenge has no life outside the pending request and dies with it, and the trigger means no code path can forget to clear them. The engineer's first instinct (a birth time) was declined because the vault's own threat model lists the curious family member, and that is who knows a birth time.
