// The stations Ask Copper draws for one answer: the tools on offer, Copper's
// thinking, each tool call (what it sent, what came back) and the reply.
// Every price shown here is read from the tool's own result, never typed in.
import {
  BrainIcon,
  SparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const asList = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(asRow) : [];
const asText = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/** A product or plan id as its catalog name ("copper-home" → "Copper Home"). */
function nameOf(id: unknown): string {
  const key = asText(id);
  const found = [...getProducts(), ...getPlans()].find(
    (item) => item.id === key,
  );
  return found?.name ?? key;
}

/** "2026-11-14" → "Nov 14, 2026". */
function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}

const usd = (value: unknown) =>
  typeof value === "number" ? formatUsd(value) : "";

// ---------------------------------------------------------------------------
// The rail and its stations
// ---------------------------------------------------------------------------

function Station({
  icon: Icon,
  node,
  label,
  tone,
  children,
}: {
  icon?: LucideIcon;
  node?: ReactNode;
  label?: string;
  tone: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative pb-4">
      <span
        className={cn(
          "absolute top-0 -left-9 flex size-6 items-center justify-center rounded-full ring-4 ring-secondary",
          tone,
        )}
      >
        {node ?? (Icon && <Icon className="size-3.5" />)}
      </span>
      {label && (
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

/** Renders the **bold** and `code` marks in a thinking summary. */
function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function Thinking({ text, tools }: { text: string; tools: boolean }) {
  return (
    <Station
      icon={BrainIcon}
      label="Copper is thinking"
      tone={
        tools
          ? "bg-primary text-primary-foreground"
          : "bg-chart-3 text-primary-foreground"
      }
    >
      <div
        data-testid="thinking"
        className="text-muted-foreground space-y-1 border-l-2 pl-3 text-sm italic"
      >
        {text.split(/\n{2,}/).map((paragraph, i) => (
          <p key={i}>
            <Inline text={paragraph} />
          </p>
        ))}
      </div>
    </Station>
  );
}

// ---------------------------------------------------------------------------
// The tool card
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="text-muted-foreground w-20 shrink-0">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Sent({ step }: { step: ToolStep }) {
  if (step.input === undefined) {
    return (
      <p className="text-muted-foreground text-sm italic">
        filling in the details…
      </p>
    );
  }
  const input = asRow(step.input);
  if (step.name === "get_prices") {
    return <p className="text-sm">Nothing, it just asked for the price list</p>;
  }
  if (step.name === "get_products") {
    return <p className="text-sm">Nothing, it just asked what Copper sells</p>;
  }
  if (step.name === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <dl className="space-y-0.5">
        <Field
          label="Products"
          value={products.length ? products.map(nameOf).join(", ") : "None"}
        />
        <Field label="Plan" value={nameOf(input.plan)} />
        <Field label="Billing" value={asText(input.billing)} />
        <Field label="Years" value={asText(input.years)} />
      </dl>
    );
  }
  if (step.name === "check_availability") {
    return (
      <dl className="space-y-0.5">
        <Field label="Product" value={nameOf(input.product)} />
        <Field label="Color" value={asText(input.color) || "All colors"} />
      </dl>
    );
  }
  return <p className="text-sm">{JSON.stringify(step.input)}</p>;
}

const PILL = "rounded-full px-2 py-0.5 text-xs font-medium";

function StockPill({
  stock,
  restockDate,
}: {
  stock: string;
  restockDate: unknown;
}) {
  if (stock === "in_stock") {
    return (
      <span className={cn(PILL, "bg-accent text-accent-foreground")}>
        In stock
      </span>
    );
  }
  if (stock === "low_stock") {
    return (
      <span className={cn(PILL, "bg-chart-4 text-chart-5")}>Low stock</span>
    );
  }
  const date = asText(restockDate);
  return (
    <span className={cn(PILL, "bg-chart-3 text-primary-foreground")}>
      {date ? `Back-ordered until ${formatDate(date)}` : "Back-ordered"}
    </span>
  );
}

function Came({ step }: { step: ToolStep }) {
  if (step.state === "calling") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner className="size-3.5" />
        the app is running the code…
      </p>
    );
  }
  if (typeof step.output === "string") {
    return <p className="text-sm">{step.output}</p>;
  }
  const out = asRow(step.output);

  if (step.name === "calculate_cost") {
    return (
      <div className="space-y-1 text-sm">
        {asList(out.lines).map((line, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span>{asText(line.item)}</span>
            <span>{usd(line.usd)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t pt-2">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-2xl font-bold">
            {usd(out.totalUsd)}
          </span>
        </div>
      </div>
    );
  }

  if (step.name === "get_products") {
    return (
      <div className="space-y-3 text-sm">
        {asList(out.products).map((product, i) => (
          <div key={i}>
            <div className="flex justify-between gap-3 font-medium">
              <span>{asText(product.name)}</span>
              <span>{usd(product.priceUsd)}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {asText(product.type)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(Array.isArray(product.colors) ? product.colors : []).map(
                (color) => (
                  <span
                    key={asText(color)}
                    className={cn(PILL, "bg-accent text-accent-foreground")}
                  >
                    {asText(color)}
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (step.name === "get_prices") {
    return (
      <div className="space-y-1 text-sm">
        {asList(out.products).map((product, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span>{asText(product.name)}</span>
            <span>{usd(product.priceUsd)}</span>
          </div>
        ))}
        {asList(out.plans)
          .filter(
            (plan) => Number(plan.monthlyUsd) > 0 || Number(plan.annualUsd) > 0,
          )
          .map((plan, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span>{asText(plan.name)}</span>
              <span>
                {usd(plan.monthlyUsd)}/mo · {usd(plan.annualUsd)}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  if (step.name === "check_availability") {
    if (out.status === "not_a_color") {
      const colors = Array.isArray(out.colors) ? out.colors.map(asText) : [];
      return (
        <p className="text-sm">
          {asText(out.product)} doesn&apos;t come in {asText(out.color)}. It
          comes in {colors.join(", ")}.
        </p>
      );
    }
    if (out.status === "unavailable") {
      return <p className="text-sm">{asText(out.message)}</p>;
    }
    const colors = asList(out.colors);
    return (
      <div className="space-y-1 text-sm">
        {colors.length === 0 && <p>No stock rows found.</p>}
        {colors.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span>{asText(row.color)}</span>
            <StockPill
              stock={asText(row.stock)}
              restockDate={row.restockDate}
            />
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-sm">{JSON.stringify(step.output)}</p>;
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-lg border"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-3 py-2 text-sm">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="rounded bg-black/15 px-1.5 text-xs">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name] ?? ""}</span>
      </div>
      <div className="p-3">
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-widest uppercase">
          → What Copper sent
        </p>
        <Sent step={step} />
      </div>
      <div className="bg-accent/10 border-t p-3">
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-widest uppercase">
          ← What came back
        </p>
        <Came step={step} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One whole answer
// ---------------------------------------------------------------------------

function nowText(progress: Progress | null, tools: boolean): string {
  if (progress?.reply) return "Writing the answer…";
  if (!tools) return "Answering from memory…";
  return progress && progress.steps.length > 0
    ? "Deciding what to do next…"
    : "Reading your question…";
}

export function Answer({
  progress,
  tools,
}: {
  progress: Progress | null;
  tools: boolean;
}) {
  const steps = progress?.steps ?? [];
  const toolSteps = steps.filter((s): s is ToolStep => s.type === "tool");
  const used = new Set(toolSteps.map((s) => s.name));
  const working = !progress || progress.status === "working";
  const showReply = Boolean(progress && (progress.reply || !working));

  return (
    <div>
      <div className="relative pl-9">
        <div
          className={cn(
            "absolute top-3 bottom-3 left-3 w-0.5 -translate-x-1/2 rounded-full",
            tools
              ? "bg-linear-to-b from-primary via-accent to-accent"
              : "bg-chart-3",
          )}
        />

        <Station
          icon={SparklesIcon}
          tone={
            tools
              ? "bg-accent text-accent-foreground"
              : "bg-chart-3 text-primary-foreground"
          }
          label={tools ? "Tools Copper can use" : "Tools given to Copper: none"}
        >
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(TOOL_LABELS).map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-xs",
                  !tools && "text-muted-foreground line-through",
                  tools && used.has(name)
                    ? "bg-accent text-accent-foreground font-bold"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!tools && (
            <p className="text-muted-foreground mt-1.5 text-sm">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {steps.map((step, i) =>
          step.type === "thinking" ? (
            <Thinking key={i} text={step.text} tools={tools} />
          ) : (
            <Station
              key={step.id}
              icon={WrenchIcon}
              tone="bg-accent text-accent-foreground"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={toolSteps.indexOf(step) + 1} />
            </Station>
          ),
        )}

        {working && (
          <Station
            tone="bg-card gap-0.5"
            node={[0, 1, 2].map((n) => (
              <span
                key={n}
                className="bg-primary size-1 animate-bounce rounded-full"
                style={{ animationDelay: `${n * 120}ms` }}
              />
            ))}
          >
            <p className="text-muted-foreground text-sm">
              {nowText(progress, tools)}
            </p>
          </Station>
        )}
      </div>

      {showReply && progress && (
        <div className="bg-card mt-1 rounded-2xl rounded-tl-sm border p-3">
          <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
          {!tools && (
            <div className="border-chart-3 mb-2 rounded-md border p-2 text-sm">
              <strong>⚠ Answered without tools: may be made up</strong>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">
            {progress.reply}
            {working && (
              <span className="bg-primary ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}
    </div>
  );
}
