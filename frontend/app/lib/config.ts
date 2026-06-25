export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function getWsUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const wsBase = API_URL.replace(/^http/i, "ws");
  return `${wsBase}${normalizedPath}`;
}
