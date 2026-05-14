import type { IpcMain, BrowserWindow, IpcMainInvokeEvent } from "electron";

// nfc-pcsc ships its own types; silence the missing-declaration warning if
// the package types aren't available on this machine.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NFC = require("nfc-pcsc");

interface NfcCard {
  uid: string;
  type: number;
  standard: string;
}

interface NfcReader {
  name: string;
  on(event: "card", cb: (card: NfcCard) => void): void;
  on(event: "card.off", cb: (card: NfcCard) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "end", cb: () => void): void;
  write(block: number, data: Buffer, blockSize?: number): Promise<void>;
}

interface NfcStatus {
  connected: boolean;
  readerName?: string;
}

export function setupNfc(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  const nfc = new NFC();

  let currentReader: NfcReader | null = null;
  let nfcStatus: NfcStatus = { connected: false };

  function send(channel: string, data: unknown): void {
    const w = getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, data);
    }
  }

  nfc.on("reader", (reader: NfcReader) => {
    currentReader = reader;
    nfcStatus = { connected: true, readerName: reader.name };
    send("nfc:reader-connected", { name: reader.name });

    reader.on("card", (card: NfcCard) => {
      send("nfc:card", { uid: formatUid(card.uid) });
    });

    reader.on("error", (err: Error) => {
      send("nfc:error", { message: err.message });
    });

    reader.on("end", () => {
      if (currentReader === reader) currentReader = null;
      nfcStatus = { connected: false };
      send("nfc:reader-disconnected", {});
    });
  });

  nfc.on("error", (err: Error) => {
    console.error("[nfc-pcsc]", err.message);
    send("nfc:error", { message: err.message });
  });

  // ── IPC handlers ────────────────────────────────────────────────────────────

  ipcMain.handle("nfc:get-status", (): NfcStatus => nfcStatus);

  ipcMain.handle(
    "nfc:write-ndef",
    async (_e: IpcMainInvokeEvent, url: string): Promise<void> => {
      if (!currentReader) throw new Error("No NFC reader connected");
      const bytes = buildNdefBytes(url);
      for (let i = 0; i < bytes.length; i += 4) {
        const page = 4 + i / 4;
        if (page > 39) throw new Error("NDEF message too large for NTAG213 (max 39 pages)");
        await currentReader.write(page, Buffer.from(bytes.slice(i, i + 4)), 4);
      }
    }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUid(raw: string): string {
  // nfc-pcsc typically returns a plain hex string like "04a3f21b8c4081"
  // Normalise to uppercase colon-separated: "04:A3:F2:1B:8C:40:81"
  const hex = raw.replace(/[^0-9a-fA-F]/g, "");
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return pairs.map((b) => b.toUpperCase()).join(":");
}

function buildNdefBytes(url: string): number[] {
  // URI identifier codes per RFC 5234 / NFC Forum URI Record Type Definition
  const prefixes: [string, number][] = [
    ["https://www.", 0x02],
    ["http://www.",  0x01],
    ["https://",     0x04],
    ["http://",      0x03],
  ];
  let uriCode = 0x00;
  let uriStr = url;
  for (const [prefix, code] of prefixes) {
    if (url.startsWith(prefix)) {
      uriCode = code;
      uriStr = url.slice(prefix.length);
      break;
    }
  }

  const uriBytes = [...Buffer.from(uriStr, "utf8")];
  const payload = [uriCode, ...uriBytes];

  // NDEF short record: MB=1 ME=1 SR=1 TNF=Well-Known(0x01)
  const ndefRecord = [
    0xd1,
    0x01,
    payload.length,
    0x55, // type = 'U'
    ...payload,
  ];

  // Wrap in NDEF Message TLV and pad to 4-byte page boundary
  const msg: number[] = [0x03, ndefRecord.length, ...ndefRecord, 0xfe];
  while (msg.length % 4 !== 0) msg.push(0x00);
  return msg;
}
