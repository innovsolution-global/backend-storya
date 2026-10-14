ALTER TABLE "videos" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "videos_published_at_idx" ON "videos" USING btree ("published_at" DESC NULLS LAST);