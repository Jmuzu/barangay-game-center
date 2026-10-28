import { proxyGameCenterApi } from "@code/api/gameCenterApi";

export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyGameCenterApi(request, "state");
}

export function PUT(request: Request) {
  return proxyGameCenterApi(request, "state");
}

export function DELETE(request: Request) {
  return proxyGameCenterApi(request, "state");
}