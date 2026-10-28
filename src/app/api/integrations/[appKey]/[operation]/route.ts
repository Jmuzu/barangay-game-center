import { proxyGameCenterApi } from "@code/api/gameCenterApi";

interface RouteContext {
  params: Promise<{ appKey: string; operation: string }>;
}

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  const { appKey, operation } = await context.params;
  return proxyGameCenterApi(
    request,
    `integrations/${encodeURIComponent(appKey)}/${encodeURIComponent(operation)}`,
    { authenticated: false },
  );
}