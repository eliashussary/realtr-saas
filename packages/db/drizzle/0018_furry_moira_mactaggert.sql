CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TABLE "area" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'neighbourhood' NOT NULL,
	"region" text,
	"source_id" text,
	"source_name" text,
	"geom" geometry(MultiPolygon,4326) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "geom" geometry(Point,4326) GENERATED ALWAYS AS (st_setsrid(st_makepoint((data ->> 'longitude')::double precision, (data ->> 'latitude')::double precision), 4326)) STORED;--> statement-breakpoint
CREATE INDEX "area_geom_gist" ON "area" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "area_kind_region_idx" ON "area" USING btree ("kind","region");--> statement-breakpoint
CREATE INDEX "listing_geom_gist" ON "listing" USING gist ("geom");