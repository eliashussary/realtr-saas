CREATE TABLE "site_document_state" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"draft_document" jsonb NOT NULL,
	"draft_schema_version" integer NOT NULL,
	"draft_version" bigint DEFAULT 1 NOT NULL,
	"draft_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draft_updated_by_user_id" text,
	"published_revision_id" uuid,
	"published_revision_kind" text DEFAULT 'published' NOT NULL,
	"next_publication_number" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_document_state_organization_site_unique" UNIQUE("organization_id","site_id"),
	CONSTRAINT "site_document_state_published_kind_check" CHECK ("site_document_state"."published_revision_kind" = 'published')
);
--> statement-breakpoint
CREATE TABLE "site_preview_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"revision_id" uuid NOT NULL,
	"revision_kind" text DEFAULT 'preview' NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "site_preview_grant_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "site_preview_grant_revision_kind_check" CHECK ("site_preview_grant"."revision_kind" = 'preview'),
	CONSTRAINT "site_preview_grant_expiry_check" CHECK ("site_preview_grant"."expires_at" > "site_preview_grant"."created_at")
);
--> statement-breakpoint
CREATE TABLE "site_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"document" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"source_draft_version" bigint NOT NULL,
	"publication_number" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"actor_type" text NOT NULL,
	"reason" text,
	"based_on_revision_id" uuid,
	CONSTRAINT "site_revision_organization_site_id_unique" UNIQUE("organization_id","site_id","id"),
	CONSTRAINT "site_revision_organization_site_id_kind_unique" UNIQUE("organization_id","site_id","id","kind"),
	CONSTRAINT "site_revision_site_publication_number_unique" UNIQUE("site_id","publication_number"),
	CONSTRAINT "site_revision_kind_check" CHECK ("site_revision"."kind" in ('preview', 'published')),
	CONSTRAINT "site_revision_publication_number_check" CHECK (("site_revision"."kind" = 'published') = ("site_revision"."publication_number" is not null)),
	CONSTRAINT "site_revision_actor_type_check" CHECK ("site_revision"."actor_type" in ('user', 'migration', 'system'))
);
--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "site_document_state" ADD CONSTRAINT "site_document_state_draft_updated_by_user_id_user_id_fk" FOREIGN KEY ("draft_updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_document_state" ADD CONSTRAINT "site_document_state_organization_site_fk" FOREIGN KEY ("organization_id","site_id") REFERENCES "public"."site"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_document_state" ADD CONSTRAINT "site_document_state_published_revision_fk" FOREIGN KEY ("organization_id","site_id","published_revision_id","published_revision_kind") REFERENCES "public"."site_revision"("organization_id","site_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_preview_grant" ADD CONSTRAINT "site_preview_grant_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_preview_grant" ADD CONSTRAINT "site_preview_grant_revision_fk" FOREIGN KEY ("organization_id","site_id","revision_id","revision_kind") REFERENCES "public"."site_revision"("organization_id","site_id","id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_revision" ADD CONSTRAINT "site_revision_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_revision" ADD CONSTRAINT "site_revision_organization_site_fk" FOREIGN KEY ("organization_id","site_id") REFERENCES "public"."site"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_revision" ADD CONSTRAINT "site_revision_based_on_revision_fk" FOREIGN KEY ("based_on_revision_id") REFERENCES "public"."site_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_preview_grant_lookup_idx" ON "site_preview_grant" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "site_preview_grant_expiry_idx" ON "site_preview_grant" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "site_revision_organization_site_created_at_idx" ON "site_revision" USING btree ("organization_id","site_id","created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION backfill_legacy_site_documents()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
	legacy_site record;
	page_entry record;
	source_pages jsonb;
	document_theme jsonb;
	document_pages jsonb;
	document_navigation jsonb;
	document_value jsonb;
	page_id uuid;
	page_slug text;
	page_title text;
	revision_id uuid;
	backfilled integer := 0;
BEGIN
	FOR legacy_site IN
		SELECT s.*
		FROM site s
		LEFT JOIN site_document_state state ON state.site_id = s.id
		WHERE state.site_id IS NULL
		ORDER BY s.created_at, s.id
	LOOP
		IF legacy_site.template_id <> 'modern' THEN
			RAISE EXCEPTION 'unsupported legacy template for site %', legacy_site.id
				USING ERRCODE = '22023';
		END IF;
		source_pages := CASE
			WHEN jsonb_typeof(legacy_site.pages) = 'object' AND legacy_site.pages <> '{}'::jsonb
				THEN legacy_site.pages
			ELSE jsonb_build_object(
				'/',
				jsonb_build_object(
					'root', jsonb_build_object('props', jsonb_build_object('title', legacy_site.name)),
					'content', jsonb_build_array(),
					'zones', jsonb_build_object()
				)
			)
		END;
		document_theme := CASE
			WHEN jsonb_typeof(legacy_site.theme) = 'object' AND legacy_site.theme <> '{}'::jsonb
				THEN legacy_site.theme
			ELSE jsonb_build_object(
				'colors', jsonb_build_object(
					'brand', 'oklch(0.55 0.2 255)',
					'accent', 'oklch(0.75 0.17 70)',
					'background', 'oklch(1 0 0)',
					'foreground', 'oklch(0.2 0.02 260)',
					'muted', 'oklch(0.55 0.02 260)'
				),
				'fonts', jsonb_build_object(
					'heading', '''Georgia'', ui-serif, serif',
					'body', 'ui-sans-serif, system-ui, sans-serif'
				),
				'radius', '0.75rem'
			)
		END;
		document_pages := '[]'::jsonb;
		document_navigation := '[]'::jsonb;

		FOR page_entry IN SELECT key, value FROM jsonb_each(source_pages) ORDER BY key
		LOOP
			page_id := gen_random_uuid();
			page_slug := lower(trim(both '/' from page_entry.key));
			IF page_slug <> '' AND page_slug !~ '^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)*$' THEN
				RAISE EXCEPTION 'unsupported legacy page route % for site %', page_entry.key, legacy_site.id
					USING ERRCODE = '22023';
			END IF;
			page_title := coalesce(
				nullif(trim(page_entry.value #>> '{root,props,title}'), ''),
				CASE WHEN page_slug = '' THEN 'Home' ELSE initcap(replace(page_slug, '-', ' ')) END
			);
			document_pages := document_pages || jsonb_build_array(jsonb_build_object(
				'id', page_id,
				'slug', page_slug,
				'title', page_title,
				'status', 'active',
				'seo', jsonb_build_object(),
				'puck', page_entry.value
			));
			document_navigation := document_navigation || jsonb_build_array(jsonb_build_object(
				'id', gen_random_uuid(),
				'label', page_title,
				'pageId', page_id,
				'children', jsonb_build_array()
			));
		END LOOP;

		document_value := jsonb_build_object(
			'schemaVersion', 1,
			'template', jsonb_build_object('id', legacy_site.template_id, 'schemaVersion', 1),
			'settings', jsonb_build_object(
				'siteTitle', legacy_site.name,
				'contact', jsonb_build_object(),
				'socialLinks', jsonb_build_array()
			),
			'theme', document_theme,
			'navigation', document_navigation,
			'pages', document_pages,
			'redirects', jsonb_build_array()
		);

		INSERT INTO site_document_state (
			site_id, organization_id, draft_document, draft_schema_version, draft_version,
			next_publication_number, draft_updated_at, created_at, updated_at
		) VALUES (
			legacy_site.id, legacy_site.organization_id, document_value, 1, 1, 1,
			legacy_site.updated_at AT TIME ZONE 'UTC', legacy_site.created_at AT TIME ZONE 'UTC', now()
		) ON CONFLICT (site_id) DO NOTHING;

		INSERT INTO site_revision (
			site_id, organization_id, kind, document, schema_version, source_draft_version,
			publication_number, actor_type, reason, created_at
		)
		SELECT state.site_id, state.organization_id, 'published', state.draft_document,
			state.draft_schema_version, state.draft_version, 1, 'migration',
			'Legacy site migration', state.created_at
		FROM site_document_state state
		WHERE state.site_id = legacy_site.id
		ON CONFLICT (site_id, publication_number) DO NOTHING;

		SELECT id INTO revision_id
		FROM site_revision
		WHERE site_id = legacy_site.id AND publication_number = 1;

		UPDATE site_document_state
		SET published_revision_id = revision_id,
			next_publication_number = greatest(next_publication_number, 2),
			updated_at = now()
		WHERE site_id = legacy_site.id AND published_revision_id IS NULL;

		backfilled := backfilled + 1;
	END LOOP;

	RETURN backfilled;
END;
$$;--> statement-breakpoint
SELECT backfill_legacy_site_documents();--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_site_revision_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'site revisions are immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER site_revision_immutable
BEFORE UPDATE ON site_revision
FOR EACH ROW EXECUTE FUNCTION reject_site_revision_update();
