# Scope: F2H

A private, zero trust family vault for four people (Admin, Father, Mother, Brother): contacts split into a Call Directory and a WhatsApp list, a credential vault, and files, all encrypted on the phone and backed up to two Google Drives. New accounts and unknown devices wait for the Admin to tap Approve; daily access is a local PIN.

**Build approach:** Tracer Bullet (every feature is built end to end through UI, crypto, database and functions, thin first, then thickened).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Design system & motion | Foundation | in-progress |
| 4 | Crypto core | Foundation | in-progress |
| 5 | Backend foundation (data model & RLS) | Foundation | done |
| 6 | Auth & device gate | Slice 1 | in-progress |
| 7 | App lock | Slice 1 | done |
| 8 | Contacts vault | Slice 2 | in-progress (built, closing checks open) |
| 9 | Credential vault | Slice 3 | planned |
| 10 | Files & Drive redundancy | Slice 4 | in-progress |
| 11 | Admin oversight & audit | Slice 5 | planned |
| 12 | Backups & disaster drills | Slice 6 | planned |
| 13 | Onboarding & polish | Slice 7 | planned |
| 14 | Release | Slice 7 | planned |
| 15 | Admin device self approval | Slice 1 | done |

## Foundations

### 1. Stack & architecture · in-progress · GA
Decide the stack, the cryptographic design, the device approval relay and the Drive redundancy model, then scaffold a runnable Expo project on real structure.
**Done when:** the stack is recorded in spec 0001, the scaffold boots in Expo Go, lint, typecheck and tests pass on CI, and the first push to GitHub contains no `doc/` folder.
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
   - [x] Repo, ignore rules, Expo scaffold, path alias, strict TypeScript
   - [x] Jest, CI workflow, app icon from the logo
   - [x] Drive resumable upload spike recorded in the spec rationale
- [ ] Verify it: `/check verify stack & architecture`
- [ ] Test it: `/test stack & architecture`
Spec [0001](../specs/0001-system-architecture/index.md) · code in `./`

### 2. Coding standards & tooling
Capture conventions, then install lint, format and commit hooks so every commit is a Conventional Commit.
**Done when:** root `AGENTS.md` reflects the real scaffold, and lint, format, typecheck and the commit message hook run clean.
- [ ] Capture conventions + tooling choices: `/audit`
- [ ] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`

### 3. Design system & motion · in-progress
Blue and white 2.5D tokens derived from the bear logo, base components, and the motion primitives reverse engineered from the reference videos (overshoot toggle, cascading fields, glow boxes, morph button, radial reveal, card deck).
**Done when:** tokens, fonts and primitives exist, a dev only gallery route shows every primitive and motion, and all primitives have tests.
- [x] Design it (spec): `/architect design system & motion`
- [x] Build it: `/develop design system & motion`
   - [x] Tokens, fonts, theme provider (AC-1..2)
   - [x] UI primitives: Surface, Card, Button, TextField, Sheet, Callout, Row, Badge (AC-3..4)
   - [x] Motion primitives: SegmentedToggle, CascadeList, MorphButton, RadialReveal, GlowBox, CardDeck (AC-5..8)
   - [x] Dev gallery route and tests (AC-9)
- [ ] Verify it: `/check verify design system & motion`
- [ ] Test it: `/test design system & motion`
Spec [0001-design-system-motion](../specs/0001-system-architecture/0001-design-system-motion.md) · code in `src/theme/`, `src/components/ui/`, `src/components/motion/`, `design.md`

### 4. Crypto core · in-progress · GA
Pure JavaScript envelope encryption that runs in Expo Go: KDF, AEAD, sealed box, master key wraps, password split, chunked file format, recovery mnemonic.
**Done when:** every primitive reproduces committed test vectors, the chunk format rejects truncation and reordering, and KDF timings on a mid range phone are recorded.
- [x] Design it (spec): `/architect crypto core`
- [x] Build it: `/develop crypto core`
   - [x] Random, encoding, KDF, AEAD with versioned wire format (AC-1..3)
   - [x] Sealed box, envelope wrap/unwrap, password split, verifier (AC-4..7)
   - [x] Chunked file encrypt/decrypt streams, mnemonic (AC-8..10)
   - [x] Test vectors and Hermes benchmark (AC-11..12)
- [ ] Verify it: `/check verify crypto core`
- [ ] Test it: `/test crypto core`
- [ ] Review it: `/check review crypto core`
- [ ] Document it: `/document crypto core`
Spec [0001-crypto-envelope](../specs/0001-system-architecture/0001-crypto-envelope.md) · code in `src/crypto/`, `scripts/bench-kdf.ts`

### 5. Backend foundation (data model & RLS) · done
Supabase project, migrations for every table, the approved device RLS helper, audit triggers, cron and webhook wiring, generated types, the Admin bootstrap script and the free tier keep alive.
**Done when:** migrations apply on a fresh local Supabase, RLS tests prove isolation (a member cannot read another member, a pending device cannot read key material), and the bootstrap script seeds the Admin.
- [x] Design it (spec): `/architect backend foundation`
- [x] Build it: `/develop backend foundation`
   - [x] Config, extensions, tables and enums (AC-1..3)
   - [x] RLS helper, policies, audit triggers, publication (AC-4..7)
   - [x] Shared function helpers, generated types, client with device header (AC-8..9)
   - [x] Bootstrap script and keepalive workflow (AC-10..11)
- [x] Verify it: `/check verify backend foundation`
- [x] Test it: `/test backend foundation`
Spec [0001-data-model-rls](../specs/0001-system-architecture/0001-data-model-rls.md) · code in `supabase/`, `src/services/`, `src/types/`, `scripts/bootstrap-admin.ts`, `.github/workflows/keepalive.yml` · migrations applied to the hosted project 2026-10-07; pgTAP not yet run (needs Docker)

## Slice 1: Get in safely

### 6. Auth & device gate · in-progress · GA
Invite code signup, zero knowledge login, device registration with model and approximate location, the waiting screen, the Admin approvals inbox with the morphing approve sheet, the Admin recovery kit, and Admin assisted password reset.
**Done when:** a member can sign up only with a valid invite code, an unknown device waits until the Admin approves it live, a pending device can never read key material, and a forgotten password is recoverable through an Admin grant.
- [x] Design it (spec): `/architect auth & device gate`
- [x] Build it: `/develop auth & device gate`
   - [x] Login/Sign up screen, signup and register-device functions, Admin first run recovery kit (AC-1..5)
   - [x] Waiting screen with realtime + poll, push registration, notify-admin (AC-6..8)
   - [x] Approvals inbox, wrap verification, approve-device, post approval unwrap (AC-9..12)
   - [x] Denied/expired states, expire cron, reset-password and change password (AC-13..16)
- [ ] Verify it: `/check verify auth & device gate`
- [x] Test it: `/test auth & device gate`
- [x] Review it: `/check review auth & device gate`
- [x] Document it: `/document auth & device gate`
Spec [0001-account-and-device-gate](../specs/0001-system-architecture/0001-account-and-device-gate.md) · code in `src/app/(auth)`, `src/app/(admin)`, `src/app/(app)`, `src/features/{auth,device,keyring,admin,vault}`, `src/services/{functions,push,device-info}.ts`, `src/state/`, `supabase/functions/`, migration 0009

### 7. App lock · done
Six digit PIN set and unlock screens with the glow box motion, master key wrapped by PIN plus device secret, failure backoff and wipe, auto lock, optional biometrics.
**Done when:** the vault needs the PIN after 60 s in the background or a cold start, ten failures wipe the local key, and biometrics unlock on supported phones.
- [x] Design it (spec): `/architect app lock`
- [x] Build it: `/develop app lock`
   - [x] Self revoke RPC, lock store with the attempt gate, generation guard and wipe reasons (AC-5, AC-12, AC-13, AC-14, AC-16)
   - [x] PIN pad and boxes, Set PIN handoff and sign out forgetting the PIN (AC-1, AC-11, AC-14, AC-15)
   - [x] Unlock modal, boot order, backoff, countdown, tenth miss wipe and Forgot PIN (AC-2, AC-4, AC-5, AC-6)
   - [x] Auto lock, Lock now, timeout setting, Change PIN, privacy overlay and the revoke guard (AC-3, AC-7, AC-8, AC-9, AC-10)
- [x] Verify it: `/check verify app lock`
- [x] Test it: `/test app lock` _(skipped by the engineer 2026-10-12; the jest suites written during the build stand in. Owed and skipped: the LAVA unlock ms and the revoked phone 403 check)_
Spec [0002-app-lock](../specs/0002-app-lock/index.md) · code in `src/features/lock/`, `src/components/lock/`, `src/app/(lock)/`, `src/features/auth/{api,session}.ts`, `src/services/{app-storage,secure-store,supabase}.ts`, migration 0011

### 15. Admin device self approval · done · GA · from spec 0001
The Admin approves their own new or wiped phone by proving the paper recovery kit (an X25519 agreement tag, the phone never decrypts anything), can sign out other admin phones in the same step, and is warned before wiping the only approved admin phone.
**Done when:** an Admin with no reachable approved phone gets back in with the password and the 24 words, a lost phone can be signed out from the success step, and the Forgot PIN confirm warns on the last approved admin phone.
- [x] Design it (spec): `/architect admin device self approval`
- [x] Build it: `/develop admin device self approval`
   - [x] Migration 0012: challenge columns, trigger, `answer_admin_challenge` and `admin_revoke_device`, pgTAP (AC-4, AC-5, AC-6, AC-8, AC-9)
   - [x] `self-approve-device` function with the tag construction, `requirePendingAdmin`, `replace_pending` (AC-2, AC-4, AC-5, AC-8)
   - [x] Word entry, kit card on the waiting screen, one burst proof and handoff to Set PIN (AC-1, AC-3, AC-4)
   - [x] Success step with sign out of other phones, approved count helper and the Forgot PIN warning, jest and verify.md (AC-6, AC-7, AC-9)
- [x] Verify it: `/check verify admin device self approval` _(single phone path verified 2026-10-12; second Admin phone, member phone and forced wrong tag steps skipped)_
- [x] Test it: `/test admin device self approval` _(skipped; pgTAP 33/33 and the jest suites from the build stand in)_
- [ ] Review it (fresh model): `/check review admin device self approval` _(skipped at close 2026-10-12, recommended before release: it is security code)_
- [ ] Document it: `/document admin device self approval` _(skipped at close 2026-10-12)_
Spec [0001-admin-device-self-approval](../specs/0001-system-architecture/0001-admin-device-self-approval.md) · code in migration 0012, `supabase/functions/{self-approve-device,register-device}`, `supabase/functions/_shared/{challenge,auth}.ts`, `src/crypto/challenge.ts`, `src/features/device/{self-approve,approved-count}.ts`, `src/features/device/screens/`, `src/components/mnemonic/`, `src/app/(auth)/{waiting,recovery-words,recovered}.tsx`, `src/features/lock/{api,storage}.ts` · migration applied and functions deployed to the hosted project 2026-10-08

## Slice 2: Contacts

### 8. Contacts vault · in-progress · built, closing checks open
Encrypted contacts tagged as Call and/or WhatsApp, two tabs, search, import from the phone address book with bulk tagging, call and open in WhatsApp actions.
**Done when:** a member can import, tag, search, edit and call contacts; the other members cannot read them; empty and error states render.
- [x] Design it (spec): `/architect contacts vault`
- [x] Build it: `/develop contacts vault`
   - [x] Model, api and store: payload, number normalization, search, dedupe, version retry, soft delete, lock clearing, pgTAP (AC-2, AC-5, AC-6, AC-7, AC-8)
   - [x] List with Call and WhatsApp tabs, search, detail with call and WhatsApp, add and edit form, Home link (AC-1, AC-2, AC-3, AC-5, AC-9)
   - [x] Import from the phone with bulk tags, dedupe and batched insert (AC-4)
   - [x] Screen and import jest, verify steps (AC-10)
- [ ] Verify it: `/check verify contacts vault`
- [ ] Test it: `/test contacts vault`
Spec [0003-contacts-vault](../specs/0003-contacts-vault.md) · code in `src/features/contacts/`, `src/app/(app)/contacts/`, `supabase/tests/database/0005_contacts.test.sql` · no migration (reuses `vault_items`) · phone steps queued in the umbrella `verify.md`

## Slice 3: Credentials

### 9. Credential vault · needs a decision
Encrypted credentials by type (bank, email, other) with a generator, reveal and copy with clipboard clearing, and screenshot protection.
**Done when:** a member can store, find, reveal and copy credentials, the clipboard clears after 30 s, and sensitive screens are hidden in the app switcher.
- [ ] Design it (spec): `/architect credential vault`

## Slice 4: Files

### 10. Files & Drive redundancy · in-progress · GA
Google account linking for two Drive slots, chunked client side encryption, dual resumable uploads straight from the phone, verified completion, downloads, deletes, and the nightly reconcile.
**Done when:** every saved file exists encrypted on both Drives, one Drive being down still allows saving and reading, and a deleted copy is restored by the reconcile job.
- [x] Design it (spec): `/architect files & drive redundancy`
- [ ] Build it: `/develop files & drive redundancy`
   - [ ] OAuth linking functions and screens for slot a and b (AC-1..2)
   - [ ] Upload session, chunked encrypt, dual resumable upload, completion verification (AC-3..7)
   - [ ] Download token, decrypt and open, list with degraded badge, delete (AC-8..11)
   - [ ] Reconcile cron with budgeted re copy and orphan sweep (AC-12..13)
- [ ] Verify it: `/check verify files & drive redundancy`
- [ ] Test it: `/test files & drive redundancy`
- [ ] Review it: `/check review files & drive redundancy`
- [ ] Document it: `/document files & drive redundancy`
Spec [0001-drive-redundancy](../specs/0001-system-architecture/0001-drive-redundancy.md)

## Slice 5: Oversight

### 11. Admin oversight & audit · needs a decision
Admin read only browsing of any member's vault through the recovery key, every open logged and pushed to the member, device revoke, and a read only offline ciphertext cache.
**Done when:** the Admin can open a member's vault, the member sees the audit entry within seconds, a revoked device is bounced to login, and the app shows cached items offline.
- [ ] Design it (spec): `/architect admin oversight & audit`

## Slice 6: Disaster recovery

### 12. Backups & disaster drills · needs a decision · GA
Daily encrypted metadata snapshot to both Drives, a backups screen, and a restore runbook proven against a fresh local Supabase.
**Done when:** a snapshot lands on both Drives daily, and the runbook restores a working vault from either Drive alone.
- [ ] Design it (spec): `/architect backups & disaster drills`

## Slice 7: Ship

### 13. Onboarding & polish · needs a decision
Swipeable onboarding card deck with the warm palette exception, home summary, empty, error and offline states, bundle audit.
**Done when:** a first run reaches login by swiping cards, every screen has empty and error states, and the bundle has no unused heavy dependency.
- [ ] Design it (spec): `/architect onboarding & polish`

### 14. Release
EAS preview and production profiles, Android push credentials, README with setup, secrets and Expo Go limits, tag v0.1.0.
**Done when:** a preview APK installs on the family phones, push works outside Expo Go, and the README lets a new machine run the project.
- [ ] Build it: `/develop release`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Key rotation**: rewrap all item keys under a new master key · needs a decision
- **Native crypto**: swap `@noble` for a native module in a dev build for large videos · needs a decision
- **Dark mode**: tokens exist, no dark palette yet
- **Item sharing between members**: per item keys make it possible later · needs a decision
- **Second Admin**: a co admin with their own recovery key · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
