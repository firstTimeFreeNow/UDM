import type { SharedLink } from "./models.ts";
export type { SharedLink } from "./models.ts";
export function isInternalPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 240 && /^\/UDM\/(?:[a-zA-Z0-9_-]+\/)*$/.test(path) && !path.startsWith("/UDM/s/");
}
export function isResolvedLink(data: unknown): data is {path: string} {
  return !!data && typeof data === "object" && isInternalPath((data as {path: unknown}).path);
}
export function isLinkList(data: unknown): data is {links: SharedLink[]} {
  const links = (data as {links: SharedLink[]})?.links;
  return Array.isArray(links) && links.length <= 200 && links.every(link => link &&
    typeof link.code === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(link.code) &&
    isInternalPath(link.path) && typeof link.active === "boolean" && typeof link.updatedAt === "string");
}
