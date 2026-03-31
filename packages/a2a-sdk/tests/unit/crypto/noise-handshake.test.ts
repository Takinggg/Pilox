import { describe, it, expect } from 'vitest';
import {
  generateNoiseKeyPair,
  initiatorHandshake1,
  responderHandshake,
  initiatorHandshake2,
} from '../../../src/crypto/noise/handshake.js';
import { NoiseSession } from '../../../src/crypto/noise/session.js';

describe('Noise IK handshake', () => {
  it('completes a full handshake between initiator and responder', () => {
    const initiatorStatic = generateNoiseKeyPair();
    const responderStatic = generateNoiseKeyPair();

    // Step 1: Initiator creates message 1
    const { message: msg1, ephemeral, chainingKey } = initiatorHandshake1(
      initiatorStatic,
      responderStatic.publicKey,
    );

    expect(msg1).toBeInstanceOf(Uint8Array);
    expect(msg1.length).toBeGreaterThan(32);

    // Step 2: Responder processes message 1, produces message 2
    const { message: msg2, result: responderResult } = responderHandshake(
      responderStatic,
      msg1,
    );

    expect(msg2).toBeInstanceOf(Uint8Array);
    expect(msg2.length).toBe(32); // just the ephemeral pub
    expect(responderResult.sendKey).toBeInstanceOf(Uint8Array);
    expect(responderResult.recvKey).toBeInstanceOf(Uint8Array);
    expect(responderResult.remoteStaticKey).toEqual(initiatorStatic.publicKey);

    // Step 3: Initiator processes message 2
    const initiatorResult = initiatorHandshake2(
      initiatorStatic,
      ephemeral,
      chainingKey,
      responderStatic.publicKey,
      msg2,
    );

    expect(initiatorResult.sendKey).toBeInstanceOf(Uint8Array);
    expect(initiatorResult.recvKey).toBeInstanceOf(Uint8Array);
    expect(initiatorResult.remoteStaticKey).toEqual(responderStatic.publicKey);

    // Verify transport keys match (initiator send = responder recv, etc.)
    expect(initiatorResult.sendKey).toEqual(responderResult.recvKey);
    expect(initiatorResult.recvKey).toEqual(responderResult.sendKey);
  });

  it('fails with wrong responder key', () => {
    const initiatorStatic = generateNoiseKeyPair();
    const responderStatic = generateNoiseKeyPair();
    const wrongKey = generateNoiseKeyPair();

    const { message: msg1 } = initiatorHandshake1(initiatorStatic, responderStatic.publicKey);

    // Responder has wrong static key → decryption should fail
    expect(() => responderHandshake(wrongKey, msg1)).toThrow();
  });
});

describe('NoiseSession', () => {
  it('encrypts and decrypts messages after handshake', () => {
    const initiatorStatic = generateNoiseKeyPair();
    const responderStatic = generateNoiseKeyPair();

    const { message: msg1, ephemeral, chainingKey } = initiatorHandshake1(
      initiatorStatic,
      responderStatic.publicKey,
    );
    const { message: msg2, result: responderResult } = responderHandshake(responderStatic, msg1);
    const initiatorResult = initiatorHandshake2(
      initiatorStatic, ephemeral, chainingKey, responderStatic.publicKey, msg2,
    );

    const initiatorSession = new NoiseSession(initiatorResult);
    const responderSession = new NoiseSession(responderResult);

    // Initiator sends, responder receives
    const plaintext = new TextEncoder().encode('{"task":"hello"}');
    const { ciphertext, nonce } = initiatorSession.encrypt(plaintext);

    expect(ciphertext).not.toEqual(plaintext);
    const decrypted = responderSession.decrypt(ciphertext, nonce);
    expect(decrypted).toEqual(plaintext);

    // Responder sends, initiator receives
    const reply = new TextEncoder().encode('{"status":"completed"}');
    const { ciphertext: ct2, nonce: n2 } = responderSession.encrypt(reply);
    const decrypted2 = initiatorSession.decrypt(ct2, n2);
    expect(decrypted2).toEqual(reply);
  });

  it('handles multiple messages with incrementing nonces', () => {
    const initiatorStatic = generateNoiseKeyPair();
    const responderStatic = generateNoiseKeyPair();

    const { message: msg1, ephemeral, chainingKey } = initiatorHandshake1(
      initiatorStatic, responderStatic.publicKey,
    );
    const { message: msg2, result: responderResult } = responderHandshake(responderStatic, msg1);
    const initiatorResult = initiatorHandshake2(
      initiatorStatic, ephemeral, chainingKey, responderStatic.publicKey, msg2,
    );

    const sender = new NoiseSession(initiatorResult);
    const receiver = new NoiseSession(responderResult);

    for (let i = 0; i < 10; i++) {
      const msg = new TextEncoder().encode(`message-${i}`);
      const { ciphertext, nonce } = sender.encrypt(msg);
      expect(nonce).toBe(i);
      const dec = receiver.decrypt(ciphertext, nonce);
      expect(new TextDecoder().decode(dec)).toBe(`message-${i}`);
    }
  });
});
