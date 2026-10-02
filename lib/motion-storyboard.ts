import type { VisualStory, VisualStoryPageRole } from "@/lib/visual-story";
import { visualStoryThemes } from "@/lib/visual-story";
import { visualStoryFormats, type VisualStoryFormatId } from "@/lib/visual-story-formats";

export type MotionNode = {
  id: string;
  kind: "text" | "list" | "cta";
  role: VisualStoryPageRole;
  order: number;
  startMs: number;
  durationMs: number;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  emphasis: string;
};

export type MotionEdge = {
  from: string;
  to: string;
  relation: "sequence";
};

export type MotionStoryboard = {
  schemaVersion: 1;
  title: string;
  formatId: VisualStoryFormatId;
  width: number;
  height: number;
  ratio: string;
  theme: VisualStory["theme"];
  artDirection: string;
  totalDurationMs: number;
  nodes: MotionNode[];
  edges: MotionEdge[];
  renderer: {
    contract: "render(input, context)";
    preferred: "html-css";
    compatible: ["html-css", "remotion", "motion-canvas"];
  };
};

export function buildMotionStoryboard(story: VisualStory, formatId: VisualStoryFormatId): MotionStoryboard {
  const format = visualStoryFormats[formatId];
  let cursor = 0;
  const nodes = story.pages.map((page, index): MotionNode => {
    const durationMs = durationForRole(page.role, page.points.length, page.body.length);
    const node: MotionNode = {
      id: page.id,
      kind: page.role === "list" ? "list" : page.role === "cta" ? "cta" : "text",
      role: page.role,
      order: index + 1,
      startMs: cursor,
      durationMs,
      kicker: page.kicker,
      title: page.title,
      body: page.body,
      points: page.points,
      emphasis: page.emphasis
    };
    cursor += durationMs;
    return node;
  });

  return {
    schemaVersion: 1,
    title: story.title,
    formatId,
    width: format.width,
    height: format.height,
    ratio: format.ratio,
    theme: story.theme,
    artDirection: story.artDirection,
    totalDurationMs: cursor,
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      from: nodes[index].id,
      to: node.id,
      relation: "sequence"
    })),
    renderer: {
      contract: "render(input, context)",
      preferred: "html-css",
      compatible: ["html-css", "remotion", "motion-canvas"]
    }
  };
}

export function buildAnimatedStoryHtml(storyboard: MotionStoryboard): string {
  const theme = visualStoryThemes[storyboard.theme];
  const safeData = JSON.stringify(storyboard).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(storyboard.title)} · Motion storyboard</title>
  <style>
    :root{color-scheme:dark;--paper:${theme.paper};--ink:${theme.ink};--muted:${theme.muted};--accent:${theme.accent};--soft:${theme.soft}}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090b10;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
    .shell{width:min(92vw,${Math.min(760, storyboard.width)}px)}.stage{position:relative;width:100%;aspect-ratio:${storyboard.width}/${storyboard.height};overflow:hidden;border-radius:24px;background:var(--paper);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.45)}
    .frame{position:absolute;inset:0;display:flex;flex-direction:column;padding:8%;opacity:0;transform:translateY(18px) scale(.985);pointer-events:none}
    .frame.active{opacity:1;transform:translateY(0) scale(1);transition:opacity .48s ease,transform .65s cubic-bezier(.2,.75,.25,1)}
    .frame.leaving{opacity:0;transform:translateY(-12px) scale(.99);transition:opacity .28s ease,transform .35s ease}
    .kicker{font-size:clamp(10px,1.5vw,16px);font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
    h1{margin:auto 0 0;font-size:clamp(28px,6.2vw,72px);line-height:1.03;letter-spacing:-.05em;max-width:92%}
    p{margin:5% 0 auto;max-width:88%;font-size:clamp(14px,2.2vw,26px);line-height:1.65;color:var(--muted)}
    ul{margin:6% 0 auto;padding:0;display:grid;gap:12px;list-style:none}li{padding:3.2% 4%;border-radius:14px;background:var(--soft);font-size:clamp(13px,2vw,24px);font-weight:720;line-height:1.4}
    .emphasis{margin-top:auto;color:var(--accent);font-weight:850;font-size:clamp(12px,1.8vw,22px)}.counter{position:absolute;right:4%;top:4%;font:700 11px ui-monospace,monospace;color:var(--muted)}
    .progress{height:3px;margin-top:14px;overflow:hidden;border-radius:99px;background:#262a34}.progress>i{display:block;height:100%;width:0;background:var(--accent)}
    .controls{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;color:#dfe3ee;font-size:12px}.controls button{border:1px solid #333947;border-radius:999px;padding:9px 15px;background:#151923;color:#fff;cursor:pointer}.controls button:hover{border-color:#5c6579}.meta{opacity:.65}
    @media (prefers-reduced-motion:reduce){.frame.active,.frame.leaving{transition:none}}
  </style>
</head>
<body>
  <main class="shell">
    <div id="stage" class="stage" aria-live="polite"></div>
    <div class="progress"><i id="progress"></i></div>
    <div class="controls"><button id="toggle" type="button">Pause</button><span class="meta">${storyboard.width}×${storyboard.height} · ${storyboard.ratio} · ${(storyboard.totalDurationMs / 1000).toFixed(1)}s</span></div>
  </main>
  <script>
    const story=${safeData};
    const stage=document.getElementById("stage");
    const progress=document.getElementById("progress");
    const toggle=document.getElementById("toggle");
    let index=0,timer=0,startedAt=Date.now(),elapsed=0,playing=true;
    const esc=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const render=(node)=>{
      stage.innerHTML='<section class="frame active"><span class="counter">'+String(node.order).padStart(2,"0")+'/'+String(story.nodes.length).padStart(2,"0")+'</span><span class="kicker">'+esc(node.kicker)+'</span><h1>'+esc(node.title)+'</h1>'+(node.points.length?'<ul>'+node.points.map(point=>'<li>'+esc(point)+'</li>').join("")+'</ul>':node.body?'<p>'+esc(node.body)+'</p>':"")+(node.emphasis?'<div class="emphasis">'+esc(node.emphasis)+'</div>':"")+'</section>';
      startedAt=Date.now();elapsed=0;progress.style.transition="none";progress.style.width="0";
      requestAnimationFrame(()=>{progress.style.transition='width '+node.durationMs+'ms linear';progress.style.width="100%"});
      timer=window.setTimeout(next,node.durationMs);
    };
    const next=()=>{index=(index+1)%story.nodes.length;render(story.nodes[index])};
    toggle.addEventListener("click",()=>{
      playing=!playing;toggle.textContent=playing?"Pause":"Play";
      if(!playing){window.clearTimeout(timer);elapsed+=Date.now()-startedAt;progress.style.transition="none";progress.style.width=(Math.min(1,elapsed/story.nodes[index].durationMs)*100)+"%"}
      else{const remaining=Math.max(120,story.nodes[index].durationMs-elapsed);startedAt=Date.now();progress.style.transition='width '+remaining+'ms linear';progress.style.width="100%";timer=window.setTimeout(next,remaining)}
    });
    render(story.nodes[0]);
  </script>
</body>
</html>`;
}

function durationForRole(role: VisualStoryPageRole, pointCount: number, bodyLength: number): number {
  if (role === "cover") return 2400;
  if (role === "cta") return 2600;
  if (role === "quote") return 2800;
  if (role === "list") return Math.min(5200, 2600 + pointCount * 520);
  return Math.min(4800, 2800 + Math.ceil(bodyLength / 45) * 380);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
