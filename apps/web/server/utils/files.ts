import type { UIMessage } from 'ai'
import { blob } from 'hub:blob'

// Where an upload is served back. Vercel Blob gave every file a public URL of
// its own; an R2 object has none, so the Worker serves the bucket's objects at
// /api/files/<pathname> (server/api/files/[...pathname].get.ts), and that is
// the URL the upload hands the browser and the chat stores.
export const FILES_ROUTE = '/api/files/'

export function fileUrl(pathname: string): string {
  return FILES_ROUTE + pathname.split('/').map(encodeURIComponent).join('/')
}

function storedPathname(url: string): string | null {
  if (!url.startsWith(FILES_ROUTE)) return null
  const pathname = url.slice(FILES_ROUTE.length).split('/').map(decodeURIComponent).join('/')
  return pathname && !pathname.split('/').includes('..') ? pathname : null
}

// The model is handed each stored upload as its bytes (a data: URL read from
// R2): a URL on this Worker is one no model provider can fetch, and Workers AI
// fetches nothing. Messages are stored with the /api/files URL unchanged; only
// the copy sent to the model carries the bytes.
export async function inlineStoredFiles(messages: UIMessage[]): Promise<UIMessage[]> {
  return Promise.all(messages.map(async message => ({
    ...message,
    parts: await Promise.all(message.parts.map(async (part) => {
      if (part.type !== 'file') return part
      const pathname = storedPathname(part.url)
      if (!pathname) return part
      const object = await blob.get(pathname)
      if (!object) return part
      const bytes = Buffer.from(await object.arrayBuffer()).toString('base64')
      return { ...part, url: `data:${part.mediaType};base64,${bytes}` }
    }))
  })))
}
