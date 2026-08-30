CREATE TABLE "post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"author_member_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"cover_image_url" text,
	"body_markdown" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"no_index" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_organization_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_member_id_member_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_org_status_published_idx" ON "post" USING btree ("organization_id","status","published_at");