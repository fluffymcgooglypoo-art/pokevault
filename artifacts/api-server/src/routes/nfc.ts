import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, nfcTagsTable, cardsTable, activityLogTable } from "@workspace/db";
import {
  CheckNfcUrlBody,
  CreateNfcTagBody,
  UpdateNfcTagParams,
  UpdateNfcTagBody,
  ResolveShortLinkParams,
} from "@workspace/api-zod";
import { nanoid } from "nanoid";

const router: IRouter = Router();

// NTAG213 has 144 bytes user memory, but NDEF overhead for a URI record is ~7 bytes
// Safe usable limit for a URL NDEF record: 137 bytes
const NTAG213_MAX_BYTES = 137;

function nfcTagToResponse(tag: typeof nfcTagsTable.$inferSelect) {
  return {
    id: tag.id,
    card_id: tag.cardId,
    tag_uid: tag.tagUid ?? null,
    short_code: tag.shortCode,
    payload_url: tag.payloadUrl ?? null,
    payload_bytes: tag.payloadBytes ?? null,
    written: tag.written,
    written_at: tag.writtenAt ? tag.writtenAt.toISOString() : null,
    created_at: tag.createdAt.toISOString(),
  };
}

router.post("/nfc/check-url", async (req, res): Promise<void> => {
  const parsed = CheckNfcUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;
  const byteLength = Buffer.byteLength(url, "utf8");
  const fits = byteLength <= NTAG213_MAX_BYTES;

  res.json({
    url,
    byte_length: byteLength,
    max_bytes: NTAG213_MAX_BYTES,
    fits,
    short_url_recommended: !fits || byteLength > 100,
    message: fits
      ? byteLength > 100
        ? "URL fits but is large — a short link is recommended."
        : "URL fits on NTAG213."
      : `URL is ${byteLength - NTAG213_MAX_BYTES} bytes too large for NTAG213. Use the generated short link instead.`,
  });
});

router.get("/nfc/tags", async (_req, res): Promise<void> => {
  const tags = await db.select().from(nfcTagsTable).orderBy(nfcTagsTable.createdAt);
  res.json(tags.map(nfcTagToResponse));
});

router.post("/nfc/tags", async (req, res): Promise<void> => {
  const parsed = CreateNfcTagBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { card_id, tag_uid, payload_url } = parsed.data;

  const shortCode = nanoid(8);
  const payloadBytes = payload_url ? Buffer.byteLength(payload_url, "utf8") : null;

  const [tag] = await db.insert(nfcTagsTable).values({
    cardId: card_id,
    tagUid: tag_uid,
    shortCode,
    payloadUrl: payload_url,
    payloadBytes,
  }).returning();

  await db.update(cardsTable)
    .set({ nfcTagId: tag.id, shortCode })
    .where(eq(cardsTable.id, card_id));

  res.status(201).json(nfcTagToResponse(tag));
});

router.patch("/nfc/tags/:tagId", async (req, res): Promise<void> => {
  const params = UpdateNfcTagParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateNfcTagBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { tag_uid, payload_url, written } = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (tag_uid != null) updateData.tagUid = tag_uid;
  if (payload_url != null) {
    updateData.payloadUrl = payload_url;
    updateData.payloadBytes = Buffer.byteLength(payload_url, "utf8");
  }
  if (written != null) {
    updateData.written = written;
    if (written) updateData.writtenAt = new Date();
  }

  const [tag] = await db
    .update(nfcTagsTable)
    .set(updateData)
    .where(eq(nfcTagsTable.id, params.data.tagId))
    .returning();

  if (!tag) {
    res.status(404).json({ error: "NFC tag not found" });
    return;
  }

  if (written) {
    const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, tag.cardId));
    await db.update(cardsTable).set({ nfcWritten: true }).where(eq(cardsTable.id, tag.cardId));
    if (card) {
      await db.insert(activityLogTable).values({
        type: "nfc_written",
        cardId: card.id,
        cardName: card.name,
        amount: null,
      });
    }
  }

  res.json(nfcTagToResponse(tag));
});

router.get("/nfc/resolve/:shortCode", async (req, res): Promise<void> => {
  const params = ResolveShortLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [card] = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.shortCode, params.data.shortCode));

  if (!card) {
    res.status(404).json({ error: "Short link not found" });
    return;
  }

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
    tcgplayer_url: card.tcgplayerUrl ?? null,
    ebay_url: card.ebayUrl ?? null,
    short_code: card.shortCode ?? null,
    nfc_tag_id: card.nfcTagId ?? null,
    nfc_written: card.nfcWritten,
    image_url: card.imageUrl ?? null,
    notes: card.notes ?? null,
    created_at: card.createdAt.toISOString(),
    updated_at: card.updatedAt.toISOString(),
  });
});

export default router;
