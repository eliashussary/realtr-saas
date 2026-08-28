-- Retire the legacy theme/pages conversion: the renderer serves versioned revisions, and new
-- sites are created as V1 drafts. This function now seeds a default `modern` document for any site
-- that lacks document state (used by the seed and tests) without reading the dropped columns.
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
		source_pages := jsonb_build_object(
			'/',
			jsonb_build_object(
				'root', jsonb_build_object('props', jsonb_build_object('title', legacy_site.name)),
				'content', jsonb_build_array(),
				'zones', jsonb_build_object()
			)
		);
		document_theme := jsonb_build_object(
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
		);
		document_pages := '[]'::jsonb;
		document_navigation := '[]'::jsonb;

		FOR page_entry IN SELECT key, value FROM jsonb_each(source_pages) ORDER BY key
		LOOP
			page_id := gen_random_uuid();
			page_slug := lower(trim(both '/' from page_entry.key));
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
ALTER TABLE "site" DROP COLUMN "theme";--> statement-breakpoint
ALTER TABLE "site" DROP COLUMN "pages";
