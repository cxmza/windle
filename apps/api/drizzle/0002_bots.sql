CREATE TABLE "market_bot_state" (
	"market_id" uuid PRIMARY KEY NOT NULL,
	"x" double precision NOT NULL,
	"mu" double precision NOT NULL,
	"human_x" double precision NOT NULL,
	"stepped_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "bot_volume_micro" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "bot_trade_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "market_bot_state" ADD CONSTRAINT "market_bot_state_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_bot_counters_check" CHECK ("markets"."bot_volume_micro" between 0 and "markets"."volume_micro" and "markets"."bot_trade_count" between 0 and "markets"."trade_count");