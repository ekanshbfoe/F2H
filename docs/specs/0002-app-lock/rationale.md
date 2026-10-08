# 0002. App lock: rationale

## Context

The auth slice (spec 0001, account and device gate) leaves the Master Key (the key that unwraps every vault item) only in memory. A cold start sends the member back to the password login, and a phone left open has no lock at all. The crypto child spec already fixed the cryptography for a local unlock: a PIN stretched with scrypt (a slow hash) and mixed with a 32 byte device secret from SecureStore (the keystore) wraps the Master Key, so an attacker needs both the keystore contents and the PIN.

Forces: the reference device is an 8 year old 1 GB Android phone in Expo Go, where pure JavaScript scrypt runs about 60 times slower than on a laptop, so every unlock must stay near one second and never block the UI thread. Expo Go cannot bind a keystore entry to biometrics, so the biometric wrap described in the crypto spec is not reachable in development. The family has four members and one Admin; losing a phone is the main threat, not a targeted attacker, so a brute force limit with a hard stop matters more than an elaborate recovery flow. Nothing about the PIN may reach the server, and the audit and oversight rules of spec 0001 continue to apply unchanged. One phone may be shared by two family members in turn, so the lock must belong to one account.

Not deciding leaves the password as the only gate and the vault key unprotected in memory on an unattended phone, which contradicts the product's core promise.

## Options considered

### Option 1: PIN plus device secret wraps the Master Key, true lock

The PIN and a keystore held device secret derive a wrap key (crypto spec, local wrap); locking zeroes the Master Key; unlocking re derives it. The design the crypto spec already fixed.

**Pros**:
- A locked app holds no usable key in memory; a memory dump or a debugger on a locked phone gets ciphertext only.
- Reuses primitives that already have vectors and tests.

**Cons**:
- Every unlock pays one scrypt derivation (about 1.3 s on the reference phone).
- The miss counter lives on the phone, so a rooted device can reset it; the wipe is app enforced, as the crypto spec already states.

### Option 2: UI only lock, Master Key stays in memory

The PIN gates the screens; the key never leaves memory while the app runs.

**Pros**:
- Instant unlock, no derivation cost.

**Cons**:
- A locked app still holds the key; anyone with a debugger or a memory dump reads the vault. It also does nothing for a cold start, which still needs the password.

### Option 3: Keystore entry bound to biometrics (`requireAuthentication`)

Store the wrapped key in a SecureStore entry the OS only releases after fingerprint or face.

**Pros**:
- The OS enforces the authentication; no app side miss counter needed.

**Cons**:
- Not available in Expo Go, where development and the family's daily use happen for now; needs an EAS build. Phones without biometrics still need a PIN path.

## Rationale

The product promise is that the cloud and a lost phone never expose plaintext. Option 2 breaks the lost phone half of that promise, and Option 3 cannot run in Expo Go, which the owner set as the development and daily environment. Option 1 is the only one that locks for real today, and its cost is one scrypt derivation per unlock, which the owner measured and accepted at N=2^7 on the 1 GB phone (about 1.3 s). The engineer chose "wipe and re-register" over a password based PIN reset because it keeps one rule for every loss of trust, and the Admin is one tap away. Biometrics were explicitly left out of this slice. The owner binding and the sign out rule came from the cross check: a shared phone must never let one member inherit another's lock or miss count. The remaining wait is stored as a duration rather than an end time because a clock the member controls cannot be trusted either way, and resuming the full wait on a restart is the conservative reading.
