import Viewer from "@/components/Viewer";
import { activeRoot, getManifest, getNotes } from "@/lib/outdir";

// ファイルは起動のあとに置かれるので、リクエストのたびに読む
export const dynamic = "force-dynamic";

export default async function Page() {
  const active = await activeRoot();
  const [manifest, notes] = await Promise.all([getManifest(active), getNotes(active)]);
  return <Viewer initialManifest={manifest} initialNotes={notes} tzOffsetMin={new Date().getTimezoneOffset()} />;
}
