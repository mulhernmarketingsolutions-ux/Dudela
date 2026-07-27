// Turns a pasted URL (YouTube, Vimeo, or a direct video file) into something
// embeddable. Shared between Womb Watch episodes and the dashboard's welcome
// video so there's one place that knows how to do this, not two copies that
// drift apart.
export type Embed = { kind: "youtube" | "vimeo" | "file" | "link"; src: string };

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
      return { kind: "file", src: url };
    }
    return { kind: "link", src: url };
  } catch {
    return null;
  }
}
