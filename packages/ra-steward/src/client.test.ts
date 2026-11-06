import { afterEach, describe, expect, it, vi } from "vitest";
import { StewardClient } from "./client";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("downloads", () => {
  it.each([
    ["https://api.example.test/admin", "/admin/shop/downloads/token", "https://api.example.test/admin/shop/downloads/token"],
    ["/admin", "/admin/shop/downloads/token", "/admin/shop/downloads/token"],
  ])("uses the backend origin for base %s", async (baseUrl, url, expected) => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response("file", { headers: { "Admin-Version": "v2" } }));
    vi.stubGlobal("fetch", fetch);
    const a = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => a, body: { appendChild: vi.fn() } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const onVersion = vi.fn();
    const client = new StewardClient({ baseUrl, headers: () => ({ Authorization: "Bearer test" }), onVersion });
    await client.download(url, "file.txt");
    expect(fetch).toHaveBeenCalledWith(expected, expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test", Accept: "*/*" }) }));
    expect(onVersion).toHaveBeenCalledWith("shop", "v2");
    expect(a.download).toBe("file.txt");
    expect(a.click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:download");
  });
});
