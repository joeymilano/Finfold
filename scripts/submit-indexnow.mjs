const SITE_URL = process.env.INDEXNOW_SITE_URL ?? "https://www.finfold.app";
// IndexNow requires the key to also be served at `${SITE_URL}/${key}.txt`.
// Generate your own key, host the key file, and export INDEXNOW_KEY before
// running a real submission; --dry-run works without it.
const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10_000;

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
      return url.protocol === "https:" && url.hostname === host;
    } catch {
      return false;
    }
  });
}

async function urlsFromSitemap() {
  const response = await fetch(`${SITE_URL}/sitemap.xml`, {
    headers: { "user-agent": "Finfold-IndexNow/1.0" }
  });
  if (!response.ok) {
    throw new Error(`Could not load sitemap: ${response.status} ${response.statusText}`);
  }
  return extractSitemapUrls(await response.text());
}

async function submit(urlList, dryRun) {
  if (!INDEXNOW_KEY) {
    throw new Error("INDEXNOW_KEY is not set. Generate a key, serve it at `${SITE_URL}/${key}.txt`, then export INDEXNOW_KEY.");
  }
  const payload = {
    host: new URL(SITE_URL).hostname,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList
  };

  if (dryRun) {
    console.log(`IndexNow dry run: ${urlList.length} canonical URLs`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`IndexNow rejected the submission: ${response.status} ${response.statusText}`);
  }
  console.log(`IndexNow accepted ${urlList.length} canonical URLs (${response.status}).`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const softFail = args.includes("--soft-fail");
  const explicitUrls = args.filter((arg) => !arg.startsWith("--"));

  try {
    const discoveredUrls = explicitUrls.length > 0 ? explicitUrls : await urlsFromSitemap();
    const canonicalUrls = keepCanonicalSiteUrls(discoveredUrls);
    if (canonicalUrls.length === 0) throw new Error("No canonical Finfold URLs were found for submission.");
    if (canonicalUrls.length > MAX_URLS_PER_REQUEST) {
      throw new Error(`Sitemap has ${canonicalUrls.length} URLs; split it before submitting to IndexNow.`);
    }
    await submit(canonicalUrls, dryRun);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (softFail) {
      console.warn(`IndexNow notification skipped: ${message}`);
      return;
    }
    throw error;
  }
}

await main();
