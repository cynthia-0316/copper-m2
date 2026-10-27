// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalValue, readLive } from "@/lib/ai/live";
import type { Progress } from "@/lib/copper/assistant/progress";

type Part = Record<string, unknown>;
let parts: Part[] = [];
let throwFirst = false;
let lastOptions: Record<string, unknown> = {};

vi.mock("@/lib/ai/call", () => ({
  THOUGHT_SUMMARIES: { google: {} },
  callStream: (_info: unknown, options: Record<string, unknown>) => {
    lastOptions = options;
    return {
      fullStream: (async function* () {
        if (throwFirst) throw new Error("model down");
        for (const part of parts) yield part;
      })(),
    };
  },
}));

const messages = [{ role: "user" as const, content: "Hi" }];

async function run(useTools = true) {
  const { askCopper } = await import("@/lib/copper/assistant/ask");
  return askCopper({ messages, useTools });
}

beforeEach(() => {
  parts = [];
  throwFirst = false;
  lastOptions = {};
});

describe("askCopper", () => {
  it("replaces an empty reply with an apology but still finishes as done", async () => {
    const final = await finalValue((await run()).progress);
    expect(final.status).toBe("done");
    expect(final.reply).toMatch(/sorry/i);
  });

  it("never replaces or adds to a real reply", async () => {
    parts = [{ type: "text-delta", id: "1", text: "Hello" }];
    const final = await finalValue((await run()).progress);
    expect(final).toMatchObject({ status: "done", reply: "Hello" });
  });

  it("finishes with an error and an apology when the model throws", async () => {
    throwFirst = true;
    const final = await finalValue((await run()).progress);
    expect(final.status).toBe("error");
    expect(final.reply).toMatch(/sorry/i);
  });

  it("keeps one step per tool call and hands out copies", async () => {
    parts = [
      { type: "tool-input-start", id: "t1", toolName: "get_prices" },
      {
        type: "tool-call",
        toolCallId: "t1",
        toolName: "get_prices",
        input: {},
      },
      {
        type: "tool-result",
        toolCallId: "t1",
        toolName: "get_prices",
        output: { ok: 1 },
      },
      { type: "text-delta", id: "1", text: "Done" },
    ];
    const updates: Progress[] = [];
    for await (const u of readLive((await run()).progress)) updates.push(u);
    const named = updates.find((u) => u.steps.length > 0)!;
    expect(named.steps[0]).toMatchObject({
      state: "calling",
      name: "get_prices",
    });
    expect(updates.at(-1)!.steps).toHaveLength(1);
    expect(updates.at(-1)!.steps[0]).toMatchObject({
      state: "done",
      output: { ok: 1 },
    });
    // The earlier update did not change underneath us.
    expect(named.steps[0]).toMatchObject({ state: "calling" });
  });

  it("turns a tool error into an error step", async () => {
    parts = [
      { type: "tool-input-start", id: "t1", toolName: "calculate_cost" },
      {
        type: "tool-error",
        toolCallId: "t1",
        toolName: "calculate_cost",
        error: new Error("bad input"),
      },
      { type: "text-delta", id: "1", text: "Sorry about that" },
    ];
    const final = await finalValue((await run()).progress);
    expect(final.steps[0]).toMatchObject({
      state: "error",
      output: "bad input",
    });
  });

  it("sends instructions and tools only when tools are on", async () => {
    await finalValue((await run(true)).progress);
    expect(lastOptions.instructions).toBeTruthy();
    expect(Object.keys(lastOptions.tools as object)).toHaveLength(4);
    await finalValue((await run(false)).progress);
    expect(lastOptions.instructions).toBeUndefined();
    expect(lastOptions.tools).toBeUndefined();
    expect(lastOptions.providerOptions).toBeTruthy();
  });
});
