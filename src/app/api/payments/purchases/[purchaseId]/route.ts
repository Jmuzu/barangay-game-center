import { proxyGameCenterApi } from "@code/api/gameCenterApi";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ purchaseId: string }> }) {
  const { purchaseId } = await context.params;
  return proxyGameCenterApi(request, `payments/purchases/${encodeURIComponent(purchaseId)}`);
}