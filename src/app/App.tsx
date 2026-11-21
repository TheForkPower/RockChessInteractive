import { Suspense } from "react";
import { Route, Routes } from "react-router";
import { DecksPage } from "../features/decks/DecksPage";
import { HomePage } from "../features/home/HomePage";
import { NotFoundPage } from "../features/home/NotFoundPage";
import { RecallPage } from "../features/home/RecallPage";
import { CreatePage, DesignPage, ReviewPage, SettingsPage } from "./pages";
import { Shell } from "./Shell";

export function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="recall" element={<RecallPage />} />
          <Route path="decks" element={<DecksPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="design" element={<DesignPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
