export interface NoiseKeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
}
export interface NoiseSessionState {
    established: boolean;
    localKeyPair: NoiseKeyPair;
    remoteStaticKey?: Uint8Array;
    sendKey?: Uint8Array;
    recvKey?: Uint8Array;
    sendNonce: number;
    recvNonce: number;
}
export interface NoiseHandshakeResult {
    sendKey: Uint8Array;
    recvKey: Uint8Array;
    remoteStaticKey: Uint8Array;
}
/** Envelope for Noise-encrypted A2A payloads */
export interface NoiseEnvelope {
    _pilox_noise_envelope: {
        ciphertext: string;
        nonce: number;
    };
}
/** Handshake init message embedded in first request */
export interface NoiseHandshakeInit {
    _pilox_noise_init: {
        ephemeralKey: string;
        ciphertext: string;
    };
}
/** Handshake response */
export interface NoiseHandshakeResp {
    _pilox_noise_resp: {
        ephemeralKey: string;
        ciphertext: string;
    };
}
//# sourceMappingURL=types.d.ts.map