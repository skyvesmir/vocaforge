import { getManifest } from "@/lib/outdir";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// { demo, files:[{name,size,mtime}], scenes, metrics, versions }
export async function GET() {
  const manifest = await getManifest();
  return Response.json(manifest, { headers: { "Cache-Control": "no-store" } });
}
