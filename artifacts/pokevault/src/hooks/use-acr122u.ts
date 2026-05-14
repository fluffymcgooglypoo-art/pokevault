import { useState, useEffect, useRef, useCallback } from "react";

// ── Minimal WebUSB type declarations ────────────────────────────────────────
interface USBEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}
interface USBAlternateInterface { endpoints: USBEndpoint[] }
interface USBInterface { alternates: USBAlternateInterface[] }
interface USBConfiguration { interfaces: USBInterface[] }
interface USBInTransferResult { data: DataView | null }
interface USBDevice {
  vendorId: number;
  productId: number;
  productName: string;
  configuration: USBConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
}
interface USBDeviceFilter { vendorId?: number; productId?: number }
interface USB extends EventTarget {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
}
interface USBConnectionEvent extends Event { device: USBDevice }
// ────────────────────────────────────────────────────────────────────────────

const VENDOR_ID = 0x072f;   // ACS (Advanced Card Systems)
const PRODUCT_ID = 0x2200;  // ACR122U

export type ReaderStatus =
  | "unavailable"   // WebUSB not supported in this browser
  | "not_connected" // WebUSB available but no authorized ACR122U found
  | "connecting"    // Opening USB device
  | "ready"         // Device open, ready to scan/write
  | "error";        // Open failed or lost connection

export interface UseAcr122uReturn {
  status: ReaderStatus;
  deviceName: string | null;
  errorMessage: string | null;
  isInIframe: boolean;
  connect: () => Promise<void>;
  readUid: (signal: AbortSignal) => Promise<string>;
  writeNdef: (url: string) => Promise<void>;
}

// ── CCID helpers ────────────────────────────────────────────────────────────

function buildXfrBlock(apdu: number[], seq: number): Uint8Array {
  const buf = new Uint8Array(10 + apdu.length);
  buf[0] = 0x6f;                        // PC_to_RDR_XfrBlock
  buf[1] = apdu.length & 0xff;          // dwLength LE
  buf[2] = (apdu.length >> 8) & 0xff;
  buf[3] = (apdu.length >> 16) & 0xff;
  buf[4] = (apdu.length >> 24) & 0xff;
  buf[5] = 0x00;                        // bSlot 0
  buf[6] = seq & 0xff;                  // bSeq
  buf[7] = 0x00;                        // bBWI
  buf[8] = 0x00;                        // wLevelParameter lo
  buf[9] = 0x00;                        // wLevelParameter hi
  for (let i = 0; i < apdu.length; i++) buf[10 + i] = apdu[i];
  return buf;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAcr122u(): UseAcr122uReturn {
  const [status, setStatus] = useState<ReaderStatus>("unavailable");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deviceRef = useRef<USBDevice | null>(null);
  const outEpRef = useRef<number>(2);
  const inEpRef = useRef<number>(2);
  const seqRef = useRef<number>(0);

  const openDevice = useCallback(async (device: USBDevice) => {
    setStatus("connecting");
    setErrorMessage(null);
    try {
      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      try {
        await device.claimInterface(0);
      } catch (e) {
        throw new Error(
          "Could not claim USB interface. On Windows, try running Chrome as Administrator or disabling the PC/SC Smart Card service. " +
          (e instanceof Error ? e.message : String(e))
        );
      }

      const iface = device.configuration?.interfaces[0];
      if (!iface) throw new Error("No USB interface found on device.");
      const alt = iface.alternates[0];
      let outEp = 2, inEp = 2;
      for (const ep of alt.endpoints) {
        if (ep.type === "bulk" && ep.direction === "out") outEp = ep.endpointNumber;
        if (ep.type === "bulk" && ep.direction === "in")  inEp  = ep.endpointNumber;
      }
      outEpRef.current = outEp;
      inEpRef.current  = inEp;
      deviceRef.current = device;
      setDeviceName(device.productName || "ACR122U");
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to open reader");
      try { await device.close(); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const usb = (navigator as unknown as { usb?: USB }).usb;
    if (!usb) {
      setStatus("unavailable");
      return;
    }
    setStatus("not_connected");

    usb.getDevices().then((devices) => {
      const acr = devices.find(
        (d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID
      );
      if (acr) openDevice(acr);
    });

    const onConnect = (e: Event) => {
      const dev = (e as USBConnectionEvent).device;
      if (dev.vendorId === VENDOR_ID && dev.productId === PRODUCT_ID) {
        openDevice(dev);
      }
    };
    const onDisconnect = (e: Event) => {
      const dev = (e as USBConnectionEvent).device;
      if (dev === deviceRef.current) {
        deviceRef.current = null;
        setStatus("not_connected");
        setDeviceName(null);
      }
    };

    usb.addEventListener("connect", onConnect);
    usb.addEventListener("disconnect", onDisconnect);
    return () => {
      usb.removeEventListener("connect", onConnect);
      usb.removeEventListener("disconnect", onDisconnect);
    };
  }, [openDevice]);

  // ── sendApdu ──────────────────────────────────────────────────────────────
  const sendApdu = useCallback(async (apdu: number[]): Promise<Uint8Array> => {
    const device = deviceRef.current;
    if (!device) throw new Error("Reader not connected");

    const cmd = buildXfrBlock(apdu, seqRef.current++);
    await device.transferOut(outEpRef.current, cmd.buffer as ArrayBuffer);

    // Accumulate packets until we have the full CCID response
    let buf = new Uint8Array(0);
    for (;;) {
      const result = await device.transferIn(inEpRef.current, 64);
      if (!result.data) continue;
      const chunk = new Uint8Array(result.data.buffer as ArrayBuffer);
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf);
      merged.set(chunk, buf.length);
      buf = merged;
      if (buf.length >= 10) {
        const plen = buf[1] | (buf[2] << 8) | (buf[3] << 16) | (buf[4] << 24);
        if (buf.length >= 10 + plen) break;
      }
    }

    if (buf[0] !== 0x80) {
      throw new Error(`Unexpected CCID response type: 0x${buf[0].toString(16)}`);
    }

    const cmdStatus = (buf[7] >> 6) & 0x03;
    if (cmdStatus === 1) {
      // Card absent or command failed — not a hard error, just retry
      const err = new Error("no_card") as Error & { code: string };
      err.code = "no_card";
      throw err;
    }
    if (cmdStatus === 2) {
      throw new Error("CCID requested time extension — reader busy");
    }

    const plen = buf[1] | (buf[2] << 8) | (buf[3] << 16) | (buf[4] << 24);
    return buf.slice(10, 10 + plen);
  }, []);

  // ── readUid — polls until tag present or aborted ─────────────────────────
  const readUid = useCallback(
    async (signal: AbortSignal): Promise<string> => {
      while (!signal.aborted) {
        try {
          const resp = await sendApdu([0xff, 0xca, 0x00, 0x00, 0x00]);
          if (
            resp.length >= 2 &&
            resp[resp.length - 2] === 0x90 &&
            resp[resp.length - 1] === 0x00
          ) {
            const uidBytes = resp.slice(0, resp.length - 2);
            return Array.from(uidBytes)
              .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
              .join(":");
          }
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code !== "no_card" && !signal.aborted) throw err;
        }
        if (signal.aborted) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      throw new DOMException("Scan aborted", "AbortError");
    },
    [sendApdu]
  );

  // ── writeNdef — writes NDEF URL record to NTAG213 ────────────────────────
  const writeNdef = useCallback(
    async (url: string): Promise<void> => {
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

      const uriBytes = Array.from(new TextEncoder().encode(uriStr));
      const payload = [uriCode, ...uriBytes];

      // NDEF short record: MB=1, ME=1, SR=1, TNF=Well-Known(1)
      const ndefRecord = [
        0xd1,           // header
        0x01,           // type length = 1
        payload.length, // payload length (short record, 1 byte)
        0x55,           // type = 'U' (URI)
        ...payload,
      ];

      // NDEF TLV wrapper: 03 [len] [record] FE [padding]
      const ndefMsg: number[] = [0x03, ndefRecord.length, ...ndefRecord, 0xfe];
      while (ndefMsg.length % 4 !== 0) ndefMsg.push(0x00);

      // Write 4-byte pages starting at page 4 (NTAG213 user memory start)
      for (let i = 0; i < ndefMsg.length; i += 4) {
        const page = 4 + i / 4;
        if (page > 39) throw new Error("NDEF message too large for NTAG213 (max page 39)");
        const pageData = ndefMsg.slice(i, i + 4);
        const resp = await sendApdu([0xff, 0xd6, 0x00, page, 0x04, ...pageData]);
        const sw1 = resp[resp.length - 2];
        const sw2 = resp[resp.length - 1];
        if (sw1 !== 0x90 || sw2 !== 0x00) {
          throw new Error(
            `Write failed at page ${page}: SW=${sw1?.toString(16).toUpperCase()} ${sw2?.toString(16).toUpperCase()}`
          );
        }
      }
    },
    [sendApdu]
  );

  const connect = useCallback(async () => {
    const usb = (navigator as unknown as { usb?: USB }).usb;
    if (!usb) return;
    try {
      const device = await usb.requestDevice({
        filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }],
      });
      await openDevice(device);
    } catch (err) {
      if ((err as Error)?.name === "NotFoundError") return; // user cancelled dialog
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Connection failed");
    }
  }, [openDevice]);

  const isInIframe =
    typeof window !== "undefined" && window.self !== window.top;

  return { status, deviceName, errorMessage, isInIframe, connect, readUid, writeNdef };
}
