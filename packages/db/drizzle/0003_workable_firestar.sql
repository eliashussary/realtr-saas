ALTER TABLE "site_revision" DROP CONSTRAINT "site_revision_based_on_revision_fk";
--> statement-breakpoint
DROP INDEX "site_preview_grant_lookup_idx";--> statement-breakpoint
ALTER TABLE "site_revision" ADD CONSTRAINT "site_revision_based_on_revision_fk" FOREIGN KEY ("organization_id","site_id","based_on_revision_id") REFERENCES "public"."site_revision"("organization_id","site_id","id") ON DELETE no action ON UPDATE no action;