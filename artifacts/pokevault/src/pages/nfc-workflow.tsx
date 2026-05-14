import { useState, useCallback } from "react";
import {
  useListCards,
  getListCardsQueryKey,
  useCheckNfcUrl,
  useCreateNfcTag,
  useUpdateNfcTag,
  getListNfcTagsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, AlertCircle, Wifi, Loader2, Search, ArrowRight, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NTAG213_MAX = 137;

type Step = 1 | 2 | 3 | 4 | 5;

type SelectedCard = {
  id: number;
  name: string;
  short_code: string | null;
  nfc_written: boolean;
  nfc_tag_id: number | null;
};

export default function NfcWorkflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [cardSearch, setCardSearch] = useState("");
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [checkResult, setCheckResult] = useState<{ byte_length: number; max_bytes: number; fits: boolean; short_url_recommended: boolean; message?: string | null } | null>(null);
  const [generatedShortLink, setGeneratedShortLink] = useState("");
  const [createdTagId, setCreatedTagId] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState(false);

  const { data: cards } = useListCards(
    cardSearch ? { search: cardSearch } : {},
    { query: { queryKey: getListCardsQueryKey(cardSearch ? { search: cardSearch } : {}) } }
  );

  const checkUrl = useCheckNfcUrl();
  const createTag = useCreateNfcTag();
  const updateTag = useUpdateNfcTag();

  const nfcAvailable = typeof window !== "undefined" && "NDEFReader" in window;

  function reset() {
    setStep(1);
    setSelectedCard(null);
    setCardSearch("");
    setUrlInput("");
    setCheckResult(null);
    setGeneratedShortLink("");
    setCreatedTagId(null);
    setWriting(false);
    setWritten(false);
  }

  function handleSelectCard(card: SelectedCard) {
    setSelectedCard(card);
    setStep(2);
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
      if (!nfcAvailable) {
        throw new Error("Web NFC not available in this browser.");
      }
      const ndef = new (window as unknown as { NDEFReader: new () => { write: (msg: unknown) => Promise<void> } }).NDEFReader();
      await ndef.write({
        records: [{ recordType: "url", data: generatedShortLink }],
      });
      await updateTag.mutateAsync({ tagId: createdTagId, data: { written: true } });
      setWritten(true);
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

  const steps = [
    { n: 1, label: "Select Card" },
    { n: 2, label: "URL Check" },
    { n: 3, label: "Short Link" },
    { n: 4, label: "Write Tag" },
    { n: 5, label: "Done" },
  ];

  const filteredCards = (cards ?? []).filter((c) => c.status !== "sold");

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
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
                  <div className={`w-7 h-7 flex items-center justify-center border ${done ? "bg-primary border-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-border text-muted-foreground"} text-xs font-bold`}>
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
                    onClick={() => handleSelectCard({ id: card.id, name: card.name, short_code: card.short_code ?? null, nfc_written: card.nfc_written, nfc_tag_id: card.nfc_tag_id ?? null })}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{card.name}</p>
                      {card.set_name && <p className="text-xs text-muted-foreground">{card.set_name}</p>}
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

        {/* Step 2 — URL check */}
        {step === 2 && selectedCard && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">
                Check URL for <span className="text-primary">{selectedCard.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Paste the TCGplayer or eBay listing URL. The app will check if it fits within NTAG213's 137-byte limit.
                If it doesn't fit, use the generated short link instead.
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
                  {/* Byte meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Byte usage</span>
                      <span className={`font-mono ${checkResult.fits ? "text-green-400" : "text-red-400"}`}>
                        {checkResult.byte_length} / {checkResult.max_bytes} bytes
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-none overflow-hidden">
                      <div
                        data-testid="byte-meter"
                        className={`h-full transition-all ${checkResult.fits ? checkResult.byte_length > 100 ? "bg-yellow-400" : "bg-green-400" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, (checkResult.byte_length / checkResult.max_bytes) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Status message */}
                  <div className={`flex items-start gap-2 p-3 border ${checkResult.fits ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                    {checkResult.fits
                      ? <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                      : <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                    <p className="text-sm" data-testid="text-url-check-result">{checkResult.message}</p>
                  </div>

                  <Button
                    data-testid="button-next-step"
                    className="w-full"
                    onClick={() => setStep(3)}
                  >
                    {checkResult.fits && !checkResult.short_url_recommended
                      ? "URL fits — continue to short link"
                      : "Generate short link"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3 — Generate short link */}
        {step === 3 && selectedCard && (
          <Card className="bg-card border-border rounded-none">
            <CardHeader>
              <CardTitle className="text-sm">Generate Short Link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                A short internal link will be generated and written to the NFC tag. Scanning the tag will open the card's overlay page.
              </p>
              <div className="p-3 bg-background border border-border font-mono text-xs text-muted-foreground break-all">
                {window.location.origin}/overlay/{selectedCard.short_code ?? `[card-${selectedCard.id}]`}
              </div>
              <Button
                data-testid="button-generate-link"
                className="w-full"
                onClick={handleGenerateShortLink}
                disabled={createTag.isPending}
              >
                {createTag.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <>Generate &amp; Continue <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
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
                      Web NFC requires Chrome on a device with NFC hardware (Android or a desktop with ACR122U support).
                      You can still mark the tag as written manually below.
                    </p>
                  </div>
                </div>
              )}
              <div className="p-3 bg-background border border-border">
                <p className="text-xs text-muted-foreground mb-1">Short link to write</p>
                <p className="font-mono text-sm text-primary break-all" data-testid="text-short-link">{generatedShortLink}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Hold your NTAG213 sticker close to the NFC reader, then click Write.
              </p>
              <div className="flex gap-2">
                <Button
                  data-testid="button-write-tag"
                  className="flex-1"
                  onClick={handleWriteTag}
                  disabled={writing}
                >
                  {writing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Writing...</>
                  ) : (
                    <><Wifi className="h-4 w-4 mr-2" /> Write NFC Tag</>
                  )}
                </Button>
                {!nfcAvailable && createdTagId && (
                  <Button
                    data-testid="button-mark-written-manual"
                    variant="outline"
                    onClick={async () => {
                      await updateTag.mutateAsync({ tagId: createdTagId, data: { written: true } });
                      setWritten(true);
                      setStep(5);
                      queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
                      queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
                    }}
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
                <p className="font-mono text-xs text-primary mt-2 break-all">{generatedShortLink}</p>
              </div>
              <Button
                data-testid="button-program-another"
                variant="outline"
                onClick={reset}
                className="mt-2"
              >
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
