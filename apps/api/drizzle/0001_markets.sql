CREATE TABLE "accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance_micro" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_balance_check" CHECK ("accounts"."balance_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "market_resolutions" (
	"market_id" uuid PRIMARY KEY NOT NULL,
	"outcome" text NOT NULL,
	"method" text NOT NULL,
	"resolved_by" uuid,
	"wallet_address" text NOT NULL,
	"note" text,
	"positions" integer NOT NULL,
	"payout_micro" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_resolutions_outcome_check" CHECK ("market_resolutions"."outcome" in ('yes', 'no', 'void')),
	CONSTRAINT "market_resolutions_method_check" CHECK ("market_resolutions"."method" in ('creator', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"tier" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"project" jsonb NOT NULL,
	"statement" text NOT NULL,
	"criteria" text NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"creator_id" uuid NOT NULL,
	"creator_address" text NOT NULL,
	"source_tweet_id" text,
	"source" jsonb,
	"collateral" jsonb,
	"liquidity_b" double precision NOT NULL,
	"q_yes" double precision NOT NULL,
	"q_no" double precision NOT NULL,
	"prob_yes" double precision NOT NULL,
	"open_prob_yes" double precision NOT NULL,
	"volume_micro" bigint DEFAULT 0 NOT NULL,
	"traders" integer DEFAULT 0 NOT NULL,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_method" text,
	"resolution_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_slug_check" CHECK ("markets"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("markets"."slug") <= 80),
	CONSTRAINT "markets_tier_check" CHECK ("markets"."tier" in ('community', 'backed')),
	CONSTRAINT "markets_status_check" CHECK ("markets"."status" in ('open', 'resolved', 'voided')),
	CONSTRAINT "markets_outcome_check" CHECK (("markets"."status" = 'open' and "markets"."outcome" is null and "markets"."resolved_at" is null) or ("markets"."status" = 'resolved' and "markets"."outcome" in ('yes', 'no') and "markets"."resolved_at" is not null) or ("markets"."status" = 'voided' and "markets"."outcome" = 'void' and "markets"."resolved_at" is not null)),
	CONSTRAINT "markets_resolution_method_check" CHECK ("markets"."resolution_method" in ('creator', 'admin')),
	CONSTRAINT "markets_liquidity_check" CHECK ("markets"."liquidity_b" > 0),
	CONSTRAINT "markets_prob_check" CHECK ("markets"."prob_yes" between 0 and 1 and "markets"."open_prob_yes" between 0 and 1),
	CONSTRAINT "markets_counters_check" CHECK ("markets"."volume_micro" >= 0 and "markets"."traders" >= 0 and "markets"."trade_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"yes_shares" double precision DEFAULT 0 NOT NULL,
	"no_shares" double precision DEFAULT 0 NOT NULL,
	"yes_cost_micro" bigint DEFAULT 0 NOT NULL,
	"no_cost_micro" bigint DEFAULT 0 NOT NULL,
	"realized_micro" bigint DEFAULT 0 NOT NULL,
	"payout_micro" bigint,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_pkey" PRIMARY KEY("user_id","market_id"),
	CONSTRAINT "positions_amounts_check" CHECK ("positions"."yes_shares" >= 0 and "positions"."no_shares" >= 0 and "positions"."yes_cost_micro" >= 0 and "positions"."no_cost_micro" >= 0),
	CONSTRAINT "positions_settled_check" CHECK (("positions"."settled_at" is null) = ("positions"."payout_micro" is null))
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"market_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"action" text NOT NULL,
	"side" text NOT NULL,
	"shares" double precision NOT NULL,
	"cost_micro" bigint NOT NULL,
	"price_before" double precision NOT NULL,
	"price_after" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_action_check" CHECK ("trades"."action" in ('buy', 'sell')),
	CONSTRAINT "trades_side_check" CHECK ("trades"."side" in ('yes', 'no')),
	CONSTRAINT "trades_amounts_check" CHECK ("trades"."shares" > 0 and "trades"."cost_micro" >= 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_resolutions" ADD CONSTRAINT "market_resolutions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_resolutions" ADD CONSTRAINT "market_resolutions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "markets_slug_key" ON "markets" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "markets_source_tweet_id_key" ON "markets" USING btree ("source_tweet_id");--> statement-breakpoint
CREATE INDEX "markets_created_at_idx" ON "markets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "markets_status_closes_at_idx" ON "markets" USING btree ("status","closes_at");--> statement-breakpoint
CREATE INDEX "markets_creator_id_idx" ON "markets" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "positions_market_id_idx" ON "positions" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "positions_user_id_updated_at_idx" ON "positions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "trades_market_id_id_idx" ON "trades" USING btree ("market_id","id");--> statement-breakpoint
CREATE INDEX "trades_user_id_id_idx" ON "trades" USING btree ("user_id","id");