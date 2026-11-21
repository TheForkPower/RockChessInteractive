import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// IndexedDB work in tests can take a moment on a busy machine, so waiting helpers are patient.
configure({ asyncUtilTimeout: 6000 });

afterEach(() => cleanup());
