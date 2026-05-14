import { useState, useRef, useEffect } from "react";
import {
  lookupCardByUid,
  useMarkCardSold,
  useUpdateCard,
  getListCardsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ScanLine, CheckCircle2, AlertCircle, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

type Phase = "scan" | "searching" | "found" | "not_found" | "selling" | "done";

interface ScanToSellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONDITION_LABELS: Record<string, string> = {
  mint: "MT",
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

export function ScanToSellDialog({ open, onOpenChange }: ScanToSellDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uidInputRef = useRef<HTMLInputElement>(null);
  const soldInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("scan");
  const [uid, setUid] = useState("");
  const [card, setCard] = useState<FoundCard | null>(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const markSold = useMarkCardSold();
  const updateCard = useUpdateCard();

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setPhase("scan");
        setUid("");
        setCard(null);
        setSoldPrice("");
        setErrorMsg("");
      }, 200);
    }
  }, [open]);

  // Auto-focus UID input when dialog opens or returns to scan phase
  useEffect(() => {
    if (open && phase === "scan") {
      setTimeout(() => uidInputRef.current?.focus(), 50);
    }
  }, [open, phase]);

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
      // Pre-fill with market value as a suggested sold price
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border rounded-none max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <ScanLine className="h-4 w-4 text-primary" />
            Scan to Sell
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 pt-4 space-y-4">

          {/* Phase: scan */}
          {(phase === "scan" || phase === "searching" || phase === "not_found") && (
            <>
              <p className="text-xs text-muted-foreground">
                Scan or paste the NFC chip UID. Spaces and case are ignored.
              </p>
              <div className="flex gap-2">
                <Input
                  ref={uidInputRef}
                  data-testid="input-uid"
                  placeholder="53 D9 E7 E3 52 00 01"
                  value={uid}
                  onChange={(e) => { setUid(e.target.value); if (phase === "not_found") setPhase("scan"); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleUidSubmit(); }}
                  className="bg-background border-border font-mono text-sm tracking-wider"
                  disabled={phase === "searching"}
                />
                <Button
                  data-testid="button-lookup"
                  onClick={handleUidSubmit}
                  disabled={!uid.trim() || phase === "searching"}
                  className="shrink-0"
                >
                  {phase === "searching"
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : "Find"}
                </Button>
              </div>

              {phase === "not_found" && (
                <div className="flex items-start gap-2 p-3 border border-red-500/30 bg-red-500/5 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-400">{errorMsg}</span>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                Tip: NFC scanners act as keyboards — scan the tag and the UID will be entered automatically.
              </p>
            </>
          )}

          {/* Phase: found / selling */}
          {(phase === "found" || phase === "selling") && card && (
            <>
              {/* Card info */}
              <div className="border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground text-sm leading-tight">{card.name}</p>
                    {(card.set_name || card.card_number) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {card.set_name}{card.set_name && card.card_number ? " · " : ""}{card.card_number}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {CONDITION_LABELS[card.condition] ?? card.condition}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Paid</p>
                    <p className="font-mono text-xs font-bold text-foreground">${card.purchase_price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Market</p>
                    <p className="font-mono text-xs font-bold text-foreground">
                      {card.market_value != null ? `$${card.market_value.toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Unreal. P&amp;L</p>
                    <p className={`font-mono text-xs font-bold ${pl != null && pl > 0 ? "text-green-400" : pl != null && pl < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {pl != null ? `${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}` : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sold price entry */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Sold Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
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
                    className="bg-background border-border pl-8 font-mono text-sm"
                    disabled={phase === "selling"}
                  />
                </div>
                {soldPrice && card.purchase_price > 0 && !isNaN(parseFloat(soldPrice)) && (
                  <p className={`text-xs font-mono ${parseFloat(soldPrice) >= card.purchase_price ? "text-green-400" : "text-red-400"}`}>
                    Realized P&L: {parseFloat(soldPrice) >= card.purchase_price ? "+" : ""}${(parseFloat(soldPrice) - card.purchase_price).toFixed(2)}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={handleScanAnother}
                  disabled={phase === "selling"}
                >
                  Back
                </Button>
                <Button
                  data-testid="button-confirm-sell"
                  className="flex-1"
                  onClick={handleSell}
                  disabled={!soldPrice || isNaN(parseFloat(soldPrice)) || phase === "selling"}
                >
                  {phase === "selling"
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                    : "Mark Sold"}
                </Button>
              </div>
            </>
          )}

          {/* Phase: done */}
          {phase === "done" && card && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" data-testid="icon-sold-success" />
              <div>
                <p className="font-semibold text-foreground">{card.name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Sold for <span className="font-mono text-foreground">${parseFloat(soldPrice).toFixed(2)}</span>
                </p>
                {!isNaN(parseFloat(soldPrice)) && (
                  <p className={`text-xs font-mono mt-1 ${parseFloat(soldPrice) >= card.purchase_price ? "text-green-400" : "text-red-400"}`}>
                    {parseFloat(soldPrice) >= card.purchase_price ? "+" : ""}${(parseFloat(soldPrice) - card.purchase_price).toFixed(2)} realized
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleScanAnother} data-testid="button-scan-another">
                  Scan Another
                </Button>
                <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
