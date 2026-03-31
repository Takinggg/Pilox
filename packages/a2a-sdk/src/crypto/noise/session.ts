import { chacha20poly1305 } from '@noble/ciphers/chacha';
import type { NoiseHandshakeResult } from './types.js';

/**
 * Noise transport session for encrypting/decrypting messages
 * after the handshake is complete.
 */
export class NoiseSession {
  private sendNonce = 0;
  private recvNonce = 0;

  constructor(private readonly keys: NoiseHandshakeResult) {}

  /** Encrypt a plaintext message */
  encrypt(plaintext: Uint8Array): { ciphertext: Uint8Array; nonce: number } {
    const nonce = this.sendNonce++;
    const nonceBytes = this.buildNonce(nonce);
    const cipher = chacha20poly1305(this.keys.sendKey, nonceBytes);
    const ciphertext = cipher.encrypt(plaintext);
    return { ciphertext, nonce };
  }

  /** Decrypt a ciphertext message */
  decrypt(ciphertext: Uint8Array, nonce: number): Uint8Array {
    const nonceBytes = this.buildNonce(nonce);
    const decipher = chacha20poly1305(this.keys.recvKey, nonceBytes);
    return decipher.decrypt(ciphertext);
  }

  /** Get remote peer's static public key */
  getRemoteStaticKey(): Uint8Array {
    return this.keys.remoteStaticKey;
  }

  private buildNonce(counter: number): Uint8Array {
    const nonce = new Uint8Array(12);
    const view = new DataView(nonce.buffer);
    // Put counter in last 8 bytes (little-endian)
    view.setUint32(4, counter & 0xffffffff, true);
    view.setUint32(8, Math.floor(counter / 0x100000000), true);
    return nonce;
  }
}
