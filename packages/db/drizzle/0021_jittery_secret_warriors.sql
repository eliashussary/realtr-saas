CREATE TABLE "org_area" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"area_id" text NOT NULL,
	"rank" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_area_org_area_unique" UNIQUE("organization_id","area_id")
);
--> statement-breakpoint
DROP INDEX "area_kind_region_idx";--> statement-breakpoint
ALTER TABLE "area" ADD COLUMN "parent_region" text;--> statement-breakpoint
ALTER TABLE "org_area" ADD CONSTRAINT "org_area_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_area" ADD CONSTRAINT "org_area_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_area_org_rank_idx" ON "org_area" USING btree ("organization_id","rank");--> statement-breakpoint
CREATE INDEX "area_kind_region_idx" ON "area" USING btree ("kind","region","parent_region");