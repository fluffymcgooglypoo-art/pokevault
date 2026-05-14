import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetCard,
  getGetCardQueryKey,
  useUpdateCard,
  useMarkCardSold,
  useGetPriceHistory,
  getGetPriceHistoryQueryKey,
  useAddPriceEntry,
  useRefreshCardPrice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Edit2,
  Save,
  X,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CONDITIONS: Record<string, string> = {
  mint: "Mint",
  near_mint: "Near Mint",
  lightly_played: "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played: "Heavily Played",
  damaged: "Damaged",
};

const CONDITION_COLORS: Record<string, string> = {
  mint: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  near_mint: "text-green-400 border-green-400/30 bg-green-400/10",
  lightly_played: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  moderately_played: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  heavily_played: "text-red-400 border-red-400/30 bg-red-400/10",
  damaged: "text-red-600 border-red-600/30 bg-red-600/10",
};

const editSchema = z.object({
  name: z.string().min(1),
  set_name: z.string().optional(),
  card_number: z.string().optional(),
  condition: z.enum(["mint", "near_mint", "lightly_played", "moderately_played", "heavily_played", "damaged"]),
  purchase_price: z.coerce.number().min(0),
  market_value: z.coerce.number().optional(),
  notes: z.string().optional(),
  tcgplayer_url: z.string().optional(),
  ebay_url: z.string().optional(),
});
type EditValues = z.infer<typeof editSchema>;

const soldSchema = z.object({
  sold_price: z.coerce.number().min(0),
});
type SoldValues = z.infer<typeof soldSchema>;

const priceSchema = z.object({
  price: z.coerce.number().min(0),
  source: z.enum(["tcgplayer", "ebay", "manual"]),
});
type PriceValues = z.infer<typeof priceSchema>;

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const cardId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [soldOpen, setSoldOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const { data: card, isLoading } = useGetCard(cardId, {
    query: { enabled: !!cardId, queryKey: getGetCardQueryKey(cardId) },
  });

  const { data: priceHistory } = useGetPriceHistory(cardId, {
    query: { enabled: !!cardId, queryKey: getGetPriceHistoryQueryKey(cardId) },
  });

  const updateCard = useUpdateCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCardQueryKey(cardId) });
        setEditing(false);
        toast({ title: "Card updated" });
      },
      onError: () => toast({ title: "Failed to update card", variant: "destructive" }),
    },
  });

  const markSold = useMarkCardSold({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCardQueryKey(cardId) });
        setSoldOpen(false);
        toast({ title: "Card marked as sold" });
      },
      onError: () => toast({ title: "Failed to mark card as sold", variant: "destructive" }),
    },
  });

  const refreshPrice = useRefreshCardPrice({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetCardQueryKey(cardId) });
        queryClient.invalidateQueries({ queryKey: getGetPriceHistoryQueryKey(cardId) });
        toast({ title: data.message });
      },
      onError: () => toast({ title: "Price refresh failed", variant: "destructive" }),
    },
  });

  const addPrice = useAddPriceEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPriceHistoryQueryKey(cardId) });
        queryClient.invalidateQueries({ queryKey: getGetCardQueryKey(cardId) });
        setPriceOpen(false);
        priceForm.reset();
        toast({ title: "Price entry added" });
      },
      onError: () => toast({ title: "Failed to add price entry", variant: "destructive" }),
    },
  });

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema as any),
    values: card
      ? {
          name: card.name,
          set_name: card.set_name ?? "",
          card_number: card.card_number ?? "",
          condition: card.condition as EditValues["condition"],
          purchase_price: card.purchase_price,
          market_value: card.market_value ?? undefined,
          notes: card.notes ?? "",
          tcgplayer_url: card.tcgplayer_url ?? "",
          ebay_url: card.ebay_url ?? "",
        }
      : undefined,
  });

  const soldForm = useForm<SoldValues>({
    resolver: zodResolver(soldSchema as any),
    defaultValues: { sold_price: card?.market_value ?? 0 },
  });

  const priceForm = useForm<PriceValues>({
    resolver: zodResolver(priceSchema as any),
    defaultValues: { price: 0, source: "manual" },
  });

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading card...</div>;
  }

  if (!card) {
    return (
      <div className="p-8 text-muted-foreground text-sm">
        Card not found.{" "}
        <button className="text-primary hover:underline" onClick={() => setLocation("/inventory")}>
          Back to inventory
        </button>
      </div>
    );
  }

  const pl = card.profit_loss ?? 0;
  const plColor = pl > 0 ? "text-green-400" : pl < 0 ? "text-red-400" : "text-muted-foreground";

  function onEditSubmit(values: EditValues) {
    updateCard.mutate({ id: cardId, data: values });
  }

  function onSoldSubmit(values: SoldValues) {
    markSold.mutate({ id: cardId, data: values });
  }

  function onPriceSubmit(values: PriceValues) {
    addPrice.mutate({ cardId, data: values });
  }

  const recentPrices = (priceHistory ?? []).slice(0, 10);
  const minPrice = recentPrices.length ? Math.min(...recentPrices.map((p) => p.price)) : 0;
  const maxPrice = recentPrices.length ? Math.max(...recentPrices.map((p) => p.price)) : 1;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-card">
        <Button
          data-testid="button-back"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setLocation("/inventory")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground truncate" data-testid="text-card-name">{card.name}</h2>
          {(card.set_name || card.card_number) && (
            <p className="text-xs text-muted-foreground">
              {card.set_name}{card.set_name && card.card_number ? " · " : ""}{card.card_number}
            </p>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border ${CONDITION_COLORS[card.condition] ?? ""}`}>
          {CONDITIONS[card.condition] ?? card.condition}
        </span>
        {card.nfc_written
          ? <Wifi className="h-4 w-4 text-primary" />
          : <WifiOff className="h-4 w-4 text-muted-foreground/40" />}
        <div className="flex gap-2">
          {!editing && (
            <Button
              data-testid="button-refresh-price"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => refreshPrice.mutate({ id: cardId })}
              disabled={refreshPrice.isPending}
              title="Refresh market price"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshPrice.isPending ? "animate-spin" : ""}`} />
              {refreshPrice.isPending ? "Refreshing…" : "Refresh Price"}
            </Button>
          )}
          {!editing && card.status !== "sold" && (
            <Button
              data-testid="button-mark-sold"
              variant="outline"
              size="sm"
              className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
              onClick={() => setSoldOpen(true)}
            >
              <DollarSign className="h-3.5 w-3.5 mr-1" />
              Mark Sold
            </Button>
          )}
          {!editing ? (
            <Button data-testid="button-edit" size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit2 className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          ) : (
            <>
              <Button data-testid="button-cancel-edit" size="sm" variant="ghost" onClick={() => { setEditing(false); form.reset(); }}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button data-testid="button-save-edit" size="sm" onClick={form.handleSubmit(onEditSubmit)} disabled={updateCard.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {updateCard.isPending ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 grid grid-cols-3 gap-6">
        {/* Left column — card details */}
        <div className="col-span-2 space-y-6">
          {/* P&L stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Purchase Price", value: `$${card.purchase_price.toFixed(2)}`, color: "text-foreground" },
              { label: "Market Value", value: card.market_value != null ? `$${card.market_value.toFixed(2)}` : "—", color: "text-primary" },
              { label: card.status === "sold" ? "Sold Price" : "Unrealized P&L", value: card.status === "sold" ? (card.sold_price != null ? `$${card.sold_price.toFixed(2)}` : "—") : (card.profit_loss != null ? `${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}` : "—"), color: plColor },
              { label: "Status", value: card.status.replace("_", " "), color: "text-foreground capitalize" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="bg-card border-border rounded-none">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <p className={`text-xl font-bold font-mono ${color}`} data-testid={`text-${label.toLowerCase().replace(/ /g, "-")}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Edit form or display */}
          {editing ? (
            <Card className="bg-card border-border rounded-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Edit Card Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form className="space-y-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Name</FormLabel>
                        <FormControl><Input data-testid="input-edit-name" {...field} className="bg-background border-border" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="set_name" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Set Name</FormLabel>
                          <FormControl><Input data-testid="input-edit-set" {...field} className="bg-background border-border" /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="card_number" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Card Number</FormLabel>
                          <FormControl><Input data-testid="input-edit-number" {...field} className="bg-background border-border" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="condition" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condition</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-condition" className="bg-background border-border">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(CONDITIONS).map(([val, label]) => (
                              <SelectItem key={val} value={val}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="purchase_price" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Purchase Price ($)</FormLabel>
                          <FormControl><Input data-testid="input-edit-purchase" type="number" step="0.01" {...field} className="bg-background border-border" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="market_value" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Market Value ($)</FormLabel>
                          <FormControl><Input data-testid="input-edit-market" type="number" step="0.01" {...field} className="bg-background border-border" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="tcgplayer_url" render={({ field }) => (
                      <FormItem>
                        <FormLabel>TCGplayer URL</FormLabel>
                        <FormControl><Input data-testid="input-edit-tcg" placeholder="https://www.tcgplayer.com/..." {...field} className="bg-background border-border" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="ebay_url" render={({ field }) => (
                      <FormItem>
                        <FormLabel>eBay URL</FormLabel>
                        <FormControl><Input data-testid="input-edit-ebay" placeholder="https://www.ebay.com/..." {...field} className="bg-background border-border" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl><Input data-testid="input-edit-notes" {...field} className="bg-background border-border" /></FormControl>
                      </FormItem>
                    )} />
                  </form>
                </Form>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border rounded-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Card Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  {[
                    ["Short Code", card.short_code ?? "—"],
                    ["NFC Status", card.nfc_written ? "Written" : "Not written"],
                    ...(card.notes ? [["Notes", card.notes]] : []),
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-foreground mt-0.5" data-testid={`text-detail-${label?.toLowerCase().replace(/ /g, "-")}`}>{value}</p>
                    </div>
                  ))}
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">NFC UID</p>
                    <p
                      className={`mt-0.5 font-mono text-xs tracking-wider ${card.tag_uid ? "text-primary" : "text-muted-foreground/50"}`}
                      data-testid="text-detail-nfc-uid"
                    >{card.tag_uid ?? "—"}</p>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  {card.tcgplayer_url && (
                    <a
                      data-testid="link-tcgplayer"
                      href={card.tcgplayer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      TCGplayer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {card.ebay_url && (
                    <a
                      data-testid="link-ebay"
                      href={card.ebay_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      eBay <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Price history chart */}
          <Card className="bg-card border-border rounded-none">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Price History</CardTitle>
              <Button
                data-testid="button-add-price"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-primary"
                onClick={() => setPriceOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Entry
              </Button>
            </CardHeader>
            <CardContent>
              {recentPrices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No price history yet.</p>
              ) : (
                <div className="space-y-2">
                  {/* Simple bar chart */}
                  <div className="flex items-end gap-1 h-24">
                    {[...recentPrices].reverse().map((entry, i) => {
                      const range = maxPrice - minPrice || 1;
                      const heightPct = 20 + ((entry.price - minPrice) / range) * 80;
                      return (
                        <div
                          key={entry.id}
                          className="flex-1 bg-primary/30 hover:bg-primary/60 transition-colors relative group"
                          style={{ height: `${heightPct}%` }}
                          data-testid={`bar-price-${entry.id}`}
                        >
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap">
                            ${entry.price.toFixed(0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* List */}
                  <div className="border-t border-border pt-3 space-y-1.5">
                    {recentPrices.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between text-xs" data-testid={`row-price-${entry.id}`}>
                        <span className="text-muted-foreground">
                          {new Date(entry.recorded_at).toLocaleDateString()} · {entry.source}
                        </span>
                        <span className="font-mono text-foreground">${entry.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {card.image_url && (
            <Card className="bg-card border-border rounded-none overflow-hidden">
              <img
                src={card.image_url}
                alt={card.name}
                data-testid="img-card"
                className="w-full object-contain"
              />
            </Card>
          )}
          <Card className="bg-card border-border rounded-none">
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">NFC Tag</p>
                <div className="flex items-center gap-2 mt-1">
                  {card.nfc_written ? (
                    <span className="flex items-center gap-1 text-primary text-sm"><Wifi className="h-4 w-4" /> Written</span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground text-sm"><WifiOff className="h-4 w-4" /> Not written</span>
                  )}
                </div>
                {card.short_code && (
                  <p className="text-xs text-muted-foreground font-mono mt-1">{card.short_code}</p>
                )}
              </div>
              {!card.nfc_written && (
                <Button
                  data-testid="button-go-nfc"
                  variant="outline"
                  size="sm"
                  className="w-full border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => setLocation("/nfc")}
                >
                  <Wifi className="h-3.5 w-3.5 mr-2" />
                  Program NFC Tag
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mark Sold dialog */}
      <Dialog open={soldOpen} onOpenChange={setSoldOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>Mark as Sold</DialogTitle></DialogHeader>
          <Form {...soldForm}>
            <form onSubmit={soldForm.handleSubmit(onSoldSubmit)} className="space-y-4">
              <FormField control={soldForm.control} name="sold_price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sold Price ($)</FormLabel>
                  <FormControl><Input data-testid="input-detail-sold-price" type="number" step="0.01" {...field} className="bg-background border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSoldOpen(false)}>Cancel</Button>
                <Button data-testid="button-confirm-detail-sold" type="submit" disabled={markSold.isPending}>
                  {markSold.isPending ? "Saving..." : "Confirm Sale"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add price dialog */}
      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>Add Price Entry</DialogTitle></DialogHeader>
          <Form {...priceForm}>
            <form onSubmit={priceForm.handleSubmit(onPriceSubmit)} className="space-y-4">
              <FormField control={priceForm.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Price ($)</FormLabel>
                  <FormControl><Input data-testid="input-price-entry" type="number" step="0.01" {...field} className="bg-background border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={priceForm.control} name="source" render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-price-source" className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="tcgplayer">TCGplayer</SelectItem>
                      <SelectItem value="ebay">eBay</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPriceOpen(false)}>Cancel</Button>
                <Button data-testid="button-submit-price" type="submit" disabled={addPrice.isPending}>
                  {addPrice.isPending ? "Adding..." : "Add Entry"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
