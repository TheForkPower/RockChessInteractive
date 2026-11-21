/**
 * Browsers may clear a site's saved data when they are short of space, and Safari clears it after a week
 * without a visit. Asking for "persistent" storage tells the browser not to. Whether it agrees is up to the browser.
 */
export type Protection = "protected" | "unprotected" | "unsupported";

const storage = (): StorageManager | null => (typeof navigator !== "undefined" && navigator.storage ? navigator.storage : null);

export async function protectionStatus(): Promise<Protection> {
  const manager = storage();
  if (!manager || typeof manager.persisted !== "function") return "unsupported";
  try {
    return (await manager.persisted()) ? "protected" : "unprotected";
  } catch {
    return "unsupported";
  }
}

/** Asks the browser to keep the data. Resolves to the answer, and never throws. */
export async function requestProtection(): Promise<Protection> {
  const manager = storage();
  if (!manager || typeof manager.persist !== "function") return "unsupported";
  try {
    return (await manager.persist()) ? "protected" : "unprotected";
  } catch {
    return "unsupported";
  }
}

/** How much space the saved data takes, in bytes, or null when the browser won't say. */
export async function storageUsed(): Promise<number | null> {
  const manager = storage();
  if (!manager || typeof manager.estimate !== "function") return null;
  try {
    return (await manager.estimate()).usage ?? null;
  } catch {
    return null;
  }
}

let asked = false;

/** Asks once per visit, quietly, after the person has saved something worth keeping. */
export function protectOnce(): void {
  if (asked) return;
  asked = true;
  void protectionStatus().then((status) => {
    if (status === "unprotected") void requestProtection();
  });
}
