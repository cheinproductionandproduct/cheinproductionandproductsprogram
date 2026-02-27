/**
 * In-memory cache for document by id.
 * When the document detail/edit page remounts (e.g. after tab switch), we can
 * show cached data immediately instead of showing loading.
 */

interface CachedDocument {
  document: any
  assignedUsers?: Record<string, { id: string; fullName?: string; email: string }>
}

const cache = new Map<string, CachedDocument>()

const MAX_CACHE_SIZE = 20

export function getCachedDocument(id: string): CachedDocument | undefined {
  return cache.get(id)
}

export function setCachedDocument(
  id: string,
  document: any,
  assignedUsers?: Record<string, { id: string; fullName?: string; email: string }>
) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(id, { document, assignedUsers })
}

export function clearCachedDocument(id: string) {
  cache.delete(id)
  editCache.delete(id)
}

/** Cache for edit page: document + form fields so remount doesn't show loading */
const editCache = new Map<string, { document: any; fields: any[] }>()
const MAX_EDIT_CACHE = 10

export function getCachedDocumentForEdit(id: string): { document: any; fields: any[] } | undefined {
  return editCache.get(id)
}

export function setCachedDocumentForEdit(id: string, document: any, fields: any[]) {
  if (editCache.size >= MAX_EDIT_CACHE) {
    const firstKey = editCache.keys().next().value
    if (firstKey) editCache.delete(firstKey)
  }
  editCache.set(id, { document, fields })
}
