export const runtime = "edge";

import KitDetailClient from "./KitDetailClient";

export default function KitDetailPage({ params }: { params: Promise<{ kitId: string }> }) {
  return <KitDetailClient params={params} />;
}
