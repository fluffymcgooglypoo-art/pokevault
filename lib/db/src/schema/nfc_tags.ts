import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nfcTagsTable = pgTable("nfc_tags", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull(),
  tagUid: text("tag_uid"),
  shortCode: text("short_code").notNull().unique(),
  payloadUrl: text("payload_url"),
  payloadBytes: integer("payload_bytes"),
  written: boolean("written").notNull().default(false),
  writtenAt: timestamp("written_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNfcTagSchema = createInsertSchema(nfcTagsTable).omit({
  id: true,
  shortCode: true,
  payloadBytes: true,
  written: true,
  writtenAt: true,
  createdAt: true,
});

export type InsertNfcTag = z.infer<typeof insertNfcTagSchema>;
export type NfcTag = typeof nfcTagsTable.$inferSelect;
