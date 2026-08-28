CREATE TABLE "site_audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"site_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_audit_event" ADD CONSTRAINT "site_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_audit_event" ADD CONSTRAINT "site_audit_event_organization_site_fk" FOREIGN KEY ("organization_id","site_id") REFERENCES "public"."site"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_audit_event_organization_site_created_at_idx" ON "site_audit_event" USING btree ("organization_id","site_id","created_at");