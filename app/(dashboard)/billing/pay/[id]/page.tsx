import { QrcodePayClient } from "@/components/billing/QrcodePayClient";


// Server entry — resolves the [id] param (Next 15 params are async) and hands
// the orderId to the client component that polls status and renders the QR.
export default async function PayPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QrcodePayClient orderId={id} />;
}
