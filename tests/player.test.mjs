import test from "node:test";
import assert from "node:assert/strict";
import { inspectStreamUrl } from "../src/player-utils.js";

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
