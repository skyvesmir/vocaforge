import { activeRoot, getNotes } from "@/lib/outdir";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// NOTES.md の本文（無ければ空文字）
export async function GET() {
  const active = await activeRoot();
  const text = await getNotes(active);
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Demo": active.demo ? "1" : "0",
    },
  });
}
