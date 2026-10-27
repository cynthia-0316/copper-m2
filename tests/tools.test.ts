// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateCost,
  calculateCostInput,
  checkAvailability,
  checkAvailabilityInput,
  copperTools,
  getPrices,
  listProducts,
} from "@/lib/copper/assistant/tools";
import * as inventory from "@/lib/copper/inventory";

afterEach(() => vi.restoreAllMocks());

describe("calculate_cost", () => {
  it("counts Copper Plus once: Copper Home, annual, 2 years is $307", () => {
    const r = calculateCost({
      products: ["copper-home"],
      plan: "copper-plus",
      billing: "annual",
      years: 2,
    });
    expect(r.totalUsd).toBe(307);
    expect(r.lines.map((l) => l.usd)).toEqual([149, 158]);
  });

  it("charges Plus once for two devices, and rounds monthly billing", () => {
    const r = calculateCost({
      products: ["copper-home", "copper-home"],
      plan: "copper-plus",
      billing: "monthly",
      years: 2,
    });
    expect(r.lines).toHaveLength(3);
    expect(r.totalUsd).toBe(489.76);
  });

  it("adds no line for the free plan, and allows no devices", () => {
    expect(
      calculateCost({
        products: [],
        plan: "free",
        billing: "annual",
        years: 1,
      }),
    ).toEqual({ lines: [], totalUsd: 0 });
  });

  it("rejects input outside the contract", () => {
    const ok = {
      products: ["copper-home"],
      plan: "free",
      billing: "annual",
      years: 1,
    };
    expect(calculateCostInput.safeParse(ok).success).toBe(true);
    for (const bad of [
      { ...ok, products: ["copper-pro"] },
      { ...ok, products: Array(6).fill("copper-home") },
      { ...ok, plan: "gold" },
      { ...ok, years: 0 },
      { ...ok, years: 6 },
      { ...ok, years: 1.5 },
    ]) {
      expect(calculateCostInput.safeParse(bad).success).toBe(false);
    }
  });
});

describe("catalog tools", () => {
  it("get_products returns colors and no stock", () => {
    const notes = listProducts().products.find((p) => p.id === "copper-notes");
    expect(notes?.colors).toEqual([
      "Brushed Copper",
      "Desert Sand",
      "Night Sky",
    ]);
    expect(JSON.stringify(listProducts())).not.toMatch(/stock/i);
  });

  it("get_prices returns every product and plan", () => {
    const p = getPrices();
    expect(p.products).toHaveLength(2);
    expect(p.plans.map((x) => x.id)).toEqual(["free", "copper-plus"]);
  });

  it("copperTools has exactly the four described tools", () => {
    expect(Object.keys(copperTools).sort()).toEqual([
      "calculate_cost",
      "check_availability",
      "get_prices",
      "get_products",
    ]);
    for (const t of Object.values(copperTools)) {
      expect(t.description).toBeTruthy();
    }
  });
});

describe("check_availability", () => {
  it("reports a backordered color with its restock date", async () => {
    const r = await checkAvailability({
      product: "copper-notes",
      color: "night sky",
    });
    expect(r).toEqual({
      status: "ok",
      product: "Copper Notes",
      colors: [
        { color: "Night Sky", stock: "backordered", restockDate: "2026-11-14" },
      ],
    });
  });

  it("reports low stock and in stock for every color", async () => {
    const r = await checkAvailability({ product: "copper-home" });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.colors.map((c) => [c.color, c.stock])).toEqual([
      ["Polished Copper", "in_stock"],
      ["Patina Teal", "low_stock"],
      ["Night Sky", "in_stock"],
    ]);
  });

  it("says Patina Teal is not a Copper Notes color, not out of stock", async () => {
    const r = await checkAvailability({
      product: "copper-notes",
      color: "Patina Teal",
    });
    expect(r).toEqual({
      status: "not_a_color",
      product: "Copper Notes",
      color: "Patina Teal",
      colors: ["Brushed Copper", "Desert Sand", "Night Sky"],
    });
  });

  it("says stock is unavailable without stock words, but checks colors first", async () => {
    vi.spyOn(inventory, "readInventory").mockResolvedValue(null);
    const r = await checkAvailability({ product: "copper-home" });
    expect(r.status).toBe("unavailable");
    expect(JSON.stringify(r)).not.toMatch(/in_stock|low_stock|backordered/);
    const bad = await checkAvailability({
      product: "copper-notes",
      color: "Patina Teal",
    });
    expect(bad.status).toBe("not_a_color");
  });

  it("only accepts Copper products", () => {
    expect(
      checkAvailabilityInput.safeParse({ product: "toaster" }).success,
    ).toBe(false);
  });
});
