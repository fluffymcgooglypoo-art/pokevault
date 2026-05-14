import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, cardsTable, priceHistoryTable } from "@workspace/db";
import { GetOverlayDataParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/overlay/:shortCode", async (req, res): Promise<void> => {
  const params = GetOverlayDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [card] = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.shortCode, params.data.shortCode));

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  const recentPrices = await db
    .select()
    .from(priceHistoryTable)
    .where(eq(priceHistoryTable.cardId, card.id))
    .orderBy(desc(priceHistoryTable.recordedAt))
    .limit(5);

  const purchasePrice = parseFloat(card.purchasePrice ?? "0");
  const marketValue = card.marketValue != null ? parseFloat(card.marketValue) : null;
  const soldPrice = card.soldPrice != null ? parseFloat(card.soldPrice) : null;
  let profitLoss: number | null = null;
  if (card.status === "sold" && soldPrice != null) {
    profitLoss = soldPrice - purchasePrice;
  } else if (marketValue != null) {
    profitLoss = marketValue - purchasePrice;
  }

  res.json({
    card_name: card.name,
    set_name: card.setName ?? null,
    card_number: card.cardNumber ?? null,
    condition: card.condition,
    market_value: marketValue,
    purchase_price: purchasePrice,
    profit_loss: profitLoss,
    image_url: card.imageUrl ?? null,
    recent_prices: recentPrices.map((p) => ({
      id: p.id,
      card_id: p.cardId,
      price: parseFloat(p.price),
      source: p.source,
      recorded_at: p.recordedAt.toISOString(),
    })),
  });
});

export default router;
