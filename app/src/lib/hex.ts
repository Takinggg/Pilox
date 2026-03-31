export function hexToBytes(hex: string): Uint8Array {
  const trimmed = hex.trim();
  if (trimmed.length % 2 !== 0) throw new Error("invalid hex length");
  return Uint8Array.from(Buffer.from(trimmed, "hex"));
}

