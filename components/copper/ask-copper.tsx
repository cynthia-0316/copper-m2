"use client";

// Ask Copper: a floating chat panel. Each question goes to the askCopper
// server action, which streams back every step (thinking, tool calls, reply)
// for the panel to draw. Tools on and tools off are two separate chats.
import { ArrowUpIcon, MessageCircleIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Answer } from "@/components/copper/ask-copper-steps";
import { SetupRequired } from "@/components/setup-required";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

type Turn = { id: number; question: string; progress: Progress | null };
type Chats = { on: Turn[]; off: Turn[] };

const isWorking = (turn: Turn | undefined) =>
  Boolean(turn && (!turn.progress || turn.progress.status === "working"));

/** The finished turns of one chat, as the model should see them. */
function historyOf(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((turn) =>
    turn.progress && turn.progress.status !== "working"
      ? [
          { role: "user" as const, content: turn.question },
          { role: "assistant" as const, content: turn.progress.reply },
        ]
      : [],
  );
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Chats>({ on: [], off: [] });
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const body = useRef<HTMLDivElement>(null);

  // The header link, and loading the site at /#ask, open the panel. Clicking
  // the link again fires no hashchange, so listen for the click as well.
  useEffect(() => {
    const openIfAsk = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('a[href$="#ask"]')) setOpen(true);
    };
    openIfAsk();
    window.addEventListener("hashchange", openIfAsk);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openIfAsk);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const key = useTools ? "on" : "off";
  const turns = chats[key];
  const busy = isWorking(turns.at(-1));

  // Keep the newest step in view as the answer streams in.
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chats, key, open]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const chat = key;
    const id = nextId.current++;
    const messages = [
      ...historyOf(chats[chat]),
      { role: "user" as const, content: text },
    ];
    const setProgress = (progress: Progress | null) =>
      setChats((c) => ({
        ...c,
        [chat]: c[chat].map((t) => (t.id === id ? { ...t, progress } : t)),
      }));

    setDraft("");
    setChats((c) => ({
      ...c,
      [chat]: [...c[chat], { id, question: text, progress: null }],
    }));
    try {
      const { progress } = await askCopper({
        messages,
        useTools: chat === "on",
      });
      for await (const update of readLive(progress)) setProgress(update);
    } catch {
      setProgress({
        steps: [],
        reply: "Sorry, I couldn't answer that just now. Please try again.",
        status: "error",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircleIcon className="size-5" />
        Ask Copper
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          showCloseButton={false}
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <header className="bg-chart-5 text-primary-foreground">
            <div className="flex items-center gap-3 p-4">
              <span className="bg-primary grid size-10 shrink-0 place-items-center overflow-hidden rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper the mascot"
                  width={32}
                  height={32}
                  className="size-8 object-contain"
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base text-white">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-xs text-white/70">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose
                aria-label="Close"
                className="rounded-full p-1.5 text-white/80 hover:bg-white/10"
              >
                <XIcon className="size-5" />
              </SheetClose>
            </div>
            {aiConfigured && (
              <div className="flex items-center justify-between gap-3 bg-white/10 px-4 py-2">
                <div>
                  <p className="text-sm font-medium text-white">Use tools</p>
                  <p className="text-xs text-white/70">
                    {useTools ? "Checks every answer" : "Model guesses alone"}
                  </p>
                </div>
                <Switch
                  aria-label="Use tools"
                  checked={useTools}
                  onCheckedChange={setUseTools}
                />
              </div>
            )}
          </header>

          {aiConfigured ? (
            <>
              <div
                ref={body}
                className="bg-secondary flex-1 space-y-4 overflow-y-auto p-4"
              >
                {turns.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Hi, I&apos;m Copper! Ask me about our products, colors,
                    prices and stock.
                  </p>
                )}
                {turns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <div className="flex justify-end">
                      <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                        {turn.question}
                      </p>
                    </div>
                    <Answer progress={turn.progress} tools={key === "on"} />
                  </div>
                ))}
                {!busy && (
                  <div className="flex flex-col items-start gap-2">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => send(starter)}
                        className="bg-card hover:border-primary rounded-full border px-3 py-1.5 text-left text-sm"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
                className="bg-background flex items-center gap-2 border-t p-3"
              >
                <input
                  aria-label="Your question"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask about prices or stock…"
                  className="bg-card focus-visible:ring-primary min-w-0 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-2"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={busy || !draft.trim()}
                  className={cn(
                    "bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full",
                    "disabled:opacity-50",
                  )}
                >
                  <ArrowUpIcon className="size-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto p-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
