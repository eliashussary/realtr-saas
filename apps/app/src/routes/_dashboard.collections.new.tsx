import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import {
  CollectionForm,
  type CollectionFormValues,
  emptyCollection,
} from "../components/collection-form"
import { createCollectionFn } from "../server/collections"

export const Route = createFileRoute("/_dashboard/collections/new")({
  component: NewCollection,
})

function NewCollection() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const save = async (values: CollectionFormValues) => {
    setSaving(true)
    const res = await createCollectionFn({
      data: {
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
      toast.success("Collection created.")
      await router.navigate({
        to: "/collections/$collectionId/edit",
        params: { collectionId: res.id },
      })
    } else if (res.code === "slug_taken") {
      toast.error("That URL slug is already used by another collection.")
    } else if (res.code === "forbidden") {
      toast.error("Only owners and admins can manage collections.")
    } else {
      toast.error("Could not create the collection.")
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/collections" className="text-sm text-brand hover:underline">
        ← Collections
      </Link>
      <h1 className="mt-2 font-heading text-3xl font-bold">New collection</h1>
      <div className="mt-8">
        <CollectionForm initial={emptyCollection} saving={saving} onSave={(v) => void save(v)} />
      </div>
      <Toaster />
    </main>
  )
}
