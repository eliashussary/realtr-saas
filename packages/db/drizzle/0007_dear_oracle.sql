CREATE TABLE "listing_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"upserted" integer DEFAULT 0 NOT NULL,
	"removed" integer DEFAULT 0 NOT NULL,
	"checkpoint" text,
	"error" text,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"checkpoint" text,
	"last_reconciled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_sync_state_org_provider_unique" UNIQUE("organization_id","provider")
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "source_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "source_modified_at" timestamp;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "listing_sync_run" ADD CONSTRAINT "listing_sync_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sync_state" ADD CONSTRAINT "listing_sync_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_sync_run_org_provider_created_idx" ON "listing_sync_run" USING btree ("organization_id","provider","created_at");--> statement-breakpoint
CREATE INDEX "listing_org_source_source_key_idx" ON "listing" USING btree ("organization_id","source","source_key");