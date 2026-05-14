import { useState } from "react";
import {
  useListCards,
  getListCardsQueryKey,
  useCheckNfcUrl,
  useCreateNfcTag,
  useUpdateNfcTag,
  useUpdateCard,
  getListNfcTagsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, Wifi, Loader2, Search, ArrowRight, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NTAG213_MAX = 137;

type Step = 1 | 2 | 3 | 4 | 5;

type SelectedCard = {
  id: number;
  name: string;
  short_code: string | null;
  nfc_written: boolean;
  nfc_tag_id: number | null;
  purchase_price: number;
  market_value: number | null;
  percent_paid: number | null;
};

export default function NfcWorkflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [cardSearch, setCardSearch] = useState("");
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [percentPaidInput, setPercentPaidInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [checkResult, setCheckResult] = useState<{
    byte_length: number;
    max_bytes: number;
    fits: boolean;
    short_url_recommended: boolean;
    message?: string | null;
  } | null>(null);
  const [generatedShortLink, setGeneratedShortLink] = useState("");
  const [createdTagId, setCreatedTagId] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);

  const { data: cards } = useListCards(
    cardSearch ? { search: cardSearch } : {},
    { query: { queryKey: getListCardsQueryKey(cardSearch ? { search: cardSearch } : {}) } }
  );

  const checkUrl = useCheckNfcUrl();
  const createTag = useCreateNfcTag();
  const updateTag = useUpdateNfcTag();
  const updateCard = useUpdateCard();

  const nfcAvailable = typeof window !== "undefined" && "NDEFReader" in window;

  function reset() {
    setStep(1);
    setSelectedCard(null);
    setCardSearch("");
    setPercentPaidInput("");
    setUrlInput("");
    setCheckResult(null);
    setGeneratedShortLink("");
    setCreatedTagId(null);
    setWriting(false);
  }

  function handleSelectCard(card: SelectedCard) {
    setSelectedCard(card);
    // Pre-fill percent paid if already set on the card
    if (card.percent_paid != null) {
      setPercentPaidInput(String(card.percent_paid));
    } else if (card.market_value != null && card.market_value > 0) {
      const derived = (card.purchase_price / card.market_value) * 100;
      setPercentPaidInput(derived.toFixed(1));
    } else {
      setPercentPaidInput("");
    }
    setStep(2);
  }

  async function handleConfirmDetails() {
    if (!selectedCard) return;
    // Save percent paid if provided
    const pct = parseFloat(percentPaidInput);
    if (!isNaN(pct) && pct > 0) {
      updateCard.mutate({ id: selectedCard.id, data: { percent_paid: pct } });
      queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
    }
    setStep(3);
  }

  async function handleCheckUrl() {
    if (!urlInput.trim()) return;
    const result = await checkUrl.mutateAsync({ data: { url: urlInput.trim() } });
    setCheckResult(result);
  }

  async function handleGenerateShortLink() {
    if (!selectedCard) return;
    const origin = window.location.origin;
    const shortLink = `${origin}/overlay/${selectedCard.short_code ?? selectedCard.id}`;

    const tag = await createTag.mutateAsync({
      data: {
        card_id: selectedCard.id,
        payload_url: shortLink,
      },
    });
    setGeneratedShortLink(shortLink);
    setCreatedTagId(tag.id);
    queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
    setStep(4);
  }

  async function handleWriteTag() {
    if (!generatedShortLink || !createdTagId) return;
    setWriting(true);
    try {
      if (!nfcAvailable) throw new Error("Web NFC not available.");
      const ndef = new (window as unknown as { NDEFReader: new () => { write: (msg: unknown) => Promise<void> } }).NDEFReader();
      await ndef.write({ records: [{ recordType: "url", data: generatedShortLink }] });
      await updateTag.mutateAsync({ tagId: createdTagId, data: { written: true } });
      setStep(5);
      queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "NFC write failed", description: msg, variant: "destructive" });
    } finally {
      setWriting(false);
    }
  }

  async function handleMarkWrittenManual() {
    if (!createdTagId) return;
    await updateTag.mutateAsync({ tagId: createdTagId, data: { written: true } });
    setStep(5);
    queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
  }

  const steps = [
    { n: 1, label: "Select Card" },
    { n: 2, label: "% Paid" },
    { n: 3, label: "URL Check" },
    { n: 4, label: "Write Tag" },
    { n: 5, label: "Done" },
  ];

  const filteredCards = (cards ?? []).filter((c) => c.status !== "sold");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 py-4 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">NFC Tag Workflow</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Program NTAG213 stickers for your cards</p>
      </div>

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-0" data-testid="step-indicator">
          {steps.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <div key={s.n} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-7 h-7 flex items-center justify-center border text-xs font-bold ${done ? "bg-primary border-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                  </div>
                  <span className={`text-[10px] font-medium ${active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`h-px flex-1 mb-5 ${done ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1 — Select card */}
        {step === 1 && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">Select a Card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="input-card-search"
                  placeholder="Search your inventory..."
                  value={cardSearch}
                  onChange={(e) => setCardSearch(e.target.value)}
                  className="pl-9 bg-background border-border"
                />
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredCards.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No cards found</p>
                )}
                {filteredCards.map((card) => (
                  <button
                    key={card.id}
                    data-testid={`button-select-card-${card.id}`}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30 border border-transparent hover:border-border transition-colors group"
                    onClick={() => handleSelectCard({
                      id: card.id,
                      name: card.name,
                      short_code: card.short_code ?? null,
                      nfc_written: card.nfc_written,
                      nfc_tag_id: card.nfc_tag_id ?? null,
                      purchase_price: card.purchase_price,
                      market_value: card.market_value ?? null,
                      percent_paid: card.percent_paid ?? null,
                    })}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{card.name}</p>
                      <div className="flex gap-3 mt-0.5">
                        {card.set_name && <span className="text-xs text-muted-foreground">{card.set_name}</span>}
                        <span className="text-xs text-muted-foreground font-mono">${card.purchase_price.toFixed(2)} paid</span>
                        {card.market_value != null && (
                          <span className="text-xs text-muted-foreground font-mono">${card.market_value.toFixed(2)} market</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {card.nfc_written && <Wifi className="h-3.5 w-3.5 text-primary" />}
                      <ArrowRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — % Paid */}
        {step === 2 && selectedCard && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">
                % Paid — <span className="text-primary">{selectedCard.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Enter the percentage of market value you paid for this card. This helps track your buying efficiency across your collection.
              </p>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-background border border-border p-3">
                  <p className="text-xs text-muted-foreground">Purchase Price</p>
                  <p className="font-mono text-sm font-bold text-foreground mt-1">${selectedCard.purchase_price.toFixed(2)}</p>
                </div>
                <div className="bg-background border border-border p-3">
                  <p className="text-xs text-muted-foreground">Market Value</p>
                  <p className="font-mono text-sm font-bold text-foreground mt-1">
                    {selectedCard.market_value != null ? `$${selectedCard.market_value.toFixed(2)}` : "—"}
                  </p>
                </div>
                <div className="bg-background border border-border p-3">
                  <p className="text-xs text-muted-foreground">Calculated %</p>
                  <p className="font-mono text-sm font-bold text-primary mt-1">
                    {selectedCard.market_value != null && selectedCard.market_value > 0
                      ? `${((selectedCard.purchase_price / selectedCard.market_value) * 100).toFixed(1)}%`
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">% Paid of Market Value</label>
                <div className="flex items-center gap-2">
                  <Input
                    data-testid="input-percent-paid"
                    type="number"
                    step="0.1"
                    min="0"
                    max="999"
                    placeholder="e.g. 65"
                    value={percentPaidInput}
                    onChange={(e) => setPercentPaidInput(e.target.value)}
                    className="bg-background border-border max-w-40"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
                {percentPaidInput && !isNaN(parseFloat(percentPaidInput)) && (
                  <p className={`text-xs font-mono ${parseFloat(percentPaidInput) <= 70 ? "text-green-400" : parseFloat(percentPaidInput) <= 90 ? "text-yellow-400" : "text-muted-foreground"}`}>
                    {parseFloat(percentPaidInput) <= 70 ? "Great deal" : parseFloat(percentPaidInput) <= 90 ? "Fair price" : "At/above market"}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="text-muted-foreground">Back</Button>
                <Button
                  data-testid="button-confirm-details"
                  className="flex-1"
                  onClick={handleConfirmDetails}
                  disabled={updateCard.isPending}
                >
                  {updateCard.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <>Continue <ArrowRight className="h-4 w-4 ml-2" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — URL check */}
        {step === 3 && selectedCard && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">
                Check URL for <span className="text-primary">{selectedCard.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Paste the TCGplayer or eBay listing URL. The app checks whether it fits within NTAG213's 137-byte limit.
                If too long, use the generated short link instead.
              </p>
              <div className="flex gap-2">
                <Input
                  data-testid="input-url"
                  placeholder="https://www.tcgplayer.com/product/..."
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setCheckResult(null); }}
                  className="bg-background border-border flex-1"
                />
                <Button
                  data-testid="button-check-url"
                  onClick={handleCheckUrl}
                  disabled={!urlInput.trim() || checkUrl.isPending}
                  variant="outline"
                >
                  {checkUrl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
                </Button>
              </div>

              {checkResult && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Byte usage</span>
                      <span className={`font-mono ${checkResult.fits ? "text-green-400" : "text-red-400"}`}>
                        {checkResult.byte_length} / {checkResult.max_bytes} bytes
                      </span>
                    </div>
                    <div className="h-2 bg-muted overflow-hidden">
                      <div
                        data-testid="byte-meter"
                        className={`h-full transition-all ${checkResult.fits ? checkResult.byte_length > 100 ? "bg-yellow-400" : "bg-green-400" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, (checkResult.byte_length / checkResult.max_bytes) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className={`flex items-start gap-2 p-3 border ${checkResult.fits ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                    {checkResult.fits
                      ? <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                      : <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                    <p className="text-sm" data-testid="text-url-check-result">{checkResult.message}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="text-muted-foreground">Back</Button>
                    <Button data-testid="button-next-step" className="flex-1" onClick={() => {
                      // If URL fits and is short enough, skip short link and go straight to write
                      // but we still generate the internal short link for the overlay
                      handleGenerateShortLink();
                    }} disabled={createTag.isPending}>
                      {createTag.isPending
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                        : <>Generate Short Link &amp; Continue <ArrowRight className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                </div>
              )}

              {!checkResult && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="text-muted-foreground">Back</Button>
                  <Button
                    data-testid="button-skip-url"
                    variant="outline"
                    className="flex-1"
                    onClick={handleGenerateShortLink}
                    disabled={createTag.isPending}
                  >
                    {createTag.isPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                      : <>Skip URL Check — Generate Short Link <ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4 — Write tag */}
        {step === 4 && selectedCard && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">Write to NFC Tag</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!nfcAvailable && (
                <div className="flex items-start gap-2 p-3 border border-yellow-500/30 bg-yellow-500/5">
                  <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-400">Web NFC not available</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Web NFC requires Chrome with NFC hardware. Use "Mark Written" to record manually.
                    </p>
                  </div>
                </div>
              )}
              <div className="p-3 bg-background border border-border">
                <p className="text-xs text-muted-foreground mb-1">Short link to write</p>
                <p className="font-mono text-sm text-primary break-all" data-testid="text-short-link">{generatedShortLink}</p>
              </div>
              <p className="text-xs text-muted-foreground">Hold your NTAG213 sticker near the reader, then click Write.</p>
              <div className="flex gap-2">
                <Button
                  data-testid="button-write-tag"
                  className="flex-1"
                  onClick={handleWriteTag}
                  disabled={writing || !nfcAvailable}
                >
                  {writing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Writing...</> : <><Wifi className="h-4 w-4 mr-2" /> Write NFC Tag</>}
                </Button>
                {createdTagId && (
                  <Button
                    data-testid="button-mark-written-manual"
                    variant="outline"
                    onClick={handleMarkWrittenManual}
                    disabled={updateTag.isPending}
                  >
                    Mark Written
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5 — Done */}
        {step === 5 && selectedCard && (
          <Card className="bg-card border-border rounded-none">
            <CardContent className="py-10 flex flex-col items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-primary" data-testid="icon-success" />
              <div className="text-center">
                <p className="font-semibold text-foreground">{selectedCard.name}</p>
                <p className="text-sm text-muted-foreground mt-1">NFC tag programmed successfully</p>
                {percentPaidInput && !isNaN(parseFloat(percentPaidInput)) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    % paid recorded: <span className="text-primary font-mono">{parseFloat(percentPaidInput).toFixed(1)}%</span>
                  </p>
                )}
                <p className="font-mono text-xs text-primary mt-2 break-all">{generatedShortLink}</p>
              </div>
              <Button data-testid="button-program-another" variant="outline" onClick={reset} className="mt-2">
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Program Another Card
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
