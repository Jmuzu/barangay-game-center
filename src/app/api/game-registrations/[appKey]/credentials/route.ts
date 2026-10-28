import { proxyGameCenterApi } from "@code/api/gameCenterApi";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ appKey: string }> }) {
  const { appKey } = await context.params;
  return proxyGameCenterApi(request, `game-registrations/${encodeURIComponent(appKey)}/credentials`);
}