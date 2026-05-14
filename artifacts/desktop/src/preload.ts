import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

const handlerMap = new WeakMap<
  (data: unknown) => void,
  (_e: IpcRendererEvent, d: unknown) => void
>();

function on(channel: string, cb: (data: unknown) => void): void {
  const handler = (_e: IpcRendererEvent, d: unknown) => cb(d);
  handlerMap.set(cb, handler);
  ipcRenderer.on(channel, handler);
}

function off(channel: string, cb: (data: unknown) => void): void {
  const handler = handlerMap.get(cb);
  if (handler) {
    ipcRenderer.removeListener(channel, handler);
    handlerMap.delete(cb);
  }
}

const apiPort = process.env["ELECTRON_API_PORT"] ?? "8082";

contextBridge.exposeInMainWorld("electronApi", {
  isElectron: true,
  apiBaseUrl: `http://localhost:${apiPort}`,

  setup: {
    saveDatabase: (url: string): Promise<void> =>
      ipcRenderer.invoke("setup:save-database", url),
  },

  nfc: {
    onReaderConnected:    (cb: (d: unknown) => void) => on("nfc:reader-connected", cb),
    offReaderConnected:   (cb: (d: unknown) => void) => off("nfc:reader-connected", cb),
    onReaderDisconnected: (cb: (d: unknown) => void) => on("nfc:reader-disconnected", cb),
    offReaderDisconnected:(cb: (d: unknown) => void) => off("nfc:reader-disconnected", cb),
    onCard:  (cb: (d: unknown) => void) => on("nfc:card", cb),
    offCard: (cb: (d: unknown) => void) => off("nfc:card", cb),
    onError: (cb: (d: unknown) => void) => on("nfc:error", cb),
    offError:(cb: (d: unknown) => void) => off("nfc:error", cb),

    writeNdef: (url: string): Promise<void> =>
      ipcRenderer.invoke("nfc:write-ndef", url),
    getStatus: (): Promise<{ connected: boolean; readerName?: string }> =>
      ipcRenderer.invoke("nfc:get-status"),
  },
});
