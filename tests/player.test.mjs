import test from "node:test";
import assert from "node:assert/strict";
import { inspectStreamUrl, secureStreamUrl } from "../src/player-utils.js";

test("tries HTTPS on the original hostname and preserves port and query", () => {
  assert.equal(secureStreamUrl("http://tv.example:8080/live.m3u8?key=value"), "https://tv.example:8080/live.m3u8?key=value");
  assert.equal(secureStreamUrl("http://192.0.2.1:8080/live.m3u8"), null);
  assert.equal(secureStreamUrl("http://user:pass@tv.example/live.m3u8"), null);
});

test("accepts HTTPS HLS URLs and detects manifests", () => {
  assert.deepEqual(inspectStreamUrl("https://tv.example/live.M3U8?token=abc", "https:"), {
    ok: true,
    url: "https://tv.example/live.M3U8?token=abc",
    isHls: true,
  });
});

test("blocks insecure streams on secure pages", () => {
  assert.deepEqual(inspectStreamUrl("http://tv.example/live.m3u8", "https:"), {
    ok: false,
    reason: "insecure",
  });
});

test("rejects malformed and non-web stream URLs", () => {
  assert.equal(inspectStreamUrl("not a url", "https:").reason, "invalid");
  assert.equal(inspectStreamUrl("javascript:alert(1)", "https:").reason, "protocol");
});

test("allows HTTP streams during local HTTP development", () => {
  assert.deepEqual(inspectStreamUrl("http://127.0.0.1/live.ts", "http:"), {
    ok: true,
    url: "http://127.0.0.1/live.ts",
    isHls: false,
  });
});
