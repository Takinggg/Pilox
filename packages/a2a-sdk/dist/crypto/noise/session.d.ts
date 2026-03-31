import type { NoiseHandshakeResult } from './types.js';
/**
 * Noise transport session for encrypting/decrypting messages
 * after the handshake is complete.
 */
export declare class NoiseSession {
    private readonly keys;
    private sendNonce;
    private recvNonce;
    constructor(keys: NoiseHandshakeResult);
    /** Encrypt a plaintext message */
    encrypt(plaintext: Uint8Array): {
        ciphertext: Uint8Array;
        nonce: number;
    };
    /** Decrypt a ciphertext message */
    decrypt(ciphertext: Uint8Array, nonce: number): Uint8Array;
    /** Get remote peer's static public key */
    getRemoteStaticKey(): Uint8Array;
    private buildNonce;
}
//# sourceMappingURL=session.d.ts.map