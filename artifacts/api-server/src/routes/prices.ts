import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, priceHistoryTable, cardsTable, activityLogTable } from "@workspace/db";
import {
  GetPriceHistoryParams,
  AddPriceEntryParams,
  AddPriceEntryBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/prices/:cardId", async (req, res): Promise<void> => {
  const params = GetPriceHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const entries = await db
    .select()
    .from(priceHistoryTable)
    .where(eq(priceHistoryTable.cardId, params.data.cardId))
    .orderBy(desc(priceHistoryTable.recordedAt));

  res.json(
    entries.map((e) => ({
      id: e.id,
      card_id: e.cardId,
      price: parseFloat(e.price),
      source: e.source,
      recorded_at: e.recordedAt.toISOString(),
    }))
  );
});

router.post("/prices/:cardId", async (req, res): Promise<void> => {
  const params = AddPriceEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddPriceEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db.insert(priceHistoryTable).values({
    cardId: params.data.cardId,
    price: String(parsed.data.price),
    source: parsed.data.source,
  }).returning();

  await db.update(cardsTable)
    .set({ marketValue: String(parsed.data.price) })
    .where(eq(cardsTable.id, params.data.cardId));

  const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, params.data.cardId));
  if (card) {
    await db.insert(activityLogTable).values({
      type: "price_updated",
      cardId: card.id,
      cardName: card.name,
      amount: String(parsed.data.price),
    });
  }

  res.status(201).json({
    id: entry.id,
    card_id: entry.cardId,
    price: parseFloat(entry.price),
    source: entry.source,
    recorded_at: entry.recordedAt.toISOString(),
  });
});

export default router;
