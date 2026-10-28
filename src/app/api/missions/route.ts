import { proxyGameCenterApi } from "@code/api/gameCenterApi";

export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyGameCenterApi(request, "missions");
}

export function PATCH(request: Request) {
  return proxyGameCenterApi(request, "missions");
}