CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"transaction_id" text NOT NULL,
	"offer" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_url" text,
	"payment_method" text,
	"operator_message" text,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_hash" text,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"preferences" jsonb DEFAULT '{"genres":[],"videoTypes":[]}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{"language":"system","defaultFormat":null,"exportQuality":"1080p","downloadNetwork":"wifi","notifications":{"videoReady":true,"tips":true,"offers":false}}'::jsonb NOT NULL,
	"avatar" jsonb,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token_hash" text,
	"email_verification_expires" timestamp with time zone,
	"password_reset_token_hash" text,
	"password_reset_expires" timestamp with time zone,
	"password_reset_attempts" integer DEFAULT 0 NOT NULL,
	"password_changed_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"lock_until" timestamp with time zone,
	"subscription_plan" text DEFAULT 'free' NOT NULL,
	"subscription_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"style" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"aspect_ratio" text DEFAULT '9:16' NOT NULL,
	"voice" text DEFAULT 'feminine' NOT NULL,
	"music" text DEFAULT 'douce' NOT NULL,
	"brand" text,
	"key_message" text,
	"call_to_action" text,
	"audience" text,
	"characters" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'fr' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb DEFAULT '{"step":0,"total":4}'::jsonb NOT NULL,
	"scenes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"narration" text,
	"description" text,
	"output" jsonb,
	"thumbnail" jsonb,
	"output_duration_seconds" real,
	"error" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"providers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_user_created_at_idx" ON "payments" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_email_verification_token_idx" ON "users" USING btree ("email_verification_token_hash");--> statement-breakpoint
CREATE INDEX "videos_user_created_at_idx" ON "videos" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "videos_user_type_created_at_idx" ON "videos" USING btree ("user_id","type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "videos_updated_at_idx" ON "videos" USING btree ("updated_at" DESC NULLS LAST);