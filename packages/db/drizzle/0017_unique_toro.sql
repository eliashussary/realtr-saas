ALTER TABLE "listing" ADD COLUMN "list_price" numeric GENERATED ALWAYS AS (((data ->> 'listPrice')::numeric)) STORED;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "bedrooms" integer GENERATED ALWAYS AS (((data ->> 'bedrooms')::integer)) STORED;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "bathrooms" integer GENERATED ALWAYS AS (((data ->> 'bathrooms')::integer)) STORED;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "property_type" text GENERATED ALWAYS AS ((data ->> 'propertyType')) STORED;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "city" text GENERATED ALWAYS AS ((data #>> '{address,city}')) STORED;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "province" text GENERATED ALWAYS AS ((data #>> '{address,province}')) STORED;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "latitude" double precision GENERATED ALWAYS AS (((data ->> 'latitude')::double precision)) STORED;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "longitude" double precision GENERATED ALWAYS AS (((data ->> 'longitude')::double precision)) STORED;--> statement-breakpoint
CREATE INDEX "listing_org_status_price_idx" ON "listing" USING btree ("organization_id","status","list_price");--> statement-breakpoint
CREATE INDEX "listing_org_status_beds_idx" ON "listing" USING btree ("organization_id","status","bedrooms");--> statement-breakpoint
CREATE INDEX "listing_org_status_baths_idx" ON "listing" USING btree ("organization_id","status","bathrooms");--> statement-breakpoint
CREATE INDEX "listing_org_status_type_idx" ON "listing" USING btree ("organization_id","status","property_type");--> statement-breakpoint
CREATE INDEX "listing_org_status_city_idx" ON "listing" USING btree ("organization_id","status","city");