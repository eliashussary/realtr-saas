CREATE TABLE "service_area" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"min_lng" double precision NOT NULL,
	"min_lat" double precision NOT NULL,
	"max_lng" double precision NOT NULL,
	"max_lat" double precision NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_area" ADD CONSTRAINT "service_area_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;