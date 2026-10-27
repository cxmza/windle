CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"thumbhash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	CONSTRAINT "media_id_check" CHECK ("media"."id" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('market', 'avatar')),
	CONSTRAINT "media_status_check" CHECK ("media"."status" in ('active', 'removed')),
	CONSTRAINT "media_size_check" CHECK ("media"."width" between 1 and 4096 and "media"."height" between 1 and 4096 and "media"."bytes" > 0),
	CONSTRAINT "media_removed_check" CHECK (("media"."status" = 'removed') = ("media"."removed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "media_reports" (
	"media_id" text NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_reports_pkey" PRIMARY KEY("media_id","reporter_id"),
	CONSTRAINT "media_reports_reason_check" CHECK ("media_reports"."reason" in ('csam', 'sexual', 'violence', 'hate', 'impersonation', 'spam', 'copyright', 'other')),
	CONSTRAINT "media_reports_note_check" CHECK (char_length("media_reports"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "media_uploads" (
	"media_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_uploads_pkey" PRIMARY KEY("media_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "image_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_media_id" text;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_reports" ADD CONSTRAINT "media_reports_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_reports" ADD CONSTRAINT "media_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner_id_created_at_idx" ON "media" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "media_status_idx" ON "media" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_reports_created_at_idx" ON "media_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "media_uploads_user_id_idx" ON "media_uploads" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "markets_image_id_idx" ON "markets" USING btree ("image_id");