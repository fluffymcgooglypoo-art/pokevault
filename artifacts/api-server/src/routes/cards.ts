import { Router, type IRouter } from "express";
import { eq, ilike, and, desc, asc, sql } from "drizzle-orm";
import { db, cardsTable, activityLogTable, priceHistoryTable, nfcTagsTable } from "@workspace/db";
import {
  ListCardsQueryParams,
  GetCardParams,
  CreateCardBody,
  UpdateCardParams,
  UpdateCardBody,
  DeleteCardParams,
  MarkCardSoldParams,
  MarkCardSoldBody,
} from "@workspace/api-zod";
import { nanoid } from "nanoid";

const router: IRouter = Router();

function cardToResponse(card: typeof cardsTable.$inferSelect, tagUid?: string | null) {
  const purchasePrice = parseFloat(card.purchasePrice ?? "0");
  const marketValue = card.marketValue != null ? parseFloat(card.marketValue) : null;
  const soldPrice = card.soldPrice != null ? parseFloat(card.soldPrice) : null;
  const percentPaid = card.percentPaid != null ? parseFloat(card.percentPaid) : null;
  let profitLoss: number | null = null;
  if (card.status === "sold" && soldPrice != null) {
    profitLoss = soldPrice - purchasePrice;
  } else if (marketValue != null) {
    profitLoss = marketValue - purchasePrice;
  }
  return {
    id: card.id,
    name: card.name,
    set_name: card.setName ?? null,
    card_number: card.cardNumber ?? null,
    condition: card.condition,
    status: card.status,
    purchase_price: purchasePrice,
    market_value: marketValue,
    sold_price: soldPrice,
    profit_loss: profitLoss,
    percent_paid: percentPaid,
    tcgplayer_url: card.tcgplayerUrl ?? null,
    ebay_url: card.ebayUrl ?? null,
    short_code: card.shortCode ?? null,
    nfc_tag_id: card.nfcTagId ?? null,
    tag_uid: tagUid ?? null,
    nfc_written: card.nfcWritten,
    image_url: card.imageUrl ?? null,
    notes: card.notes ?? null,
    created_at: card.createdAt.toISOString(),
    updated_at: card.updatedAt.toISOString(),
  };
}

router.get("/cards", async (req, res): Promise<void> => {
  const params = ListCardsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { search, condition, status, sort, order } = params.data;

  const conditions = [];
  if (search) conditions.push(ilike(cardsTable.name, `%${search}%`));
  if (condition) conditions.push(eq(cardsTable.condition, condition));
  if (status) conditions.push(eq(cardsTable.status, status));

  const orderDir = order === "asc" ? asc : desc;
  let orderCol;
  switch (sort) {
    case "name": orderCol = orderDir(cardsTable.name); break;
    case "purchase_price": orderCol = orderDir(sql`${cardsTable.purchasePrice}::numeric`); break;
    case "market_value": orderCol = orderDir(sql`${cardsTable.marketValue}::numeric`); break;
    default: orderCol = desc(cardsTable.createdAt);
  }

  const cards = await db
    .select()
    .from(cardsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderCol);

  res.json(cards.map((c) => cardToResponse(c)));
});

router.post("/cards", async (req, res): Promise<void> => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, set_name, card_number, condition, purchase_price, market_value, percent_paid, tcgplayer_url, ebay_url, image_url, notes } = parsed.data;

  const shortCode = nanoid(8);

  const [card] = await db.insert(cardsTable).values({
    name,
    setName: set_name,
    cardNumber: card_number,
    condition: condition ?? "near_mint",
    status: "in_collection",
    purchasePrice: String(purchase_price),
    marketValue: market_value != null ? String(market_value) : null,
    percentPaid: percent_paid != null ? String(percent_paid) : null,
    tcgplayerUrl: tcgplayer_url,
    ebayUrl: ebay_url,
    shortCode,
    imageUrl: image_url,
    notes,
  }).returning();

  await db.insert(activityLogTable).values({
    type: "added",
    cardId: card.id,
    cardName: card.name,
    amount: String(purchase_price),
  });

  if (market_value != null) {
    await db.insert(priceHistoryTable).values({
      cardId: card.id,
      price: String(market_value),
      source: "manual",
    });
  }

  res.status(201).json(cardToResponse(card));
});

router.get("/cards/:id", async (req, res): Promise<void> => {
  const params = GetCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, params.data.id));
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  let tagUid: string | null = null;
  if (card.nfcTagId != null) {
    const [tag] = await db.select({ tagUid: nfcTagsTable.tagUid }).from(nfcTagsTable).where(eq(nfcTagsTable.id, card.nfcTagId));
    tagUid = tag?.tagUid ?? null;
  }

  res.json(cardToResponse(card, tagUid));
});

router.patch("/cards/:id", async (req, res): Promise<void> => {
  const params = UpdateCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, set_name, card_number, condition, status, purchase_price, market_value, sold_price, percent_paid, tcgplayer_url, ebay_url, image_url, notes } = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (name != null) updateData.name = name;
  if (set_name != null) updateData.setName = set_name;
  if (card_number != null) updateData.cardNumber = card_number;
  if (condition != null) updateData.condition = condition;
  if (status != null) updateData.status = status;
  if (purchase_price != null) updateData.purchasePrice = String(purchase_price);
  if (market_value != null) {
    updateData.marketValue = String(market_value);
    await db.insert(priceHistoryTable).values({
      cardId: params.data.id,
      price: String(market_value),
      source: "manual",
    });
    await db.insert(activityLogTable).values({
      type: "price_updated",
      cardId: params.data.id,
      cardName: name ?? "Card",
      amount: String(market_value),
    });
  }
  if (sold_price != null) {
    updateData.soldPrice = String(sold_price);
    if (status == null) updateData.status = "sold";
  }
  if (percent_paid != null) updateData.percentPaid = String(percent_paid);
  if (tcgplayer_url != null) updateData.tcgplayerUrl = tcgplayer_url;
  if (ebay_url != null) updateData.ebayUrl = ebay_url;
  if (image_url != null) updateData.imageUrl = image_url;
  if (notes != null) updateData.notes = notes;

  const [card] = await db
    .update(cardsTable)
    .set(updateData)
    .where(eq(cardsTable.id, params.data.id))
    .returning();

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  res.json(cardToResponse(card));
});

router.delete("/cards/:id", async (req, res): Promise<void> => {
  const params = DeleteCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [card] = await db
    .delete(cardsTable)
    .where(eq(cardsTable.id, params.data.id))
    .returning();

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/cards/:id/mark-sold", async (req, res): Promise<void> => {
  const params = MarkCardSoldParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = MarkCardSoldBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [card] = await db
    .update(cardsTable)
    .set({ status: "sold", soldPrice: String(parsed.data.sold_price) })
    .where(eq(cardsTable.id, params.data.id))
    .returning();

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "sold",
    cardId: card.id,
    cardName: card.name,
    amount: String(parsed.data.sold_price),
  });

  res.json(cardToResponse(card));
});

// TODO: replace stub bodies with scraper calls when price scraper is built
router.post("/cards/refresh-prices", async (_req, res): Promise<void> => {
  const cards = await db.select({ id: cardsTable.id }).from(cardsTable);
  // Scraper hook-in point: iterate cards and fetch live prices here
  res.json({ refreshed: 0, message: `Scraper not yet connected — ${cards.length} cards queued` });
});

router.post("/cards/:id/refresh-price", async (req, res): Promise<void> => {
  const params = GetCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, params.data.id));
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  // Scraper hook-in point: fetch live price for this card here
  res.json({ refreshed: 0, message: "Scraper not yet connected — price refresh queued" });
});

export default router;
