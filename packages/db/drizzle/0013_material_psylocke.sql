ALTER TABLE "lead" ADD COLUMN "notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "delivery_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "delivery_error" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "crm_external_id" text;--> statement-breakpoint
CREATE INDEX "lead_delivery_idx" ON "lead" USING btree ("delivery_status");