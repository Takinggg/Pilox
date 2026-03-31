import type { SigningKeyPair } from '../../config/types.js';
/** Generate a new Ed25519 key pair */
export declare function generateSigningKeyPair(): SigningKeyPair;
/** Sign a message with Ed25519 */
export declare function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
/** Verify an Ed25519 signature */
export declare function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
/** Encode bytes to hex string */
export declare function bytesToHex(bytes: Uint8Array): string;
/** Decode hex string to bytes */
export declare function hexToBytes(hex: string): Uint8Array;
//# sourceMappingURL=ed25519.d.ts.map