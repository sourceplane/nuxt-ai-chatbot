import { blob } from 'hub:blob'

defineRouteMeta({
  openAPI: {
    description: 'Serve an uploaded file from the R2 bucket.',
    tags: ['files']
  }
})

// An upload, served back from R2 (server/utils/files.ts). Like the Vercel
// Blob URLs upstream hands out, these are public: the pathname — the
// uploader's username, the chat id and a random suffix — is the capability.
export default defineEventHandler(async (event) => {
  const pathname = getRouterParam(event, 'pathname', { decode: true })
  if (!pathname || pathname.split('/').includes('..')) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return blob.serve(event, pathname)
})
