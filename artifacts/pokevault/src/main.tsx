import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// When running inside the Electron desktop app the preload script exposes
// window.electronApi.  Call setBaseUrl so every /api/... fetch goes to the
// Express server rather than the Vite dev-server origin.
const electronApi = (
  window as { electronApi?: { isElectron?: boolean; apiBaseUrl?: string } }
).electronApi;
if (electronApi?.isElectron && electronApi.apiBaseUrl) {
  setBaseUrl(electronApi.apiBaseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
