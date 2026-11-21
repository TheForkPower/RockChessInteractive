import { lazy } from "react";

// The pages that need the most code load on their own. They are fetched quietly once the first page is up
// (see Shell), so moving between pages doesn't wait.
const loaders = {
  create: () => import("../features/create/CreatePage").then((m) => ({ default: m.CreatePage })),
  review: () => import("../features/review/ReviewPage").then((m) => ({ default: m.ReviewPage })),
  settings: () => import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
  design: () => import("../features/design/DesignPage").then((m) => ({ default: m.DesignPage })),
};

export const CreatePage = lazy(loaders.create);
export const ReviewPage = lazy(loaders.review);
export const SettingsPage = lazy(loaders.settings);
export const DesignPage = lazy(loaders.design);

/** Starts fetching the pages that load on their own. Called when the browser is idle. */
export function preloadPages(): void {
  for (const load of Object.values(loaders)) void load().catch(() => {});
}
