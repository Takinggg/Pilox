import { describe, it, expect } from 'vitest';
import {
  generateSigningKeyPair,
  sign,
  verify,
  bytesToHex,
  hexToBytes,
} from '../../../src/crypto/signing/ed25519.js';
import { signAgentCard, verifySignedAgentCard, parseSignedCard } from '../../../src/crypto/signing/agent-card.js';
import type { AgentCard } from '../../../src/core/types.js';

describe('Ed25519', () => {
  it('generates a valid key pair', () => {
    const kp = generateSigningKeyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(32);
  });

  it('signs and verifies a message', () => {
    const kp = generateSigningKeyPair();
    const msg = new TextEncoder().encode('hello pilox');
    const sig = sign(msg, kp.secretKey);

    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
    expect(verify(sig, msg, kp.publicKey)).toBe(true);
  });

  it('rejects tampered messages', () => {
    const kp = generateSigningKeyPair();
    const msg = new TextEncoder().encode('hello pilox');
    const sig = sign(msg, kp.secretKey);

    const tampered = new TextEncoder().encode('hello evil');
    expect(verify(sig, tampered, kp.publicKey)).toBe(false);
  });

  it('rejects wrong key', () => {
    const kp1 = generateSigningKeyPair();
    const kp2 = generateSigningKeyPair();
    const msg = new TextEncoder().encode('test');
    const sig = sign(msg, kp1.secretKey);

    expect(verify(sig, msg, kp2.publicKey)).toBe(false);
  });

  it('hex roundtrips correctly', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const hex = bytesToHex(original);
    expect(hex).toBe('00017f80ff');
    const restored = hexToBytes(hex);
    expect(restored).toEqual(original);
  });
});

describe('Agent Card signing', () => {
  const testCard = {
    name: 'test-agent',
    url: 'http://localhost:3000',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [],
  } as unknown as AgentCard;

  it('signs and verifies an Agent Card', () => {
    const kp = generateSigningKeyPair();
    const signed = signAgentCard(testCard, kp);

    expect(signed.card).toBeTruthy();
    expect(signed.signature).toBeTruthy();
    expect(signed.signerPublicKey).toBeTruthy();
    expect(signed.signedAt).toBeTruthy();
    expect(verifySignedAgentCard(signed)).toBe(true);
  });

  it('detects tampered card', () => {
    const kp = generateSigningKeyPair();
    const signed = signAgentCard(testCard, kp);

    signed.card = signed.card.replace('test-agent', 'evil-agent');
    expect(verifySignedAgentCard(signed)).toBe(false);
  });

  it('parses the card from signed payload', () => {
    const kp = generateSigningKeyPair();
    const signed = signAgentCard(testCard, kp);
    const parsed = parseSignedCard(signed);

    expect(parsed.name).toBe('test-agent');
    expect(parsed.url).toBe('http://localhost:3000');
  });
});
