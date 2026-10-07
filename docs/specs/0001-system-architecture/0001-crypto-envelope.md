# 0001 child: Crypto envelope

Part of [0001 system architecture](index.md). Build spec for feature 4 (Crypto core). GA tier.

## Summary

All encryption happens on the phone with audited pure JavaScript libraries so it runs in Expo Go. Each member has one Master Key that wraps a separate key per item. The Master Key is itself wrapped three ways: by a key derived from the password (never sent to the server), by the Admin's recovery public key (so the Admin can open a vault in an emergency), and locally by the PIN plus a hardware stored device secret (daily unlock). Files are encrypted in 1 MiB chunks so memory stays flat.

## Requirements

**User stories**:
- As a member, I want my data encrypted before upload so the cloud never sees plaintext.
- As the Admin, I want a paper recovery kit that can open any vault in an emergency.
- As a developer, I want test vectors so a future native crypto swap is provably identical.

**Acceptance criteria**:
- **AC-1**: `randomBytes(n)` returns `n` bytes from `expo-crypto`; the `crypto.getRandomValues` polyfill is installed before any `@noble` import (a test asserts the global exists).
- **AC-2**: `kdf.scrypt(password, salt, params)` and `kdf.hkdf(ikm, salt, info, len)` reproduce the committed vectors.
- **AC-3**: `aead.seal(key, plaintext, aad)` produces `0x01 || nonce(24) || ct`; `aead.open` rejects a flipped bit, a wrong AAD and an unknown version byte.
- **AC-4**: `box.seal(recipientPub, plaintext)` and `box.open(recipientPriv, wire)` follow the sealed box construction below and reproduce the vector.
- **AC-5**: `envelope.wrapDek(mk, dek, itemId)` / `unwrapDek` round trip and fail on a different `itemId`.
- **AC-6**: `passwordSplit(email, password)` yields `authSecret` (base64url, 43 chars) and `kek` (32 bytes); the same inputs always yield the same outputs; different email casing yields the same outputs.
- **AC-7**: `verifier.make(mk, userId)` / `verifier.check(mk, userId, wire)` round trip and fail for a different MK.
- **AC-8**: `chunked.encryptFile(inputUri, dek, blobId)` writes `header(64) || (nonce||ct)*` using 1 MiB plaintext chunks, never holding more than one chunk in memory; `chunked.decryptFile` restores a byte identical file.
- **AC-9**: `chunked.decryptFile` rejects a truncated file, a reordered chunk, a chunk from another blob, and a header edited to a different total.
- **AC-10**: `mnemonic.fromSeed(seed32)` returns 24 BIP39 English words and `mnemonic.toSeed(words)` inverts it; an invalid checksum is rejected.
- **AC-11**: `src/crypto/__tests__/vectors.json` holds fixed vectors for AC-2 to AC-8 and all pass in Jest.
- **AC-12**: `scripts/bench-kdf.ts` (run in the app's dev gallery) reports scrypt timings; defaults are recorded in `kdf.ts` with the device and timing in a comment.

## Decision

Primitives: XChaCha20 Poly1305 (`@noble/ciphers`), scrypt + HKDF SHA 256 (`@noble/hashes`), X25519 (`@noble/curves`), BIP39 (`@scure/bip39`), randomness from `expo-crypto`. Argon2id is not used because pure JS argon2 is too slow on Hermes; the `kdf` module is the only place to change if a native build adopts it.

**Implementation skills**: none.

## Feature design

**Key hierarchy** (per member):
- `MK` 32 random bytes, generated on the first device at signup, only ever in memory while unlocked.
- `DEK` 32 random bytes per `vault_items` row. `ciphertext = aead(DEK, json, aad = item_id)`, `dek_wrapped = aead(MK, DEK, aad = item_id)`.
- `mk_verifier = aead(MK, "f2h:mk-check", aad = user_id)`.
- Password split: `stretched = scrypt(utf8(password), utf8("f2h:pw:v1:" + lower(email)), N=2^14, r=8, p=1, dkLen=32)`; `authSecret = base64url(hkdf(stretched, salt="f2h:auth", info="auth:v1", 32))`; `KEK = hkdf(stretched, salt="f2h:kek", info="kek:v1", 32)`.
- Wraps stored in `key_material`: `mk_wrapped_pw = aead(KEK, MK, aad = user_id)`, `mk_wrapped_admin = box.seal(recovery_pub, MK)`.
- Recovery: `recovery_seed` 32 random bytes → 24 words; `recovery_priv = hkdf(seed, salt="f2h:recovery", info="f2h:recovery-x25519:v1", 32)` clamped by the X25519 implementation; `recovery_pub = x25519.getPublicKey(recovery_priv)`; fingerprint = first 8 bytes of sha256(recovery_pub) as 4 groups of 4 hex chars.
- Local wrap: `device_secret` 32 random bytes and `device_salt` 16 random bytes in SecureStore; `pinKey = scrypt(PIN, device_salt, N=2^14, r=8, p=1)`; `wrapKey = hkdf(pinKey || device_secret, salt="f2h:local", info="f2h:local-wrap:v1", 32)`; `mk_wrapped_local = aead(wrapKey, MK, aad="local")` in SecureStore. Biometric wrap: `aead(hkdf(device_secret, salt="f2h:bio", info="f2h:bio-wrap:v1"), MK)` gated by `expo-local-authentication` in Expo Go, upgraded to a `requireAuthentication` SecureStore entry in EAS builds.

**Sealed box**: `eph = x25519 keypair`; `shared = x25519(eph_priv, recipient_pub)`; `key = hkdf(shared, salt = eph_pub || recipient_pub, info = "f2h:sealed-box:v1", 32)`; `nonce` 24 random bytes; `ct = xchacha20poly1305(key, nonce).encrypt(plaintext, aad = eph_pub || recipient_pub)`; wire `0x01 || eph_pub || nonce || ct`.

**AEAD wire**: `0x01 || nonce(24) || ct`; base64 (standard, padded) when stored in JSON or DB text columns; raw bytes in files.

**Chunked file**: header 64 bytes = `"F2H1"(4) || blob_id(16) || version(4 BE) || chunk_size(4 BE) || total_chunks(4 BE) || zeros(32)`; chunk i = `nonce(24) || ct` where `ct = aead(DEK, plaintext_chunk, aad = "f2h:chunk:v1" || blob_id || version || i || total_chunks || is_final)`; chunk 0 additionally includes the 64 byte header in its AAD. New `blob_id` and new DEK for every upload. The item metadata JSON carries `{blob_id, size_ct, sha256_ct, chunk_size, total_chunks, name, mime, size}`.

**Module layout** (`src/crypto/`): `polyfill.ts`, `random.ts`, `encoding.ts` (base64, base64url, hex, utf8, concat), `kdf.ts`, `aead.ts`, `box.ts`, `envelope.ts`, `password-split.ts`, `verifier.ts`, `chunked.ts`, `mnemonic.ts`, `index.ts` (the only public surface), `__tests__/`.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Password split | email | login form, lowercased on device |
| Local wrap | device_secret, device_salt | generated once per install, SecureStore |
| Chunk AAD | blob_id, version | generated per upload in `features/files/upload.ts` |
| Verifier | user_id | Supabase session `user.id` |
| Fingerprint | recovery_pub | `family_config.admin_recovery_pubkey` |

**Key invariants**: no key bytes outside `src/crypto/` and the in memory keyring; nonces are always random, never counters; every AEAD call has an AAD; a DEK is never reused across blobs.

**Security model**: this module has no network access and no storage access except through injected adapters (file system for chunked, SecureStore for the keyring) so it is unit testable with fakes.

**Critical test scenarios**:
- Happy path: vectors for every primitive (AC-2 to AC-8, AC-11).
- Failure: truncated and reordered chunk files are rejected (AC-9).
- Determinism: split is stable across email casing (AC-6).

## Build plan

1. Install `@noble/hashes`, `@noble/ciphers`, `@noble/curves`, `@scure/bip39`, `expo-crypto`; add `polyfill.ts`, `random.ts`, `encoding.ts`, satisfies **AC-1**.
2. `kdf.ts` with scrypt and hkdf wrappers and typed params, satisfies **AC-2**.
3. `aead.ts` with versioned wire format, satisfies **AC-3**.
4. `box.ts` sealed box, satisfies **AC-4**.
5. `envelope.ts` DEK wrap/unwrap, satisfies **AC-5**.
6. `password-split.ts`, satisfies **AC-6**.
7. `verifier.ts`, satisfies **AC-7**.
8. `chunked.ts` with a file adapter interface (byte range read, append write) and an in memory fake for tests, satisfies **AC-8**, **AC-9**.
9. `mnemonic.ts`, satisfies **AC-10**.
10. Generate and commit `vectors.json` plus Jest tests, satisfies **AC-11**.
11. `scripts/bench-kdf.ts` and recorded defaults, satisfies **AC-12**.

## Consequences

**Positive**: deterministic, testable, Expo Go compatible; a native swap is a drop in behind `index.ts`.
**Negative**: pure JS speed (about 1 s per scrypt, 10 to 30 MB/s AEAD); a 6 digit PIN on a rooted device with the device secret extracted is brute forceable offline.
**Neutral**: BIP39 adds an English wordlist (~10 KB) to the bundle.
