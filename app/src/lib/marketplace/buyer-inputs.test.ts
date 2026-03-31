// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { collectBuyerInputs, mergeEnvPrefillLines } from "./buyer-inputs";

describe("collectBuyerInputs", () => {
  it("merges record and Agent Card metadata with card overriding same id", () => {
    const record = {
      buyerInputs: [
        { id: "a", label: "API key", key: "API_KEY", description: "old" },
      ],
    };
    const card = {
      metadata: {
        piloxBuyerInputs: [
          { id: "a", label: "API key", key: "API_KEY", description: "new", required: true },
        ],
      },
    };
    const out = collectBuyerInputs(record, card);
    expect(out).toHaveLength(1);
    expect(out[0]!.description).toBe("new");
    expect(out[0]!.required).toBe(true);
  });

  it("reads root-level piloxBuyerInputs on card", () => {
    const card = {
      piloxBuyerInputs: [{ label: "Webhook URL", kind: "url", key: "WEBHOOK_URL" }],
    };
    const out = collectBuyerInputs({}, card);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("url");
    expect(out[0]!.key).toBe("WEBHOOK_URL");
  });
});

describe("mergeEnvPrefillLines", () => {
  it("unions manifest keys and publisher env-ish keys", () => {
    const lines = mergeEnvPrefillLines(
      ["FOO"],
      [{ id: "x", label: "Bar", kind: "env", key: "BAR" }],
    );
    expect(lines).toBe("FOO=\nBAR=");
  });
});
