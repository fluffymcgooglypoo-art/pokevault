import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  setName: text("set_name"),
  cardNumber: text("card_number"),
  condition: text("condition").notNull().default("near_mint"),
  status: text("status").notNull().default("in_collection"),
  purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }).notNull(),
  marketValue: numeric("market_value", { precision: 10, scale: 2 }),
  soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
  tcgplayerUrl: text("tcgplayer_url"),
  ebayUrl: text("ebay_url"),
  shortCode: text("short_code").unique(),
  nfcTagId: integer("nfc_tag_id"),
  nfcWritten: boolean("nfc_written").notNull().default(false),
  percentPaid: numeric("percent_paid", { precision: 5, scale: 2 }),
  imageUrl: text("image_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCardSchema = createInsertSchema(cardsTable).omit({
  id: true,
  shortCode: true,
  nfcTagId: true,
  nfcWritten: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
