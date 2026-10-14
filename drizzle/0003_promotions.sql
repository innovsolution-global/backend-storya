CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"image" jsonb,
	"cta_label" text,
	"cta_target" text,
	"discount_percent" integer,
	"offer_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trial_days" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "original_amount" integer;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promotions_kind_starts_at_idx" ON "promotions" USING btree ("kind","starts_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;