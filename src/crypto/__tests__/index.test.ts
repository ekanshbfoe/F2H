import * as crypto from '..';

describe('public surface', () => {
  it('exposes the namespaces the features build on and hides the deterministic test hooks', () => {
    expect(Object.keys(crypto.aead).sort()).toEqual([
      'KEY_LEN',
      'NONCE_LEN',
      'TAG_LEN',
      'open',
      'seal',
    ]);
    expect(Object.keys(crypto.box).sort()).toEqual([
      'generateKeypair',
      'open',
      'publicKeyOf',
      'seal',
    ]);
    expect(Object.keys(crypto.chunked).sort()).toEqual([
      'decryptFile',
      'encryptFile',
      'parseHeader',
    ]);
    expect(crypto).not.toHaveProperty('sealWithNonce');
    expect(crypto).not.toHaveProperty('sealWith');
    expect(typeof crypto.passwordSplit).toBe('function');
    expect(typeof crypto.envelope.wrapDek).toBe('function');
    expect(typeof crypto.verifier.check).toBe('function');
    expect(typeof crypto.mnemonic.fromSeed).toBe('function');
    expect(typeof crypto.recovery.fingerprint).toBe('function');
    expect(typeof crypto.localWrap.deriveLocalWrapKey).toBe('function');
    expect(crypto.randomSourceReady).toBe(true);
  });

  it('runs a full member key ceremony end to end', async () => {
    const userId = 'user-1';
    const { kek, authSecret } = await crypto.passwordSplit(
      'brother@example.com',
      'a long passphrase',
    );
    const mk = crypto.envelope.generateMasterKey();
    const admin = crypto.recovery.deriveRecoveryKeypair(crypto.recovery.generateSeed());

    const mkWrappedPw = crypto.envelope.wrapMk(kek, mk, userId);
    const mkWrappedAdmin = crypto.box.seal(admin.publicKey, mk);
    const mkVerifier = crypto.verifier.make(mk, userId);

    expect(authSecret).toHaveLength(43);
    expect(crypto.envelope.unwrapMk(kek, mkWrappedPw, userId)).toEqual(mk);
    const recovered = crypto.box.open(admin.secretKey, mkWrappedAdmin);
    expect(crypto.verifier.check(recovered, userId, mkVerifier)).toBe(true);

    const itemId = crypto.randomUuid();
    const dek = crypto.envelope.generateDek();
    const ct = crypto.envelope.encryptItem(dek, '{"name":"Brother"}', itemId);
    const dekWrapped = crypto.envelope.wrapDek(mk, dek, itemId);
    const opened = crypto.envelope.decryptItem(
      crypto.envelope.unwrapDek(recovered, dekWrapped, itemId),
      ct,
      itemId,
    );
    expect(crypto.bytesToUtf8(opened)).toBe('{"name":"Brother"}');
  });
});
