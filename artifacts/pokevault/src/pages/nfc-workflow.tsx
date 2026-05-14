import { useState, useRef } from "react";
import {
  useCheckNfcUrl,
  useCreateNfcTag,
  useUpdateNfcTag,
  useCreateCard,
  getListCardsQueryKey,
  getListNfcTagsQueryKey,
  type CardInputCondition,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertCircle,
  Wifi,
  Loader2,
  RefreshCw,
  ExternalLink,
  Radio,
  Usb,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAcr122u } from "@/hooks/use-acr122u";

type Step = 1 | 2 | 3 | 4 | 5;

type ByteCheck = {
  byte_length: number;
  max_bytes: number;
  fits: boolean;
  message?: string | null;
};

const CONDITIONS = [
  { value: "mint", label: "Mint" },
  { value: "near_mint", label: "Near Mint" },
  { value: "lightly_played", label: "Lightly Played" },
  { value: "moderately_played", label: "Moderately Played" },
  { value: "heavily_played", label: "Heavily Played" },
  { value: "damaged", label: "Damaged" },
];

function detectUrlType(url: string): "tcgplayer" | "ebay" | null {
  if (url.includes("tcgplayer.com")) return "tcgplayer";
  if (url.includes("ebay.com")) return "ebay";
  return null;
}

const STEPS = [
  { n: 1, label: "Scan Tag" },
  { n: 2, label: "Source URL" },
  { n: 3, label: "Card Info" },
  { n: 4, label: "Write" },
  { n: 5, label: "Done" },
];

export default function NfcWorkflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);

  // Step 1 — Scan
  const [uid, setUid] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const scanAbortRef = useRef<AbortController | null>(null);

  // Step 2 — URL
  const [urlInput, setUrlInput] = useState("");
  const [byteCheck, setByteCheck] = useState<ByteCheck | null>(null);
  const [urlChecking, setUrlChecking] = useState(false);
  const urlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3 — Card info
  const [cardName, setCardName] = useState("");
  const [setNameVal, setSetNameVal] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [condition, setCondition] = useState<CardInputCondition>("near_mint");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [marketValue, setMarketValue] = useState("");

  // Step 4 — Write
  const [createdCardId, setCreatedCardId] = useState<number | null>(null);
  const [createdTagId, setCreatedTagId] = useState<number | null>(null);
  const [shortLink, setShortLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");

  const acr = useAcr122u();
  const readerReady = acr.status === "ready";

  const checkUrlMutation = useCheckNfcUrl();
  const createNfcTag = useCreateNfcTag();
  const updateNfcTag = useUpdateNfcTag();
  const createCard = useCreateCard();

  // ── NFC Scan via ACR122U ──────────────────────────────────────
  async function handleStartScan() {
    if (!readerReady) return;
    setScanError("");
    setScanning(true);
    const ctrl = new AbortController();
    scanAbortRef.current = ctrl;
    try {
      const scannedUid = await acr.readUid(ctrl.signal);
      setUid(scannedUid);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function handleStopScan() {
    scanAbortRef.current?.abort();
    setScanning(false);
  }

  // ── URL debounce check ────────────────────────────────────────
  function handleUrlChange(value: string) {
    setUrlInput(value);
    setByteCheck(null);
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    if (!value.trim()) { setUrlChecking(false); return; }
    setUrlChecking(true);
    urlTimerRef.current = setTimeout(async () => {
      try {
        const result = await checkUrlMutation.mutateAsync({ data: { url: value.trim() } });
        setByteCheck(result);
      } catch {
        // ignore
      } finally {
        setUrlChecking(false);
      }
    }, 450);
  }

  // ── Save inventory record + NFC tag ──────────────────────────
  async function handleSave() {
    const pprice = parseFloat(purchasePrice);
    const mvalue = marketValue.trim() ? parseFloat(marketValue) : undefined;
    const urlType = detectUrlType(urlInput);

    setSaving(true);
    try {
      const card = await createCard.mutateAsync({
        data: {
          name: cardName.trim(),
          set_name: setNameVal.trim() || undefined,
          card_number: cardNumber.trim() || undefined,
          condition,
          purchase_price: pprice,
          market_value: mvalue,
          tcgplayer_url: urlType === "tcgplayer" && urlInput ? urlInput.trim() : undefined,
          ebay_url: urlType === "ebay" && urlInput ? urlInput.trim() : undefined,
        },
      });

      const origin = window.location.origin;
      const overlay = `${origin}/overlay/${card.short_code ?? card.id}`;
      setShortLink(overlay);

      const tag = await createNfcTag.mutateAsync({
        data: {
          card_id: card.id,
          tag_uid: uid.trim() || undefined,
          payload_url: overlay,
        },
      });

      setCreatedCardId(card.id);
      setCreatedTagId(tag.id);
      queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
    } catch (err: unknown) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Write short link to physical tag via ACR122U ─────────────
  async function handleWriteTag() {
    if (!createdTagId) return;
    setWriting(true);
    setWriteError("");
    try {
      await acr.writeNdef(shortLink);
      await updateNfcTag.mutateAsync({ tagId: createdTagId, data: { written: true } });
      queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
      setStep(5);
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setWriteError(err instanceof Error ? err.message : "NFC write failed");
      }
    } finally {
      setWriting(false);
    }
  }

  async function handleMarkWritten() {
    if (!createdTagId) return;
    await updateNfcTag.mutateAsync({ tagId: createdTagId, data: { written: true } });
    queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
    setStep(5);
  }

  function reset() {
    scanAbortRef.current?.abort();
    setStep(1);
    setUid(""); setScanning(false); setScanError("");
    setUrlInput(""); setByteCheck(null); setUrlChecking(false);
    setCardName(""); setSetNameVal(""); setCardNumber("");
    setCondition("near_mint"); setPurchasePrice(""); setMarketValue("");
    setCreatedCardId(null); setCreatedTagId(null); setShortLink("");
    setSaving(false); setWriting(false); setWriteError("");
  }

  const urlType = detectUrlType(urlInput);
  const byteUsagePct = byteCheck
    ? Math.min(100, (byteCheck.byte_length / byteCheck.max_bytes) * 100)
    : 0;
  const step3Valid =
    cardName.trim().length > 0 &&
    purchasePrice.trim().length > 0 &&
    !isNaN(parseFloat(purchasePrice));

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 py-4 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">NFC Tag Workflow</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Scan an NTAG213 sticker → link a source URL → enter card details → write tag &amp; add to inventory
        </p>
      </div>

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-6">

        {/* ── Step indicator ── */}
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <div key={s.n} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-7 h-7 flex items-center justify-center border text-xs font-bold
                    ${done ? "bg-primary border-primary text-primary-foreground"
                      : active ? "border-primary text-primary"
                      : "border-border text-muted-foreground"}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                  </div>
                  <span className={`text-[10px] font-medium
                    ${active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 mb-5 ${done ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════
            STEP 1 — Scan NFC Tag
        ══════════════════════════════════════════ */}
        {step === 1 && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">Scan NFC Tag</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-xs text-muted-foreground">Scan your NFC chip</p>

              {/* Reader status banner */}
              {acr.status === "ready" ? (
                <div className="flex items-center gap-3 px-4 py-3 border border-green-500/30 bg-green-500/5">
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                  <span className="text-sm font-medium text-green-400">Connected</span>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <span className="text-sm text-foreground">{acr.deviceName}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> Ready
                  </span>
                </div>
              ) : acr.status === "connecting" ? (
                <div className="flex items-center gap-2 px-4 py-3 border border-border">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Connecting to reader…</span>
                </div>
              ) : acr.status === "error" ? (
                <div className="flex items-start gap-2 p-3 border border-red-500/30 bg-red-500/5">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Reader error</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{acr.errorMessage}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 p-3 border border-red-500/30 bg-red-500/5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-400">NFC reader not detected</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {acr.status === "unavailable"
                          ? "WebUSB is not supported in this browser. Use Chrome or Edge."
                          : acr.isInIframe
                          ? "USB access is blocked inside the Replit preview. Open the app in its own browser tab."
                          : "Make sure the ACR122U is plugged in, then click Connect Reader. First-time use requires granting permission."}
                      </p>
                    </div>
                  </div>
                  {acr.status === "not_connected" && acr.isInIframe ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(window.location.href, "_blank")}
                      className="shrink-0 border-border text-muted-foreground hover:text-foreground whitespace-nowrap"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open in New Tab
                    </Button>
                  ) : acr.status === "not_connected" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={acr.connect}
                      className="shrink-0 border-border text-muted-foreground hover:text-foreground"
                    >
                      <Usb className="h-3.5 w-3.5 mr-1.5" />
                      Connect Reader
                    </Button>
                  ) : null}
                </div>
              )}

              {/* Scan zone — only shown when reader is ready */}
              {readerReady && (
                <div
                  data-testid="scan-zone"
                  className={`flex flex-col items-center justify-center py-12 border-2 border-dashed cursor-pointer select-none transition-colors
                    ${scanning ? "border-primary bg-primary/5" : uid ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40"}`}
                  onClick={uid ? undefined : scanning ? handleStopScan : handleStartScan}
                >
                  {scanning ? (
                    <>
                      <div className="relative flex items-center justify-center w-16 h-16">
                        <Radio className="h-10 w-10 text-primary" />
                        <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
                      </div>
                      <p className="text-sm font-medium text-primary mt-5">Scanning — hold tag to reader</p>
                      <p className="text-xs text-muted-foreground mt-1.5">Click to cancel</p>
                    </>
                  ) : uid ? (
                    <>
                      <CheckCircle2 className="h-10 w-10 text-primary" />
                      <p className="text-sm font-medium text-foreground mt-3">Tag detected</p>
                      <p className="font-mono text-primary text-sm mt-1 tracking-wider">{uid}</p>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground mt-4 underline"
                        onClick={(e) => { e.stopPropagation(); setUid(""); setScanError(""); }}
                      >
                        Scan a different tag
                      </button>
                    </>
                  ) : (
                    <>
                      <Radio className="h-12 w-12 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground mt-4">Click to start scanning</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">Hold NFC chip over ACR122U</p>
                    </>
                  )}
                </div>
              )}

              {scanError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {scanError}
                </p>
              )}

              {/* Manual UID entry */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {readerReady ? "Or enter UID manually" : "NFC Tag UID"}
                </label>
                <Input
                  data-testid="input-uid"
                  placeholder="04:A3:F2:1B:8C:40:81"
                  value={uid}
                  onChange={(e) => setUid(e.target.value.toUpperCase())}
                  className="font-mono bg-background border-border tracking-wider"
                />
                <p className="text-[10px] text-muted-foreground/50">
                  Spaces, colons and dashes are normalized automatically
                </p>
              </div>

              <Button
                data-testid="button-step1-next"
                className="w-full"
                onClick={() => setStep(2)}
                disabled={!uid.trim()}
              >
                Continue with UID
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════
            STEP 2 — Source URL
        ══════════════════════════════════════════ */}
        {step === 2 && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">Source URL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-xs text-muted-foreground">
                Open TCGplayer or eBay, find your card's listing, then paste the URL here.
                The app stores this for price lookups — the short overlay link is what gets written to the tag.
              </p>

              {/* Quick-open links */}
              <div className="flex gap-3">
                <a
                  href="https://www.tcgplayer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2.5 border border-border text-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open TCGplayer.com
                </a>
                <a
                  href="https://www.ebay.com/sch/i.html?_nkw=pokemon+card&_sacat=2536"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2.5 border border-border text-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open eBay.com
                </a>
              </div>

              {/* URL input + live byte check */}
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    data-testid="input-url"
                    placeholder="Paste TCGplayer or eBay product URL…"
                    value={urlInput}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="bg-background border-border pr-28"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {urlChecking && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    {urlType === "tcgplayer" && !urlChecking && (
                      <span className="text-[10px] font-mono text-primary border border-primary/30 px-1.5 py-0.5">TCGplayer</span>
                    )}
                    {urlType === "ebay" && !urlChecking && (
                      <span className="text-[10px] font-mono text-yellow-400 border border-yellow-400/30 px-1.5 py-0.5">eBay</span>
                    )}
                  </div>
                </div>

                {byteCheck && urlInput && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">URL byte size</span>
                      <span className={`font-mono font-medium
                        ${byteCheck.fits
                          ? byteCheck.byte_length > 100 ? "text-yellow-400" : "text-green-400"
                          : "text-red-400"}`}>
                        {byteCheck.byte_length} / {byteCheck.max_bytes} bytes
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted overflow-hidden">
                      <div
                        data-testid="byte-meter"
                        className={`h-full transition-all duration-300
                          ${byteCheck.fits
                            ? byteCheck.byte_length > 100 ? "bg-yellow-400" : "bg-green-400"
                            : "bg-red-500"}`}
                        style={{ width: `${byteUsagePct}%` }}
                      />
                    </div>
                    {!byteCheck.fits && (
                      <div className="flex items-start gap-2 p-3 border border-yellow-500/30 bg-yellow-500/5">
                        <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-yellow-300">
                          URL is {byteCheck.byte_length - byteCheck.max_bytes} bytes too large for NTAG213.
                          That's fine — the short overlay link will be written to the tag instead.
                          This URL is stored only for price lookups.
                        </p>
                      </div>
                    )}
                    {byteCheck.fits && (
                      <p className="text-xs text-green-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {byteCheck.byte_length > 100
                          ? "URL fits but is large — short link will be written instead"
                          : "URL fits within NTAG213 limits"}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="text-muted-foreground">
                  Back
                </Button>
                <Button data-testid="button-step2-next" className="flex-1" onClick={() => setStep(3)}>
                  Continue
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground/50 text-center">
                URL is optional — you can add or update it later from the card detail page.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════
            STEP 3 — Card Details
        ══════════════════════════════════════════ */}
        {step === 3 && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">Card Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Fill in the card information. Market value will be auto-populated from the source URL once the price scraper is connected.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Card name — full width */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Card Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    data-testid="input-card-name"
                    placeholder="e.g. Charizard VMAX"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    className="bg-background border-border"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Set Name</label>
                  <Input
                    placeholder="e.g. Brilliant Stars"
                    value={setNameVal}
                    onChange={(e) => setSetNameVal(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Card Number</label>
                  <Input
                    placeholder="e.g. 018/172"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Condition <span className="text-red-400">*</span>
                  </label>
                  <Select value={condition} onValueChange={(v) => setCondition(v as CardInputCondition)}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Amount Paid <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      data-testid="input-purchase-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className="pl-7 bg-background border-border"
                    />
                  </div>
                </div>

                {/* Market value — full width */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Market Value
                    <span className="ml-1.5 text-muted-foreground/50 font-normal text-[10px]">
                      optional — will be auto-filled by scraper
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      data-testid="input-market-value"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={marketValue}
                      onChange={(e) => setMarketValue(e.target.value)}
                      className="pl-7 bg-background border-border"
                    />
                  </div>
                </div>
              </div>

              {/* P&L preview */}
              {purchasePrice && marketValue && !isNaN(parseFloat(purchasePrice)) && !isNaN(parseFloat(marketValue)) && (
                <div className="flex items-center gap-3 px-3 py-2 bg-background border border-border text-xs">
                  <span className="text-muted-foreground">Unrealized P&L</span>
                  {(() => {
                    const pl = parseFloat(marketValue) - parseFloat(purchasePrice);
                    const pct = parseFloat(purchasePrice) > 0
                      ? ((pl / parseFloat(purchasePrice)) * 100).toFixed(1)
                      : "0";
                    return (
                      <span className={`font-mono font-bold ${pl > 0 ? "text-green-400" : pl < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {pl >= 0 ? "+" : ""}${pl.toFixed(2)} ({pct}%)
                      </span>
                    );
                  })()}
                  <span className="text-muted-foreground ml-auto">
                    % paid: <span className="font-mono text-primary">
                      {parseFloat(marketValue) > 0
                        ? `${((parseFloat(purchasePrice) / parseFloat(marketValue)) * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="text-muted-foreground">
                  Back
                </Button>
                <Button
                  data-testid="button-step3-next"
                  className="flex-1"
                  onClick={() => setStep(4)}
                  disabled={!step3Valid}
                >
                  Review &amp; Write
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════
            STEP 4 — Write & Save
        ══════════════════════════════════════════ */}
        {step === 4 && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">Write Tag &amp; Save to Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Summary table */}
              <div className="divide-y divide-border border border-border">
                {[
                  ["Card", cardName],
                  ...(setNameVal ? [["Set", setNameVal + (cardNumber ? ` · ${cardNumber}` : "")]] : []),
                  ["Condition", CONDITIONS.find((c) => c.value === condition)?.label ?? condition],
                  ["NFC UID", uid],
                  ["Amount Paid", `$${parseFloat(purchasePrice).toFixed(2)}`],
                  ...(marketValue ? [["Market Value", `$${parseFloat(marketValue).toFixed(2)}`]] : []),
                  ...(urlInput ? [["Source URL", urlType === "tcgplayer" ? "TCGplayer link" : urlType === "ebay" ? "eBay link" : "Custom URL"]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className={`text-sm font-medium ${label === "NFC UID" ? "font-mono text-xs text-primary tracking-wider" : "text-foreground"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {!readerReady && !createdCardId && (
                <div className="flex items-start gap-2 p-3 border border-yellow-500/30 bg-yellow-500/5">
                  <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-300">
                    NFC reader not connected — the inventory record will be created and you can mark the tag as written manually.
                  </p>
                </div>
              )}

              {/* Phase A: not yet saved */}
              {!createdCardId && (
                <>
                  <Button
                    data-testid="button-save-and-write"
                    className="w-full"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving to inventory…</>
                    ) : (
                      <><Wifi className="h-4 w-4 mr-2" /> Save to Inventory &amp; Write Tag</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => setStep(3)}
                    disabled={saving}
                  >
                    Back
                  </Button>
                </>
              )}

              {/* Phase B: saved — show short link + write actions */}
              {createdCardId && (
                <>
                  <div className="p-3 bg-background border border-primary/20">
                    <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Short link to write to tag</p>
                    <p className="font-mono text-xs text-primary break-all" data-testid="text-short-link">{shortLink}</p>
                  </div>

                  {writeError && (
                    <div className="flex items-start gap-2 p-3 border border-red-500/30 bg-red-500/5">
                      <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                      <div className="text-xs">
                        <p className="text-red-400 font-medium">Write failed: {writeError}</p>
                        <p className="text-muted-foreground mt-0.5">Try again below or mark written manually.</p>
                      </div>
                    </div>
                  )}

                  {readerReady && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground text-center">
                        Hold the NFC chip over the ACR122U, then click Write.
                      </p>
                      <Button
                        data-testid="button-write-tag"
                        className="w-full"
                        onClick={handleWriteTag}
                        disabled={writing || updateNfcTag.isPending}
                      >
                        {writing ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Writing to tag…</>
                        ) : (
                          <><Wifi className="h-4 w-4 mr-2" /> {writeError ? "Retry Write" : "Write to NFC Tag"}</>
                        )}
                      </Button>
                    </div>
                  )}

                  <Button
                    data-testid="button-mark-written"
                    variant="outline"
                    className="w-full border-border text-muted-foreground hover:text-foreground"
                    onClick={handleMarkWritten}
                    disabled={updateNfcTag.isPending || writing}
                  >
                    {updateNfcTag.isPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Marking…</>
                      : <><CheckCircle2 className="h-4 w-4 mr-2" /> Mark Written Manually</>}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════
            STEP 5 — Done
        ══════════════════════════════════════════ */}
        {step === 5 && (
          <Card className="bg-card border-border rounded-none">
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <CheckCircle2 className="h-14 w-14 text-primary" data-testid="icon-success" />
              <div className="text-center space-y-1.5">
                <p className="text-lg font-semibold text-foreground">{cardName}</p>
                {setNameVal && (
                  <p className="text-xs text-muted-foreground">
                    {setNameVal}{cardNumber ? ` · ${cardNumber}` : ""}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">Added to inventory — NFC tag written</p>
                <p className="font-mono text-xs text-primary mt-2">{uid}</p>
                {shortLink && (
                  <p className="font-mono text-[10px] text-muted-foreground/50 break-all mt-1">{shortLink}</p>
                )}
              </div>
              <Button
                data-testid="button-program-another"
                variant="outline"
                onClick={reset}
                className="mt-2"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Tag Another Card
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
