// Turns a pasted URL (YouTube, Vimeo, or a direct video file) into something
// embeddable. Shared between Womb Watch episodes and the dashboard's welcome
// video so there's one place that knows how to do this, not two copies that
// drift apart.
export type Embed = { kind: "youtube" | "vimeo" | "file" | "link"; src: string };

// Normalizes any of our own /api/media/... URLs down to a relative path.
// Some imported posts have this stored as a full https://thedudelaco.com/...
// URL (the bare apex hostname, no "www") rather than a relative path. The
// media route's session/preview cookies are set with domain ".thedudelaco.com"
// so in principle that should reach the apex host fine too — but in practice
// the apex hostname doesn't see the same cookies www does (it's fronted
// differently at the DNS/CDN layer), so an absolute apex URL 401s while an
// identical request from the www page works. Rewriting to a relative path
// sidesteps the mismatch entirely: the browser always requests from
// whatever host the page itself loaded from, which is the host that
// actually has the cookies.
export function toRelativeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, "https://www.thedudelaco.com");
    if (u.pathname.startsWith("/api/media/")) {
      return u.pathname + u.search;
    }
    return url;
  } catch {
    return url;
  }
}

export function getEmbed(url: string | null | undefined): Embed | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu")) {
      const id = u.hostname.includes("youtu.be")
        ? u.pathname.slice(1)
        : u.searchParams.get("v") || u.pathname.split("/").pop() || "";
      if (id) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop() || "";
      if (id) return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` };
    }
    if (/\.(mp4|webm|mov)$/i.test(u.pathname)) {
      return { kind: "file", src: toRelativeMediaUrl(url) as string };
    }
    return { kind: "link", src: url };
  } catch {
    return null;
  }
}
