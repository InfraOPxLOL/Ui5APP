import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { decodeGzipBase64Text } from "../../../src/sdk/providers/SplunkPayloadCodec.js";

describe("sdk/providers/decodeGzipBase64Text", () => {
  it("round-trips gzip+base64-encoded text", () => {
    const original = "<Order><Id>1</Id></Order>";
    const encoded = gzipSync(Buffer.from(original, "utf8")).toString("base64");
    assert.equal(decodeGzipBase64Text(encoded), original);
  });

  it("throws for base64 data that isn't valid gzip", () => {
    const notGzip = Buffer.from("plain text, not compressed", "utf8").toString("base64");
    assert.throws(() => decodeGzipBase64Text(notGzip));
  });
});
