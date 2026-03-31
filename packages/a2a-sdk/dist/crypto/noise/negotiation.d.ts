import type { AgentCard } from '../../core/types.js';
export declare const HIVE_NOISE_EXTENSION = "pilox:noise:ik:v1";
export declare const HIVE_SIGNING_EXTENSION = "pilox:signing:ed25519:v1";
/** Check if an Agent Card supports Pilox Noise E2E */
export declare function supportsNoise(card: AgentCard): boolean;
/** Extract Noise public key from Agent Card extensions */
export declare function getNoisePublicKey(card: AgentCard): Uint8Array | null;
/** Extract signing public key from Agent Card extensions */
export declare function getSigningPublicKey(card: AgentCard): Uint8Array | null;
/** Add Pilox extensions to an Agent Card */
export declare function addPiloxExtensions(card: AgentCard, noisePublicKey?: Uint8Array, signingPublicKey?: Uint8Array): AgentCard;
//# sourceMappingURL=negotiation.d.ts.map