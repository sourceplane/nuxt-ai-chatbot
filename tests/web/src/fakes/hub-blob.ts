// An in-memory stand-in for NuxtHub's `hub:blob` (the R2 bucket behind the
// Worker's BLOB binding), with the two calls server/utils/files.ts makes.
const objects = new Map<string, Blob>();

export const blob = {
  async get(pathname: string): Promise<Blob | null> {
    return objects.get(pathname) ?? null;
  },
  async put(pathname: string, body: Blob): Promise<{ pathname: string }> {
    objects.set(pathname, body);
    return { pathname };
  },
  clear(): void {
    objects.clear();
  },
};
