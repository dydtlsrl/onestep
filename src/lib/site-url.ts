// 초대 링크에 넣을 사이트 주소. NEXT_PUBLIC_SITE_URL이 있으면 그 값을, 없으면 지금 접속한 주소를 쓴다.
import { headers } from "next/headers";

export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
