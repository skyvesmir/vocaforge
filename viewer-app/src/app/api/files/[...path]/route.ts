import { open, type FileHandle } from "node:fs/promises";
import { activeRoot, resolveFile } from "@/lib/outdir";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHUNK = 64 * 1024; // 1回に読む量。ファイル全体はメモリに載せない。

type Ctx = { params: Promise<{ path: string[] }> };

type RangeResult =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

function notFound(headOnly: boolean): Response {
  return new Response(headOnly ? null : "Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Range ヘッダー（bytes=a-b / a- / -n）。複数範囲や不正な書式は、無視して全体を返す。 */
function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: "full" };
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m) return { kind: "full" };
  const a = m[1] ?? "";
  const b = m[2] ?? "";
  if (a === "" && b === "") return { kind: "full" };
  if (a === "") {
    const n = Number(b);
    if (!Number.isSafeInteger(n)) return { kind: "full" };
    if (n === 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isSafeInteger(start)) return { kind: "full" };
  let end = size - 1;
  if (b !== "") {
    const e = Number(b);
    if (!Number.isSafeInteger(e) || e < start) return { kind: "full" };
    end = Math.min(e, size - 1);
  }
  if (start >= size) return { kind: "unsatisfiable" };
  return { kind: "partial", start, end };
}

function encodeFilename(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** start〜end を、少しずつ読んで流す。読み終わり・中断のどちらでもファイルを閉じる。 */
function streamRange(fh: FileHandle, start: number, end: number, signal: AbortSignal): ReadableStream<Uint8Array> {
  let pos = start;
  let closed = false;
  const closeHandle = async () => {
    if (closed) return;
    closed = true;
    await fh.close().catch(() => {});
  };
  signal.addEventListener("abort", () => void closeHandle(), { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const remaining = end - pos + 1;
        if (closed || remaining <= 0) {
          await closeHandle();
          controller.close();
          return;
        }
        const buf = new Uint8Array(Math.min(CHUNK, remaining));
        const { bytesRead } = await fh.read(buf, 0, buf.byteLength, pos);
        if (bytesRead <= 0) {
          await closeHandle();
          controller.close();
          return;
        }
        pos += bytesRead;
        controller.enqueue(bytesRead === buf.byteLength ? buf : buf.subarray(0, bytesRead));
        if (pos > end) {
          await closeHandle();
          controller.close();
        }
      } catch (err) {
        await closeHandle();
        try {
          controller.error(err);
        } catch {
          // すでに閉じている
        }
      }
    },
    async cancel() {
      await closeHandle();
    },
  });
}

async function handle(req: Request, ctx: Ctx, headOnly: boolean): Promise<Response> {
  let segments: string[];
  try {
    segments = (await ctx.params).path;
  } catch {
    return notFound(headOnly);
  }
  const { root } = await activeRoot();
  const file = await resolveFile(root, segments);
  if (!file) return notFound(headOnly);

  let fh: FileHandle;
  try {
    fh = await open(file.abs, "r");
  } catch {
    return notFound(headOnly);
  }

  let handedOver = false;
  try {
    const st = await fh.stat();
    if (!st.isFile()) return notFound(headOnly);
    const size = st.size;
    const lastModified = st.mtime.toUTCString();
    const etag = `"${size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;

    const headers = new Headers({
      "Content-Type": file.type,
      "Accept-Ranges": "bytes",
      // no-transform: 途中で圧縮されると Content-Length / Content-Range が合わなくなるため
      "Cache-Control": "no-store, no-transform",
      "Last-Modified": lastModified,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    });
    if (new URL(req.url).searchParams.get("download") === "1") {
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeFilename(file.name)}`);
    }

    // If-Range が今のファイルと合わなければ、Range は無視して全体を返す
    const ifRange = req.headers.get("if-range");
    const rangeHeader = ifRange && ifRange !== etag && ifRange !== lastModified ? null : req.headers.get("range");
    const range = parseRange(rangeHeader, size);

    if (range.kind === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${size}`);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 416, headers });
    }

    const start = range.kind === "partial" ? range.start : 0;
    const end = range.kind === "partial" ? range.end : size - 1;
    const length = end - start + 1;
    const status = range.kind === "partial" ? 206 : 200;
    headers.set("Content-Length", String(length));
    if (range.kind === "partial") headers.set("Content-Range", `bytes ${start}-${end}/${size}`);

    if (headOnly || length <= 0) return new Response(null, { status, headers });

    handedOver = true;
    return new Response(streamRange(fh, start, end, req.signal), { status, headers });
  } catch {
    return notFound(headOnly);
  } finally {
    if (!handedOver) await fh.close().catch(() => {});
  }
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx, false);
}

export async function HEAD(req: Request, ctx: Ctx) {
  return handle(req, ctx, true);
}
