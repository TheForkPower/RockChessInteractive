import { Route, Routes } from "react-router";
import { CreatePage } from "../features/create/CreatePage";
import { DecksPage } from "../features/decks/DecksPage";
import { DesignPage } from "../features/design/DesignPage";
import { HomePage } from "../features/home/HomePage";
import { NotFoundPage } from "../features/home/NotFoundPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { Shell } from "./Shell";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="decks" element={<DecksPage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="design" element={<DesignPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
