const rawBaseUrl = process.env.FINFOLD_PLUGIN_BASE_URL?.trim();
if (!rawBaseUrl) {
  console.error("FINFOLD_PLUGIN_BASE_URL is required (for example, https://www.finfold.app).");
  process.exit(1);
}

let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  console.error("FINFOLD_PLUGIN_BASE_URL must be a valid absolute URL.");
  process.exit(1);
}

const isLocal = baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "localhost";
if (!isLocal && baseUrl.protocol !== "https:") {
  console.error("The plugin checker requires HTTPS except for localhost.");
  process.exit(1);
}
if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
  console.error("FINFOLD_PLUGIN_BASE_URL must be an origin without a path, query, or fragment.");
  process.exit(1);
}

const origin = baseUrl.origin;
const expectedResource = process.env.FINFOLD_EXPECT_MCP_RESOURCE?.trim() || `${origin}/mcp`;
const rawExpectedAppOrigin = process.env.FINFOLD_EXPECT_APP_ORIGIN?.trim() || origin;
let expectedAppOrigin;
try {
  const parsedAppOrigin = new URL(rawExpectedAppOrigin);
  if (parsedAppOrigin.pathname !== "/" || parsedAppOrigin.search || parsedAppOrigin.hash) throw new Error();
  expectedAppOrigin = parsedAppOrigin.origin;
} catch {
  console.error("FINFOLD_EXPECT_APP_ORIGIN must be an origin without a path, query, or fragment.");
  process.exit(1);
}
const expectedDomainChallenge = process.env.FINFOLD_EXPECT_OPENAI_CHALLENGE?.trim();
const failures = [];
let passed = 0;

function pass(label) {
  passed += 1;
  console.log(`PASS ${label}`);
}

function expect(condition, label, detail) {
  if (!condition) throw new Error(detail || label);
  pass(label);
}

async function checkGroup(label, check) {
  try {
    await check();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${label}: ${message}`);
    console.error(`FAIL ${label} — ${message}`);
  }
}

async function checkedFetch(pathname, init = {}) {
  const url = new URL(pathname, origin);
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${url.href} request failed: ${message}`);
  }
}

async function readJson(response, label) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${label} returned ${contentType || "no content type"}, expected JSON`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function mcpRequest(id, method, params, headers = {}) {
  const response = await checkedFetch("/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  return { response, payload: await readJson(response, `MCP ${method}`) };
}

await checkGroup("public review pages", async () => {
  for (const pathname of ["/support", "/privacy", "/terms"]) {
    const response = await checkedFetch(pathname);
    expect(response.status === 200, `${pathname} is public`, `received HTTP ${response.status}`);
    expect(
      (response.headers.get("content-type") || "").includes("text/html"),
      `${pathname} returns HTML`
    );
  }
});

let resourceMetadata;
await checkGroup("protected-resource discovery", async () => {
  const response = await checkedFetch("/.well-known/oauth-protected-resource");
  expect(response.status === 200, "protected-resource metadata is public", `received HTTP ${response.status}`);
  resourceMetadata = await readJson(response, "protected-resource metadata");
  expect(resourceMetadata.resource === expectedResource, "resource identifier matches the MCP URL");
  expect(
    Array.isArray(resourceMetadata.authorization_servers) && resourceMetadata.authorization_servers.length > 0,
    "authorization server is advertised"
  );
  for (const issuer of resourceMetadata.authorization_servers) {
    expect(new URL(issuer).protocol === "https:", "authorization server uses HTTPS");
  }
  expect(resourceMetadata.scopes_supported?.includes("openid"), "openid scope is advertised");
  expect(resourceMetadata.resource_documentation === `${expectedAppOrigin}/for-agents`, "resource documentation is public");
  expect(resourceMetadata.resource_policy_uri === `${expectedAppOrigin}/privacy`, "privacy policy is advertised");
  expect(resourceMetadata.resource_tos_uri === `${expectedAppOrigin}/terms`, "terms are advertised");
});

await checkGroup("MCP initialization", async () => {
  const { response, payload } = await mcpRequest(1, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "finfold-plugin-check", version: "1.0.0" }
  });
  expect(response.status === 200, "MCP initialize returns HTTP 200", `received HTTP ${response.status}`);
  expect(payload.result?.serverInfo?.name === "finfold-chatgpt", "MCP server name is stable");
  expect(payload.result?.serverInfo?.version === "1.0.0", "MCP server version is stable");
  expect(payload.result?.capabilities?.tools != null, "MCP tools capability is advertised");
  expect(payload.result?.capabilities?.resources != null, "MCP resources capability is advertised");
  expect(
    typeof payload.result?.instructions === "string" && payload.result.instructions.includes("Never claim"),
    "MCP instructions preserve the publishing boundary"
  );
});

let tools;
await checkGroup("tool metadata", async () => {
  const { response, payload } = await mcpRequest(2, "tools/list", {});
  expect(response.status === 200, "tools/list returns HTTP 200", `received HTTP ${response.status}`);
  tools = payload.result?.tools;
  expect(Array.isArray(tools) && tools.length === 3, "exactly three public tools are exposed");
  expect(
    tools.map((tool) => tool.name).sort().join(",") ===
      "finfold_create_content_kit,finfold_get_content_kit,finfold_list_content_kits",
    "public tool names match the reviewed contract"
  );

  for (const tool of tools) {
    expect(typeof tool.title === "string" && tool.title.length > 0, `${tool.name} has a title`);
    expect(typeof tool.description === "string" && tool.description.length > 0, `${tool.name} has a description`);
    expect(tool.inputSchema?.type === "object", `${tool.name} has an object input schema`);
    expect(tool.outputSchema?.type === "object", `${tool.name} has an output schema`);
    expect(
      Array.isArray(tool.securitySchemes) &&
        tool.securitySchemes.some((scheme) => scheme.type === "oauth2" && scheme.scopes?.includes("openid")),
      `${tool.name} requires openid OAuth`
    );
    expect(
      JSON.stringify(tool._meta?.securitySchemes) === JSON.stringify(tool.securitySchemes),
      `${tool.name} mirrors OAuth schemes for compatible clients`
    );
    expect(tool.annotations?.destructiveHint === false, `${tool.name} is non-destructive`);
    expect(tool.annotations?.openWorldHint === false, `${tool.name} cannot change public systems`);
    expect(tool.annotations?.idempotentHint === true, `${tool.name} is idempotent`);
  }

  const listTool = tools.find((tool) => tool.name === "finfold_list_content_kits");
  const createTool = tools.find((tool) => tool.name === "finfold_create_content_kit");
  const getTool = tools.find((tool) => tool.name === "finfold_get_content_kit");
  for (const tool of [createTool, getTool]) {
    expect(
      tool?._meta?.ui?.resourceUri === "ui://finfold/content-kit-v1.html",
      `${tool?.name} links the reviewed UI resource`
    );
  }
  expect(listTool?._meta?.ui == null, "list tool does not render the single-kit result card");
  expect(listTool?.annotations?.readOnlyHint === true, "list tool is correctly marked read-only");
  expect(createTool?.annotations?.readOnlyHint === false, "create tool is correctly marked as a write");
  expect(getTool?.annotations?.readOnlyHint === true, "get tool is correctly marked read-only");
  expect(listTool?.inputSchema?.properties?.limit?.maximum === 10, "listing is limited to ten summaries");
  expect(
    listTool?.outputSchema?.properties?.kits?.items?.properties?.body == null,
    "listing does not expose full draft bodies"
  );
  expect(createTool?.inputSchema?.properties?.platforms?.maxItems === 3, "creation is limited to three platforms");
  expect(createTool?.inputSchema?.required?.includes("request_id"), "creation requires an idempotency UUID");
  expect(
    /same saved kit without charging again/i.test(createTool?.inputSchema?.properties?.request_id?.description || ""),
    "creation documents replay-safe retries"
  );
});

await checkGroup("self-contained result card", async () => {
  const { response, payload } = await mcpRequest(3, "resources/read", {
    uri: "ui://finfold/content-kit-v1.html"
  });
  expect(response.status === 200, "resources/read returns HTTP 200", `received HTTP ${response.status}`);
  const resource = payload.result?.contents?.[0];
  expect(resource?.uri === "ui://finfold/content-kit-v1.html", "result-card URI matches the tool metadata");
  expect(resource?.mimeType === "text/html;profile=mcp-app", "result card uses the MCP app MIME type");
  expect(typeof resource?.text === "string" && resource.text.length > 100, "result card contains usable HTML");
  expect(
    !/<(?:script|img|link)[^>]+(?:src|href)\s*=\s*["']https?:/i.test(resource.text),
    "result card has no remote resource dependency"
  );
  expect(resource?._meta?.ui?.domain === expectedAppOrigin, "result-card domain matches the configured app origin");
  expect(resource?._meta?.ui?.csp?.connectDomains?.length === 0, "result-card connect CSP is exact and empty");
  expect(resource?._meta?.ui?.csp?.resourceDomains?.length === 0, "result-card resource CSP is exact and empty");
  expect(
    JSON.stringify(resource?._meta?.["openai/widgetCSP"]?.redirect_domains) === JSON.stringify([expectedAppOrigin]),
    "result-card external navigation is allowlisted to Finfold only"
  );
  expect(
    typeof resource?._meta?.["openai/widgetDescription"] === "string" &&
      resource._meta["openai/widgetDescription"].length > 0,
    "result card has a concise host description"
  );
});

await checkGroup("tool-level OAuth challenge", async () => {
  const { response, payload } = await mcpRequest(4, "tools/call", {
    name: "finfold_get_content_kit",
    arguments: { kit_id: "00000000-0000-4000-8000-000000000001" }
  });
  expect(response.status === 200, "unauthenticated tool call returns an MCP result", `received HTTP ${response.status}`);
  expect(payload.result?.isError === true, "unauthenticated tool call is rejected");
  const challenges = payload.result?._meta?.["mcp/www_authenticate"];
  const challenge = Array.isArray(challenges) ? challenges[0] : "";
  expect(challenge.includes("resource_metadata="), "tool challenge advertises resource metadata");
  expect(challenge.includes('scope="openid"'), "tool challenge requests only openid");
  expect(challenge.includes("error="), "tool challenge includes an OAuth error");
  expect(challenge.includes("error_description="), "tool challenge includes a safe error description");
});

await checkGroup("HTTP OAuth challenge", async () => {
  const { response, payload } = await mcpRequest(
    5,
    "tools/list",
    {},
    { authorization: "Bearer finfold-invalid-token" }
  );
  expect(response.status === 401, "invalid Bearer token returns HTTP 401", `received HTTP ${response.status}`);
  const challenge = response.headers.get("www-authenticate") || "";
  expect(challenge.includes("resource_metadata="), "HTTP challenge advertises resource metadata");
  expect(challenge.includes("error="), "HTTP challenge includes an OAuth error");
  expect(challenge.includes("error_description="), "HTTP challenge includes a safe error description");
  expect(payload.error?.code === -32001, "invalid token returns the stable JSON-RPC auth code");
});

await checkGroup("OpenAI domain challenge", async () => {
  const response = await checkedFetch("/.well-known/openai-apps-challenge");
  if (expectedDomainChallenge) {
    expect(response.status === 200, "domain challenge is enabled", `received HTTP ${response.status}`);
    const body = await response.text();
    expect(body === expectedDomainChallenge, "domain challenge matches the portal token");
    return;
  }

  expect(response.status === 404 || response.status === 200, "domain challenge has an expected lifecycle status");
  if (response.status === 200) {
    const body = await response.text();
    expect(body.length > 0 && body.length <= 512 && !/[\r\n{}]/.test(body), "domain challenge returns one plaintext token");
  } else {
    expect(
      response.headers.get("cache-control")?.includes("no-store"),
      "unconfigured domain challenge is not cached"
    );
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} plugin check group(s) failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\n${passed}/${passed} ChatGPT plugin checks passed for ${origin}.`);
