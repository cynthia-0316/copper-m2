"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const APOLOGY = "Sorry, I couldn't answer that just now. Please try again.";

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = { steps: [], reply: "", status: "working" };

  // A fresh copy every time: the panel may keep earlier updates, so they
  // mustn't change when this object does.
  const snapshot = (): Progress => ({
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  });

  const toolStep = (id: string, name?: string): ToolStep | undefined => {
    const found = progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );
    if (found || name === undefined) return found;
    const created: ToolStep = { type: "tool", id, name, state: "calling" };
    progress.steps.push(created);
    return created;
  };

  async function run() {
    try {
      // With tools off the model gets no instructions and no tools, only the
      // conversation, so it has to answer from memory alone.
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        {
          messages: request.messages,
          providerOptions: THOUGHT_SUMMARIES,
          ...(request.useTools
            ? {
                instructions: COPPER_INSTRUCTIONS,
                tools: copperTools,
                stopWhen: stepCountIs(MAX_STEPS),
              }
            : {}),
        },
      );

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            const last = progress.steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else progress.steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start":
            toolStep(part.id, part.toolName);
            break;
          case "tool-call": {
            const step = toolStep(part.toolCallId, part.toolName);
            if (step) step.input = part.input;
            break;
          }
          case "tool-result": {
            const step = toolStep(part.toolCallId, part.toolName);
            if (step) {
              step.output = part.output;
              step.state = "done";
            }
            break;
          }
          case "tool-error": {
            const step = toolStep(part.toolCallId, part.toolName);
            if (step) {
              step.output =
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error);
              step.state = "error";
            }
            break;
          }
          case "text-delta":
            progress.reply += part.text;
            break;
          case "error":
            throw part.error;
          default:
            continue;
        }
        update(snapshot());
      }

      progress.status = "done";
      if (!progress.reply.trim()) progress.reply = APOLOGY;
      done(snapshot());
    } catch {
      progress.status = "error";
      if (!progress.reply.trim()) progress.reply = APOLOGY;
      done(snapshot());
    }
  }

  // Send the first (empty) update, then hand back the live value straight
  // away and read the stream in the background.
  update(snapshot());
  void run();
  return { progress: live };
}
