import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, cardsTable, activityLogTable, nfcTagsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const allCards = await db.select().from(cardsTable);

  const inCollection = allCards.filter((c) => c.status !== "sold");
  const sold = allCards.filter((c) => c.status === "sold");

  const totalInvested = inCollection.reduce((sum, c) => sum + parseFloat(c.purchasePrice ?? "0"), 0);
  const totalMarketValue = inCollection.reduce(
    (sum, c) => sum + (c.marketValue != null ? parseFloat(c.marketValue) : parseFloat(c.purchasePrice ?? "0")),
    0
  );
  const totalProfitLoss = totalMarketValue - totalInvested;

  const totalSoldRevenue = sold.reduce((sum, c) => sum + (c.soldPrice != null ? parseFloat(c.soldPrice) : 0), 0);
  const totalSoldCost = sold.reduce((sum, c) => sum + parseFloat(c.purchasePrice ?? "0"), 0);
  const realizedProfitLoss = totalSoldRevenue - totalSoldCost;

  const [nfcCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardsTable)
    .where(eq(cardsTable.nfcWritten, true));

  res.json({
    total_cards: inCollection.length,
    total_invested: totalInvested,
    total_market_value: totalMarketValue,
    total_profit_loss: totalProfitLoss,
    cards_sold: sold.length,
    total_sold_revenue: totalSoldRevenue,
    realized_profit_loss: realizedProfitLoss,
    nfc_tagged_count: nfcCount?.count ?? 0,
  });
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const activity = await db
    .select()
    .from(activityLogTable)
    .orderBy(desc(activityLogTable.timestamp))
    .limit(20);

  res.json(
    activity.map((a) => ({
      id: a.id,
      type: a.type,
      card_id: a.cardId,
      card_name: a.cardName,
      amount: a.amount != null ? parseFloat(a.amount) : null,
      timestamp: a.timestamp.toISOString(),
    }))
  );
});

router.get("/dashboard/top-cards", async (_req, res): Promise<void> => {
  const cards = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.status, "in_collection"))
    .orderBy(desc(sql`${cardsTable.marketValue}::numeric`))
    .limit(10);

  res.json(
    cards.map((card) => {
      const purchasePrice = parseFloat(card.purchasePrice ?? "0");
      const marketValue = card.marketValue != null ? parseFloat(card.marketValue) : null;
      const profitLoss = marketValue != null ? marketValue - purchasePrice : null;
      return {
        id: card.id,
        name: card.name,
        set_name: card.setName ?? null,
        card_number: card.cardNumber ?? null,
        condition: card.condition,
        status: card.status,
        purchase_price: purchasePrice,
        market_value: marketValue,
        sold_price: null,
        profit_loss: profitLoss,
        tcgplayer_url: card.tcgplayerUrl ?? null,
        ebay_url: card.ebayUrl ?? null,
        short_code: card.shortCode ?? null,
        nfc_tag_id: card.nfcTagId ?? null,
        nfc_written: card.nfcWritten,
        image_url: card.imageUrl ?? null,
        notes: card.notes ?? null,
        created_at: card.createdAt.toISOString(),
        updated_at: card.updatedAt.toISOString(),
      };
    })
  );
});

export default router;
