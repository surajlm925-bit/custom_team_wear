import "./support/testEnv.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOpenAiMockup } from "../src/mockup/openaiClient.js";
import { generateMockupImage } from "../src/mockup/imageProvider.js";
import { __resetEnvForTests } from "../src/config/env.js";

test("generateOpenAiMockup throws if no OpenAI API key is configured", async () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origApi = process.env.OPENAI_API;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API;
  __resetEnvForTests();

  try {
    await assert.rejects(
      async () => {
        await generateOpenAiMockup({
          templateImage: Buffer.from("fake-template"),
          logoImages: [Buffer.from("fake-logo")],
          prompt: "test prompt",
        });
      },
      {
        message: /OPENAI_API_KEY/,
      },
    );
  } finally {
    if (origKey) process.env.OPENAI_API_KEY = origKey;
    if (origApi) process.env.OPENAI_API = origApi;
    __resetEnvForTests();
  }
});

test("generateOpenAiMockup calls OpenAI /v1/images/edits and parses b64_json response", async () => {
  const origFetch = globalThis.fetch;
  const origKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-sk-openai-key";
  __resetEnvForTests();

  const fakePngBase64 = Buffer.from("synthetic-openai-image-bytes").toString("base64");
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  try {
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const input = args[0];
      const init = args[1];
      capturedUrl = typeof input === "string" ? input : (input as { url?: string }).url ?? input.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({
          data: [{ b64_json: fakePngBase64 }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const res = await generateOpenAiMockup({
      templateImage: Buffer.from("fake-template-bytes"),
      logoImages: [Buffer.from("fake-logo-bytes")],
      prompt: "place logo on left chest of polo",
    });

    assert.equal(capturedUrl, "https://api.openai.com/v1/images/edits");
    assert.equal(capturedHeaders.Authorization, "Bearer test-sk-openai-key");
    assert.equal(res.model, "gpt-image-2.5-flare-2026-09-08");
    assert.equal(res.imageBuffer.toString("utf8"), "synthetic-openai-image-bytes");
  } finally {
    globalThis.fetch = origFetch;
    if (origKey) {
      process.env.OPENAI_API_KEY = origKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    __resetEnvForTests();
  }
});

test("generateMockupImage selects openai provider by default or explicitly", async () => {
  const origFetch = globalThis.fetch;
  const origKey = process.env.OPENAI_API_KEY;
  const origProv = process.env.MOCKUP_IMAGE_PROVIDER;

  process.env.OPENAI_API_KEY = "test-sk-openai-key";
  process.env.MOCKUP_IMAGE_PROVIDER = "openai";
  __resetEnvForTests();

  const fakePngBase64 = Buffer.from("mockup-result-png").toString("base64");

  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: fakePngBase64 }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const res = await generateMockupImage({
      templateImage: Buffer.from("template"),
      logoImages: [Buffer.from("logo")],
      prompt: "prompt",
    });

    assert.equal(res.imageBuffer.toString("utf8"), "mockup-result-png");
  } finally {
    globalThis.fetch = origFetch;
    if (origKey) process.env.OPENAI_API_KEY = origKey;
    else delete process.env.OPENAI_API_KEY;
    if (origProv) process.env.MOCKUP_IMAGE_PROVIDER = origProv;
    else delete process.env.MOCKUP_IMAGE_PROVIDER;
    __resetEnvForTests();
  }
});
