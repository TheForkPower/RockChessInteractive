import { afterEach, describe, expect, it, vi } from "vitest";
import { protectionStatus, requestProtection, storageUsed } from "./persist";

function stubStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal("navigator", { storage });
}

afterEach(() => vi.unstubAllGlobals());

describe("keeping the data", () => {
  it("says so when the browser can't be asked", async () => {
    stubStorage(undefined);
    expect(await protectionStatus()).toBe("unsupported");
    expect(await requestProtection()).toBe("unsupported");
    expect(await storageUsed()).toBeNull();
  });

  it("reports whether the browser has agreed", async () => {
    stubStorage({ persisted: async () => true });
    expect(await protectionStatus()).toBe("protected");
    stubStorage({ persisted: async () => false });
    expect(await protectionStatus()).toBe("unprotected");
  });

  it("asks the browser to keep the data and reports its answer", async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persist });
    expect(await requestProtection()).toBe("protected");
    expect(persist).toHaveBeenCalledOnce();
    stubStorage({ persist: async () => false });
    expect(await requestProtection()).toBe("unprotected");
  });

  it("never throws when the browser does", async () => {
    stubStorage({
      persisted: async () => {
        throw new Error("blocked");
      },
      persist: async () => {
        throw new Error("blocked");
      },
      estimate: async () => {
        throw new Error("blocked");
      },
    });
    expect(await protectionStatus()).toBe("unsupported");
    expect(await requestProtection()).toBe("unsupported");
    expect(await storageUsed()).toBeNull();
  });

  it("reads how much space is used", async () => {
    stubStorage({ estimate: async () => ({ usage: 2048 }) });
    expect(await storageUsed()).toBe(2048);
  });
});
