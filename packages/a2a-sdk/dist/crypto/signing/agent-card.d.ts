import type { AgentCard } from '../../core/types.js';
import type { SigningKeyPair } from '../../config/types.js';
export interface SignedAgentCard {
    /** Serialized Agent Card JSON */
    card: string;
    /** Ed25519 signature (hex) */
    signature: string;
    /** Signer's public key (hex) */
    signerPublicKey: string;
    /** ISO 8601 timestamp */
    signedAt: string;
}
/** Sign an Agent Card */
export declare function signAgentCard(card: AgentCard, keyPair: SigningKeyPair): SignedAgentCard;
/** Verify a signed Agent Card */
export declare function verifySignedAgentCard(signed: SignedAgentCard): boolean;
/** Parse the Agent Card from a signed card */
export declare function parseSignedCard(signed: SignedAgentCard): AgentCard;
//# sourceMappingURL=agent-card.d.ts.map