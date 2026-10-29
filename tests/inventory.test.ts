// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readInventory } from "@/lib/copper/inventory";
import * as supabaseServer from "@/lib/supabase/server";

afterEach(() => vi.restoreAllMocks());

// A stand-in for the Supabase client: select() hands back a chain whose last
// link, order(), resolves with whatever result the test wants.
function fakeClient(result: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  vi.spyOn(supabaseServer, "createStatelessClient").mockReturnValue({
    from,
  } as unknown as ReturnType<typeof supabaseServer.createStatelessClient>);
  return { from };
}

const row = {
  sku: "CN-NSK",
  product: "Copper Notes",
  color: "Night Sky",
  units_in_stock: 0,
  next_shipment: "2026-11-14",
};

describe("readInventory", () => {
  it("returns every row from the Supabase inventory table", async () => {
    const { from } = fakeClient({ data: [row], error: null });
    await expect(readInventory()).resolves.toEqual([row]);
    expect(from).toHaveBeenCalledWith("inventory");
  });

  it("returns null when Supabase reports an error", async () => {
    fakeClient({ data: null, error: { message: "project paused" } });
    await expect(readInventory()).resolves.toBeNull();
  });

  it("returns null when Supabase isn't set up", async () => {
    vi.spyOn(supabaseServer, "createStatelessClient").mockReturnValue(null);
    await expect(readInventory()).resolves.toBeNull();
  });
});
