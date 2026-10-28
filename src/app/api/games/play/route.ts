import { proxyGameCenterApi } from "@code/api/gameCenterApi";

export const runtime = "nodejs";

export function POST(request: Request) {
  return proxyGameCenterApi(request, "games/play");
}