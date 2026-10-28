import { proxyGameCenterApi } from "@code/api/gameCenterApi";

export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyGameCenterApi(request, "wallet/share");
}

export function POST(request: Request) {
  return proxyGameCenterApi(request, "wallet/share");
}