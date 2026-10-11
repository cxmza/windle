CREATE TABLE "sessions_audit" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"wallet_address" text,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	CONSTRAINT "sessions_audit_session_hash_key" UNIQUE("session_hash"),
	CONSTRAINT "sessions_audit_method_check" CHECK ("sessions_audit"."method" in ('siws', 'email', 'x', 'google')),
	CONSTRAINT "sessions_audit_session_hash_check" CHECK ("sessions_audit"."session_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_audit_user_agent_check" CHECK (char_length("sessions_audit"."user_agent") <= 512)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"chain" text DEFAULT 'solana' NOT NULL,
	"address" text NOT NULL,
	"user_id" uuid NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_pkey" PRIMARY KEY("chain","address"),
	CONSTRAINT "wallets_chain_check" CHECK ("wallets"."chain" in ('solana')),
	CONSTRAINT "wallets_address_check" CHECK (char_length("wallets"."address") between 32 and 44)
);
--> statement-breakpoint
ALTER TABLE "sessions_audit" ADD CONSTRAINT "sessions_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_audit_user_id_created_at_idx" ON "sessions_audit" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wallets_user_id_idx" ON "wallets" USING btree ("user_id");