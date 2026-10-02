import { describe, expect, it } from "vitest";
import { parseLatestFeedEntry } from "@/lib/feed-parser";

describe("parseLatestFeedEntry", () => {
  it("parses the first item from an RSS 2.0 feed", () => {
    const xml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>v2.1.0 released</title>
    <link>https://example.com/changelog/2-1-0</link>
    <guid>https://example.com/changelog/2-1-0</guid>
    <description><![CDATA[Added dark mode and fixed a login bug.]]></description>
  </item>
  <item>
    <title>v2.0.0 released</title>
    <link>https://example.com/changelog/2-0-0</link>
  </item>
</channel></rss>`;

    const entry = parseLatestFeedEntry(xml);
    expect(entry).toEqual({
      title: "v2.1.0 released",
      summary: "Added dark mode and fixed a login bug.",
      link: "https://example.com/changelog/2-1-0",
      id: "https://example.com/changelog/2-1-0"
    });
  });

  it("parses the first entry from an Atom feed", () => {
    const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <title>Release 3.0</title>
    <id>tag:example.com,2026:release-3.0</id>
    <link href="https://example.com/releases/3.0" />
    <summary>Major performance improvements.</summary>
  </entry>
</feed>`;

    const entry = parseLatestFeedEntry(xml);
    expect(entry).toEqual({
      title: "Release 3.0",
      summary: "Major performance improvements.",
      link: "https://example.com/releases/3.0",
      id: "tag:example.com,2026:release-3.0"
    });
  });

  it("returns null for content with no item or entry", () => {
    expect(parseLatestFeedEntry("<html><body>Not a feed</body></html>")).toBeNull();
  });
});
