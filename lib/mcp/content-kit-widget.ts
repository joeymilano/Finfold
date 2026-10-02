export const FINFOLD_CONTENT_KIT_WIDGET_URI = "ui://finfold/content-kit-v1.html";
export const FINFOLD_MCP_APP_MIME = "text/html;profile=mcp-app";

export const FINFOLD_CONTENT_KIT_WIDGET_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; background: transparent; color: #17211b; }
    .card { border: 1px solid rgba(25, 72, 48, .16); border-radius: 18px; padding: 18px; background: linear-gradient(145deg, rgba(246,251,247,.98), rgba(235,247,239,.98)); box-shadow: 0 12px 32px rgba(14,54,32,.08); }
    .eyebrow { margin: 0 0 8px; color: #237449; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h2 { margin: 0; font-size: 20px; line-height: 1.2; }
    .meta { margin: 8px 0 14px; color: #607067; font-size: 13px; }
    .output { padding: 12px 0; border-top: 1px solid rgba(25,72,48,.12); }
    .platform { margin: 0 0 5px; color: #237449; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .title { margin: 0 0 6px; font-size: 15px; font-weight: 750; }
    .body { margin: 0; color: #34463c; font-size: 13px; line-height: 1.55; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    button { appearance: none; border-radius: 10px; border: 1px solid rgba(35,116,73,.28); padding: 9px 12px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; color: #174d31; background: rgba(255,255,255,.72); }
    button.primary { color: #fff; background: #237449; border-color: #237449; }
    .empty { color: #607067; font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      body { color: #eef8f1; }
      .card { background: linear-gradient(145deg, rgba(24,35,29,.98), rgba(19,47,31,.98)); border-color: rgba(137,216,166,.2); }
      .eyebrow, .platform { color: #85d9a5; }
      .meta, .body, .empty { color: #b9c9bf; }
      .output { border-color: rgba(137,216,166,.14); }
      button { color: #dff5e7; background: rgba(255,255,255,.06); border-color: rgba(137,216,166,.3); }
      button.primary { background: #3a9a62; border-color: #3a9a62; }
    }
  </style>
</head>
<body>
  <main class="card" aria-live="polite">
    <p class="eyebrow">Finfold · Saved content kit</p>
    <h2 id="heading">Your platform-native drafts are ready</h2>
    <p class="meta" id="meta">Loading the saved kit…</p>
    <div id="outputs"></div>
    <div class="actions" id="actions"></div>
  </main>
  <script>
    const state = { data: null };
    const text = (tag, className, value) => { const node = document.createElement(tag); node.className = className; node.textContent = String(value || ""); return node; };
    const resultData = (value) => value && typeof value === "object" && value.structuredContent ? value.structuredContent : value;
    function openExternal(url) {
      if (!url) return;
      if (window.openai && typeof window.openai.openExternal === "function") window.openai.openExternal({ href: url });
      else window.open(url, "_blank", "noopener,noreferrer");
    }
    async function copyAll() {
      const data = state.data;
      if (!data || !Array.isArray(data.outputs)) return;
      const value = data.outputs.map((item) => [item.platform, item.title, item.body, item.cta].filter(Boolean).join("\n")).join("\n\n---\n\n");
      await navigator.clipboard.writeText(value);
      const button = document.getElementById("copy-all");
      if (button) button.textContent = "Copied";
    }
    function render(raw) {
      const data = resultData(raw);
      if (!data || !data.kit_id) return;
      state.data = data;
      document.getElementById("heading").textContent = data.title || "Your platform-native drafts are ready";
      const count = Array.isArray(data.outputs) ? data.outputs.length : 0;
      document.getElementById("meta").textContent = count + (count === 1 ? " draft" : " drafts") + " saved in your Finfold workspace.";
      const outputs = document.getElementById("outputs"); outputs.replaceChildren();
      (data.outputs || []).slice(0, 3).forEach((item) => {
        const wrap = document.createElement("section"); wrap.className = "output";
        wrap.append(text("p", "platform", item.platform));
        wrap.append(text("p", "title", item.title));
        wrap.append(text("p", "body", item.body));
        outputs.append(wrap);
      });
      if (!count) outputs.append(text("p", "empty", "Open Finfold to view this saved content kit."));
      const actions = document.getElementById("actions"); actions.replaceChildren();
      const open = text("button", "primary", "Open in Finfold"); open.type = "button"; open.onclick = () => openExternal(data.open_url); actions.append(open);
      if (data.has_brand_memory) {
        const copy = text("button", "", "Copy all"); copy.id = "copy-all"; copy.type = "button"; copy.onclick = copyAll; actions.append(copy);
      } else {
        const personalize = text("button", "", "Personalize future kits"); personalize.type = "button"; personalize.onclick = () => openExternal(data.personalize_url); actions.append(personalize);
      }
    }
    window.addEventListener("message", (event) => {
      if (event.data && event.data.method === "ui/notifications/tool-result") render(event.data.params);
    });
    if (window.openai && window.openai.toolOutput) render(window.openai.toolOutput);
  </script>
</body>
</html>`;
