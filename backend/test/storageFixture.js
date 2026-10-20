export function storageFixture() {
  const objects = new Map(),
    buckets = new Map();
  const storage = {
    async getBucket(bucket) {
      return {
        data: { id: bucket, public: buckets.get(bucket) ?? false },
        error: null,
      };
    },
    from(bucket) {
      return {
        async upload(path, buffer) {
          if (objects.has(path)) return { error: new Error("Already exists") };
          objects.set(path, Buffer.from(buffer));
          return { error: null };
        },
        async download(path) {
          if (!objects.has(path)) return { error: new Error("Missing source") };
          return { data: new Blob([objects.get(path)]), error: null };
        },
        async remove(paths) {
          paths.forEach((path) => objects.delete(path));
          return { error: null };
        },
        getPublicUrl(path) {
          if (bucket !== process.env.SUPABASE_PREVIEW_STORAGE_BUCKET)
            throw new Error("Original URLs must never be public");
          return {
            data: {
              publicUrl: `https://storage.example/public/${bucket}/${path}`,
            },
          };
        },
        async createSignedUrl(path, ttl, options) {
          if (!objects.has(path))
            return { error: new Error("Missing original") };
          return {
            data: {
              signedUrl: `https://storage.example/signed/${bucket}/${path}?token=fixture&ttl=${ttl}${options?.download ? "&download=1" : ""}`,
            },
            error: null,
          };
        },
      };
    },
  };
  return { objects, storage, buckets };
}
