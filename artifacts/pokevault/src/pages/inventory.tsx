import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListCards,
  getListCardsQueryKey,
  useCreateCard,
  useDeleteCard,
  useMarkCardSold,
  useUpdateCard,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Search, ArrowUpDown, Wifi, ChevronRight, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CONDITIONS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, string> = {
  in_collection: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  listed: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  sold: "text-muted-foreground border-border bg-muted/30",
};

const addCardSchema = z.object({
  name: z.string().min(1, "Name is required"),
  set_name: z.string().optional(),
  card_number: z.string().optional(),
  condition: z.enum(["mint", "near_mint", "lightly_played", "moderately_played", "heavily_played", "damaged"]),
  purchase_price: z.coerce.number().min(0),
  market_value: z.coerce.number().optional(),
  percent_paid: z.coerce.number().min(0).max(999).optional(),
  notes: z.string().optional(),
});
type AddCardValues = z.infer<typeof addCardSchema>;

// Inline cell editor for sold price
function InlineSoldEditor({
  cardId,
  currentValue,
  onDone,
}: {
  cardId: number;
  currentValue: number | null;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(currentValue != null ? String(currentValue) : "");

  const updateCard = useUpdateCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
        onDone();
        toast({ title: "Sold price updated" });
      },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    },
  });

  function save() {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) { onDone(); return; }
    updateCard.mutate({ id: cardId, data: { sold_price: num } });
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Input
        ref={inputRef}
        autoFocus
        data-testid={`input-inline-sold-${cardId}`}
        type="number"
        step="0.01"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }}
        className="h-6 w-24 text-xs font-mono bg-background border-primary px-1 py-0"
      />
      <button
        data-testid={`button-save-sold-${cardId}`}
        onClick={save}
        disabled={updateCard.isPending}
        className="text-green-400 hover:text-green-300 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={onDone} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function Inventory() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sort, setSort] = useState("created_at");
  const [addOpen, setAddOpen] = useState(false);
  const [editingSoldId, setEditingSoldId] = useState<number | null>(null);

  const params = {
    ...(search ? { search } : {}),
    ...(filterCondition !== "all" ? { condition: filterCondition } : {}),
    ...(filterStatus !== "all" ? { status: filterStatus } : {}),
    sort,
  };

  const { data: cards, isLoading } = useListCards(params, {
    query: { queryKey: getListCardsQueryKey(params) },
  });

  const createCard = useCreateCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
        setAddOpen(false);
        form.reset();
        toast({ title: "Card added to inventory" });
      },
      onError: () => toast({ title: "Failed to add card", variant: "destructive" }),
    },
  });

  const deleteCard = useDeleteCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
        toast({ title: "Card removed" });
      },
      onError: () => toast({ title: "Failed to remove card", variant: "destructive" }),
    },
  });

  const form = useForm<AddCardValues>({
    resolver: zodResolver(addCardSchema),
    defaultValues: {
      name: "",
      set_name: "",
      card_number: "",
      condition: "near_mint",
      purchase_price: 0,
      market_value: undefined,
      percent_paid: undefined,
      notes: "",
    },
  });

  function onAddSubmit(values: AddCardValues) {
    createCard.mutate({ data: values });
  }

  const displayCards = cards ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-border"
          />
        </div>

        <Select value={filterCondition} onValueChange={setFilterCondition}>
          <SelectTrigger data-testid="select-condition" className="w-36 bg-background border-border">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All conditions</SelectItem>
            <SelectItem value="mint">Mint</SelectItem>
            <SelectItem value="near_mint">Near Mint</SelectItem>
            <SelectItem value="lightly_played">Lightly Played</SelectItem>
            <SelectItem value="moderately_played">Moderately Played</SelectItem>
            <SelectItem value="heavily_played">Heavily Played</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger data-testid="select-status" className="w-36 bg-background border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="in_collection">In Collection</SelectItem>
            <SelectItem value="listed">Listed</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger data-testid="select-sort" className="w-40 bg-background border-border">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Added</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="market_value">Market Value</SelectItem>
            <SelectItem value="purchase_price">Purchase Price</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-card" className="ml-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Card
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle>Add Card to Inventory</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Card Name</FormLabel>
                    <FormControl>
                      <Input data-testid="input-card-name" placeholder="Charizard VMAX" {...field} className="bg-background border-border" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="set_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Set Name</FormLabel>
                      <FormControl>
                        <Input data-testid="input-set-name" placeholder="Brilliant Stars" {...field} className="bg-background border-border" />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="card_number" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Card Number</FormLabel>
                      <FormControl>
                        <Input data-testid="input-card-number" placeholder="017/172" {...field} className="bg-background border-border" />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="condition" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-card-condition" className="bg-background border-border">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="mint">Mint</SelectItem>
                        <SelectItem value="near_mint">Near Mint</SelectItem>
                        <SelectItem value="lightly_played">Lightly Played</SelectItem>
                        <SelectItem value="moderately_played">Moderately Played</SelectItem>
                        <SelectItem value="heavily_played">Heavily Played</SelectItem>
                        <SelectItem value="damaged">Damaged</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="purchase_price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Price ($)</FormLabel>
                      <FormControl>
                        <Input data-testid="input-purchase-price" type="number" step="0.01" {...field} className="bg-background border-border" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="market_value" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Market Value ($)</FormLabel>
                      <FormControl>
                        <Input data-testid="input-market-value" type="number" step="0.01" placeholder="Optional" {...field} className="bg-background border-border" />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="percent_paid" render={({ field }) => (
                  <FormItem>
                    <FormLabel>% Paid of Market</FormLabel>
                    <FormControl>
                      <Input data-testid="input-percent-paid" type="number" step="0.1" placeholder="e.g. 65 for 65%" {...field} className="bg-background border-border" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input data-testid="input-notes" placeholder="Optional notes..." {...field} className="bg-background border-border" />
                    </FormControl>
                  </FormItem>
                )} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button data-testid="button-submit-card" type="submit" disabled={createCard.isPending}>
                    {createCard.isPending ? "Adding..." : "Add Card"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-muted-foreground text-sm">Loading inventory...</div>
        ) : displayCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
            <p className="text-sm">No cards found.</p>
            <p className="text-xs">Add your first card with the button above.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse" data-testid="table-inventory">
            <thead>
              <tr className="border-b border-border bg-card sticky top-0 z-10">
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Card</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cond</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Market</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sold</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&amp;L</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">% Paid</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">NFC</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayCards.map((card) => {
                const pl = card.profit_loss ?? 0;
                const plColor = pl > 0 ? "text-green-400" : pl < 0 ? "text-red-400" : "text-muted-foreground";

                // % paid: use stored value, or derive from purchase/market if available
                const derivedPctPaid = card.percent_paid != null
                  ? card.percent_paid
                  : (card.market_value != null && card.market_value > 0)
                    ? (card.purchase_price / card.market_value) * 100
                    : null;
                const pctPaidColor = derivedPctPaid != null
                  ? derivedPctPaid <= 70 ? "text-green-400"
                    : derivedPctPaid <= 90 ? "text-yellow-400"
                    : "text-muted-foreground"
                  : "text-muted-foreground";

                return (
                  <tr
                    key={card.id}
                    data-testid={`row-card-${card.id}`}
                    className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors group"
                    onClick={() => setLocation(`/inventory/${card.id}`)}
                  >
                    <td className="px-6 py-3">
                      <div className="font-medium text-foreground">{card.name}</div>
                      {(card.set_name || card.card_number) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {card.set_name}{card.set_name && card.card_number ? " · " : ""}{card.card_number}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border ${CONDITION_COLORS[card.condition] ?? ""}`}>
                        {CONDITIONS[card.condition] ?? card.condition}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs border capitalize ${STATUS_COLORS[card.status] ?? ""}`}>
                        {card.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      ${card.purchase_price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      {card.market_value != null ? `$${card.market_value.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                    </td>

                    {/* Sold price — click to inline-edit */}
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {editingSoldId === card.id ? (
                        <InlineSoldEditor
                          cardId={card.id}
                          currentValue={card.sold_price ?? null}
                          onDone={() => setEditingSoldId(null)}
                        />
                      ) : (
                        <button
                          data-testid={`cell-sold-${card.id}`}
                          className="font-mono text-right w-full hover:text-primary transition-colors group-hover:underline decoration-dashed underline-offset-2"
                          onClick={() => setEditingSoldId(card.id)}
                          title="Click to edit sold price"
                        >
                          {card.sold_price != null
                            ? <span className="text-foreground">${card.sold_price.toFixed(2)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </button>
                      )}
                    </td>

                    <td className={`px-4 py-3 text-right font-mono ${plColor}`}>
                      {card.profit_loss != null
                        ? `${card.profit_loss >= 0 ? "+" : ""}$${card.profit_loss.toFixed(2)}`
                        : <span className="text-muted-foreground">—</span>}
                    </td>

                    {/* % Paid */}
                    <td className={`px-4 py-3 text-right font-mono ${pctPaidColor}`} data-testid={`cell-pct-paid-${card.id}`}>
                      {derivedPctPaid != null
                        ? `${derivedPctPaid.toFixed(1)}%`
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {card.nfc_written
                        ? <Wifi className="h-4 w-4 text-primary mx-auto" />
                        : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <Button
                          data-testid={`button-delete-${card.id}`}
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-red-400"
                          onClick={() => deleteCard.mutate({ id: card.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-6 py-2 bg-card text-xs text-muted-foreground">
        {displayCards.length} card{displayCards.length !== 1 ? "s" : ""} shown
      </div>
    </div>
  );
}
