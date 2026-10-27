ALTER TABLE "markets" ADD COLUMN "duration_preset" text;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "buy_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "markets" SET "buy_count" = b."n" FROM (SELECT "market_id", count(*)::int AS "n" FROM "trades" WHERE "action" = 'buy' GROUP BY "market_id") AS b WHERE b."market_id" = "markets"."id";--> statement-breakpoint
CREATE INDEX "trades_market_id_created_at_idx" ON "trades" USING btree ("market_id","created_at");--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_buy_count_check" CHECK ("markets"."buy_count" between 0 and "markets"."trade_count");