import { useState, useRef, useEffect } from "react";
import {
  lookupCardByUid,
  useUpdateCard,
  getListCardsQueryKey,
  useListCards,
  getListNfcTagsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Loader2,
  TrendingUp,
  TrendingDown,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CONDITION_LABELS: Record<string, string> = {
  mint: "MT",
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

const CONDITION_COLORS: Record<string, string> = {
  mint: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  near_mint: "text-green-400 border-green-400/30 bg-green-400/10",
  lightly_played: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  moderately_played: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  heavily_played: "text-red-400 border-red-400/30 bg-red-400/10",
  damaged: "text-red-600 border-red-600/30 bg-red-600/10",
};

type FoundCard = {
  id: number;
  name: string;
  set_name: string | null;
  card_number: string | null;
  condition: string;
  status: string;
  purchase_price: number;
  market_value: number | null;
  sold_price: number | null;
};

type SaleRecord = {
  id: number;
  name: string;
  soldPrice: number;
  purchasePrice: number;
  pl: number;
};

type Phase = "scan" | "searching" | "found" | "not_found" | "selling" | "done";

export default function Sales() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uidInputRef = useRef<HTMLInputElement>(null);
  const soldInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("scan");
  const [uid, setUid] = useState("");
  const [card, setCard] = useState<FoundCard | null>(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionSales, setSessionSales] = useState<SaleRecord[]>([]);

  const updateCard = useUpdateCard();

  // Fetch recently sold cards for the session summary sidebar
  const { data: soldCards } = useListCards(
    { status: "sold", sort: "created_at", order: "desc" },
    { query: { queryKey: getListCardsQueryKey({ status: "sold", sort: "created_at", order: "desc" }) } }
  );

  // Auto-focus UID field on mount and when returning to scan phase
  useEffect(() => {
    if (phase === "scan") {
      setTimeout(() => uidInputRef.current?.focus(), 50);
    }
  }, [phase]);

  // Auto-focus sold price when a card is found
  useEffect(() => {
    if (phase === "found") {
      setTimeout(() => {
        soldInputRef.current?.focus();
        soldInputRef.current?.select();
      }, 50);
    }
  }, [phase]);

  async function handleUidSubmit() {
    const raw = uid.trim();
    if (!raw) return;
    setPhase("searching");
    setErrorMsg("");
    try {
      const result = await lookupCardByUid({ uid: raw });
      setCard(result);
      setSoldPrice(result.market_value != null ? result.market_value.toFixed(2) : "");
      setPhase("found");
    } catch {
      setPhase("not_found");
      setErrorMsg(`No card matched UID: ${raw.replace(/\s+/g, "").toUpperCase()}`);
    }
  }

  async function handleSell() {
    if (!card) return;
    const price = parseFloat(soldPrice);
    if (isNaN(price) || price < 0) return;
    setPhase("selling");
    try {
      await updateCard.mutateAsync({ id: card.id, data: { sold_price: price, status: "sold" } });
      queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
      setSessionSales((prev) => [
        { id: card.id, name: card.name, soldPrice: price, purchasePrice: card.purchase_price, pl: price - card.purchase_price },
        ...prev,
      ]);
      setPhase("done");
    } catch {
      toast({ title: "Failed to mark as sold", variant: "destructive" });
      setPhase("found");
    }
  }

  function handleScanAnother() {
    setPhase("scan");
    setUid("");
    setCard(null);
    setSoldPrice("");
    setErrorMsg("");
  }

  const pl = card && card.market_value != null
    ? card.market_value - card.purchase_price
    : null;

  const soldPriceNum = parseFloat(soldPrice);
  const realizedPl = card && !isNaN(soldPriceNum) ? soldPriceNum - card.purchase_price : null;

  const sessionTotalPl = sessionSales.reduce((s, r) => s + r.pl, 0);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main scan panel */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Sales</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scan an NFC chip UID to look up and sell a card instantly
          </p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          {/* UID scan input — always visible */}
          {(phase === "scan" || phase === "searching" || phase === "not_found") && (
            <div className="w-full max-w-md space-y-4">
              {/* Big scan area */}
              <div className="border border-dashed border-primary/40 bg-primary/5 p-8 text-center space-y-4">
                <ScanLine className="h-10 w-10 text-primary/50 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Scan or enter NFC UID</p>
                  <p className="text-xs text-muted-foreground">
                    Hold chip to reader — the UID will type itself — then press Enter
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    ref={uidInputRef}
                    data-testid="input-uid"
                    placeholder="53 D9 E7 E3 52 00 01"
                    value={uid}
                    onChange={(e) => {
                      setUid(e.target.value);
                      if (phase === "not_found") setPhase("scan");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleUidSubmit(); }}
                    className="bg-background border-border font-mono text-sm tracking-widest text-center"
                    disabled={phase === "searching"}
                    autoComplete="off"
                  />
                  <Button
                    data-testid="button-lookup"
                    onClick={handleUidSubmit}
                    disabled={!uid.trim() || phase === "searching"}
                  >
                    {phase === "searching"
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : "Find"}
                  </Button>
                </div>
              </div>

              {phase === "not_found" && (
                <div className="flex items-start gap-2 p-3 border border-red-500/30 bg-red-500/5 text-sm">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-red-400 font-medium">No match found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/50 text-center">
                Spaces and case are ignored — any UID format works
              </p>
            </div>
          )}

          {/* Card found — sell panel */}
          {(phase === "found" || phase === "selling") && card && (
            <div className="w-full max-w-md space-y-4">
              {/* Card info */}
              <div className="border border-primary/40 bg-primary/5 p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-foreground text-lg leading-tight">{card.name}</p>
                    {(card.set_name || card.card_number) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {card.set_name}{card.set_name && card.card_number ? " · " : ""}{card.card_number}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-mono border px-2 py-0.5 shrink-0 ${CONDITION_COLORS[card.condition] ?? "text-muted-foreground border-border"}`}>
                    {CONDITION_LABELS[card.condition] ?? card.condition}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1 border-t border-primary/20">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Paid</p>
                    <p className="font-mono text-sm font-bold text-foreground mt-0.5">${card.purchase_price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Market</p>
                    <p className="font-mono text-sm font-bold text-foreground mt-0.5">
                      {card.market_value != null ? `$${card.market_value.toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Unreal. P&amp;L</p>
                    <p className={`font-mono text-sm font-bold mt-0.5 ${pl != null && pl > 0 ? "text-green-400" : pl != null && pl < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {pl != null ? `${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}` : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sold price */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sold Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={soldInputRef}
                    data-testid="input-sold-price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={soldPrice}
                    onChange={(e) => setSoldPrice(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSell(); }}
                    className="bg-background border-border pl-8 font-mono text-lg h-12"
                    disabled={phase === "selling"}
                  />
                </div>
                {realizedPl != null && (
                  <div className={`flex items-center gap-1.5 text-sm font-mono ${realizedPl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {realizedPl >= 0
                      ? <TrendingUp className="h-4 w-4" />
                      : <TrendingDown className="h-4 w-4" />}
                    Realized P&amp;L: {realizedPl >= 0 ? "+" : ""}${realizedPl.toFixed(2)}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={handleScanAnother}
                  disabled={phase === "selling"}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset
                </Button>
                <Button
                  data-testid="button-confirm-sell"
                  size="lg"
                  className="flex-1 text-base"
                  onClick={handleSell}
                  disabled={!soldPrice || isNaN(parseFloat(soldPrice)) || phase === "selling"}
                >
                  {phase === "selling"
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                    : "Mark Sold"}
                </Button>
              </div>
            </div>
          )}

          {/* Done state */}
          {phase === "done" && card && (
            <div className="w-full max-w-md space-y-4">
              <div className="border border-green-500/30 bg-green-500/5 p-8 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-400" data-testid="icon-sold-success" />
                <div>
                  <p className="font-bold text-foreground text-lg">{card.name}</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Sold for <span className="font-mono text-foreground font-bold">${parseFloat(soldPrice).toFixed(2)}</span>
                  </p>
                  {realizedPl != null && (
                    <p className={`font-mono text-sm mt-1 font-bold ${realizedPl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {realizedPl >= 0 ? "+" : ""}${realizedPl.toFixed(2)} realized
                    </p>
                  )}
                </div>
              </div>
              <Button
                data-testid="button-scan-another"
                size="lg"
                className="w-full"
                onClick={handleScanAnother}
              >
                <ScanLine className="h-4 w-4 mr-2" />
                Scan Next Card
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar — session + recent sales */}
      <div className="w-72 flex flex-col bg-card overflow-hidden">
        {/* Session summary */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Session</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold font-mono text-foreground">{sessionSales.length}</p>
              <p className="text-xs text-muted-foreground">cards sold</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold font-mono ${sessionTotalPl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {sessionTotalPl >= 0 ? "+" : ""}${sessionTotalPl.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">realized P&amp;L</p>
            </div>
          </div>
        </div>

        {/* Session sales list */}
        {sessionSales.length > 0 && (
          <div className="border-b border-border">
            <p className="px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">This session</p>
            <div className="max-h-48 overflow-y-auto">
              {sessionSales.map((sale, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 border-b border-border/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{sale.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">${sale.soldPrice.toFixed(2)}</p>
                  </div>
                  <span className={`text-xs font-mono ml-2 shrink-0 ${sale.pl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {sale.pl >= 0 ? "+" : ""}${sale.pl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent sold cards from DB */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <p className="px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
            Recent Sales
          </p>
          <div className="flex-1 overflow-y-auto">
            {(soldCards ?? []).slice(0, 20).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.set_name ?? "—"}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  {c.sold_price != null && (
                    <p className="text-xs font-mono text-foreground">${c.sold_price.toFixed(2)}</p>
                  )}
                  {c.profit_loss != null && (
                    <p className={`text-[10px] font-mono ${c.profit_loss >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {c.profit_loss >= 0 ? "+" : ""}${c.profit_loss.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {(soldCards ?? []).length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No sales yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
