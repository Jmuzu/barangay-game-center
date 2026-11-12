import { proxyGameCenterApi } from "@code/api/gameCenterApi";

export const runtime = "nodejs";

async function registrationPath(context: { params: Promise<{ appKey: string }> }) {
  const { appKey } = await context.params;
  return `game-registrations/${encodeURIComponent(appKey)}`;
}

export async function PUT(request: Request, context: { params: Promise<{ appKey: string }> }) {
  return proxyGameCenterApi(request, await registrationPath(context));
}

export async function DELETE(request: Request, context: { params: Promise<{ appKey: string }> }) {
  return proxyGameCenterApi(request, await registrationPath(context));
}
