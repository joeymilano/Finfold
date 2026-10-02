// SITE_URL 可用环境变量覆盖（国内站提交 www.finfold.cn 的 sitemap 时：
// SITE_URL=https://www.finfold.cn npm run seo:baidu，token 用 .cn 站自己的）。
const SITE_URL = process.env.SITE_URL || "https://www.finfold.app";
const BAIDU_ENDPOINT = "https://data.zz.baidu.com/urls";
const MAX_URLS_PER_REQUEST = 2_000;

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].replaceAll("&amp;", "&").trim()
  );
}

function keepCanonicalSiteUrls(urls) {
  const host = new URL(SITE_URL).hostname;
  return [...new Set(urls)].filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === host && !url.search && !url.hash;
    } catch {
      return false;
    }
  });
}

async function urlsFromSitemap() {
  const response = await fetch(`${SITE_URL}/sitemap.xml`, {
    headers: { "user-agent": "Finfold-BaiduSubmit/1.0" }
  });
  if (!response.ok) {
    throw new Error(`Could not load sitemap: ${response.status} ${response.statusText}`);
  }
  return extractSitemapUrls(await response.text());
}

async function submit(urlList, token, dryRun) {
  if (dryRun) {
    console.log(`Baidu dry run: ${urlList.length} canonical URLs for ${new URL(SITE_URL).hostname}`);
    console.log(urlList.join("\n"));
    return;
  }
  if (!token) {
    throw new Error("BAIDU_SITE_TOKEN is required after the site is verified in Baidu Search Resource Platform.");
  }

  const endpoint = new URL(BAIDU_ENDPOINT);
  endpoint.searchParams.set("site", new URL(SITE_URL).hostname);
  endpoint.searchParams.set("token", token);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: urlList.join("\n")
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const reason = result.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`Baidu rejected the submission: ${reason}`);
  }
  console.log(
    `Baidu accepted ${result.success ?? urlList.length} URLs; daily quota remaining: ${result.remain ?? "unknown"}.`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const softFail = args.includes("--soft-fail");
  const explicitUrls = args.filter((arg) => !arg.startsWith("--"));

  try {
    const discoveredUrls = explicitUrls.length > 0 ? explicitUrls : await urlsFromSitemap();
    const canonicalUrls = keepCanonicalSiteUrls(discoveredUrls);
    if (canonicalUrls.length === 0) {
      throw new Error("No canonical Finfold URLs were found for submission.");
    }
    if (canonicalUrls.length > MAX_URLS_PER_REQUEST) {
      throw new Error(`Found ${canonicalUrls.length} URLs; Baidu accepts at most ${MAX_URLS_PER_REQUEST} per request.`);
    }
    await submit(canonicalUrls, process.env.BAIDU_SITE_TOKEN?.trim(), dryRun);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (softFail) {
      console.warn(`Baidu notification skipped: ${message}`);
      return;
    }
    throw error;
  }
}

await main();
