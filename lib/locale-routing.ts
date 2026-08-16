export function isEnglishPathname(pathname: string): boolean {
  return pathname === "/en" || pathname.startsWith("/en/");
}
