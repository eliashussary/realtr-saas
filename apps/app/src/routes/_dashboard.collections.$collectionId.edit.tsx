import type { ListingFilter } from "@realtr/core"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { CollectionForm, type CollectionFormValues } from "../components/collection-form"
import { deleteCollectionFn, getCollectionFn, updateCollectionFn } from "../server/collections"

export const Route = createFileRoute("/_dashboard/collections/$collectionId/edit")({
  loader: ({ params }) => getCollectionFn({ data: { collectionId: params.collectionId } }),
  component: EditCollection,
})

function EditCollection() {
  const router = useRouter()
  const { collectionId } = Route.useParams()
  const data = Route.useLoaderData()
  const [saving, setSaving] = useState(false)

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">
          {data.code === "not_found" ? "Collection not found" : "Not authorized"}
        </h1>
        <Link to="/collections" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to collections
        </Link>
      </main>
    )
  }

  const initial: CollectionFormValues = {
    name: data.collection.name,
    slug: data.collection.slug,
    description: data.collection.description,
    status: data.collection.status,
    rank: data.collection.rank,
    // Stored from a validated ListingFilter, so this cast is safe.
    filter: (data.collection.filter ?? {}) as unknown as ListingFilter,
  }

  const save = async (values: CollectionFormValues) => {
    setSaving(true)
    const res = await updateCollectionFn({
      data: {
        collectionId,
        name: values.name,
        slug: values.slug,
        description: values.description,
        status: values.status,
        rank: values.rank,
        filter: values.filter,
      },
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Saved.")
      await router.invalidate()
    } else if (res.code === "slug_taken") {
      toast.error("That URL slug is already used by another collection.")
    } else if (res.code === "not_found") {
      toast.error("This collection no longer exists.")
    } else {
      toast.error("Could not save the collection.")
    }
  }

  const remove = async () => {
    if (!window.confirm("Delete this collection? This cannot be undone.")) return
    setSaving(true)
    const res = await deleteCollectionFn({ data: { collectionId } })
    setSaving(false)
    if (res.ok) {
      toast.success("Collection deleted.")
      await router.navigate({ to: "/collections" })
    } else {
      toast.error("Could not delete the collection.")
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/collections" className="text-sm text-brand hover:underline">
        ← Collections
      </Link>
      <h1 className="mt-2 font-heading text-3xl font-bold">Edit collection</h1>
      <div className="mt-8">
        <CollectionForm
          initial={initial}
          saving={saving}
          onSave={(v) => void save(v)}
          onDelete={() => void remove()}
        />
      </div>
      <Toaster />
    </main>
  )
}
