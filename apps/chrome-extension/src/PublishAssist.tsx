import { useCallback, useEffect, useState } from "react";
import { fetchGrowthTasks, reportGrowthTaskOutcome, type GrowthPublishTask } from "./api";
import { isChinese, useUiLocale } from "./i18n";

const COPY = {
  heading: ["发布助手", "Publish assistant"],
  hint: [
    "这是你在 Finfold 网页端批准的实验变体。复制草稿去小红书发布，完成后贴回帖子链接；链接只会记为「用户报告」证据。",
    "These are the experiment variants you approved on the Finfold website. Copy a draft, publish it on Xiaohongshu, then paste the post link back. The link is recorded as user-reported evidence only."
  ],
  variant: ["变体", "Variant"],
  completed: ["已提交证据", "Evidence submitted"],
  copyDraft: ["复制正文", "Copy body"],
  copied: ["已复制", "Copied"],
  openPublisher: ["打开发布页", "Open publish page"],
  trackingLabel: ["追踪链接（放进正文或评论区）", "Tracking link (put it in the post or comments)"],
  linkPlaceholder: ["贴入小红书帖子链接", "Paste the Xiaohongshu post link"],
  submitLink: ["提交发布证据", "Submit publication evidence"],
  submitFailed: ["标记失败", "Mark as failed"],
  submitted: ["已记录", "Recorded"],
  errorPrefix: ["出错了：", "Error: "]
} as const;

function say(key: keyof typeof COPY): string {
  const [zh, en] = COPY[key];
  return isChinese ? zh : en;
}

const PUBLISHER_URL = "https://creator.xiaohongshu.com/publish/publish";

export function PublishAssist() {
  useUiLocale();
  const [tasks, setTasks] = useState<GrowthPublishTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await fetchGrowthTasks();
      setTasks(data.featureEnabled ? data.tasks : []);
      setError(null);
    } catch (cause) {
      // 401/403 and network problems all collapse to "hidden" — the panel
      // must never block the rest of the side panel.
      const code = cause instanceof Error ? cause.message : "";
      if (code !== "UNAUTHENTICATED" && code !== "LOGIN_REQUIRED") {
        setTasks([]);
        setError(cause instanceof Error ? cause.message : "failed");
      } else {
        setTasks([]);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (tasks === null) return null;
  if (tasks.length === 0 && !error) return null;

  async function submit(task: GrowthPublishTask, outcome: "completed" | "failed") {
    const evidenceUrl = outcome === "completed" ? (links[task.taskId] ?? "").trim() : undefined;
    if (outcome === "completed" && !/^https:\/\/([a-z0-9-]+\.)*xiaohongshu\.com\//.test(evidenceUrl ?? "")) {
      setError(isChinese ? "请贴入小红书帖子链接" : "Paste a Xiaohongshu post link first");
      return;
    }
    try {
      await reportGrowthTaskOutcome({ taskId: task.taskId, outcome, evidenceUrl });
      setNotes((prev) => ({ ...prev, [task.taskId]: "done" }));
      setError(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    }
  }

  async function copyText(value: string, taskId: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotes((prev) => ({ ...prev, [`${taskId}:copy`]: "done" }));
    } catch {
      setError(isChinese ? "复制失败，请手动选择复制" : "Copy failed; select and copy manually");
    }
  }

  return (
    <section className="source-card" style={{ marginTop: 12 }}>
      <div className="source-meta">
        <span>{say("heading")}</span>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.75, margin: "6px 0 10px" }}>{say("hint")}</p>
      {tasks.map((task) => (
        <article
          key={task.taskId}
          style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10, marginBottom: 10 }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>
              {say("variant")} {task.variantKey}
            </strong>
            {task.status === "completed" ? (
              <span style={{ fontSize: 11, opacity: 0.7 }}>✓ {say("completed")}</span>
            ) : null}
          </div>
          {task.draft ? (
            <>
              <p style={{ fontWeight: 600, margin: "8px 0 4px" }}>{task.draft.title}</p>
              <p style={{ fontSize: 12, whiteSpace: "pre-wrap", opacity: 0.85, margin: 0 }}>
                {task.draft.body.slice(0, 400)}
                {task.draft.body.length > 400 ? "…" : ""}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="text-button" onClick={() => void copyText(task.draft!.body, task.taskId)}>
                  {notes[`${task.taskId}:copy`] === "done" ? say("copied") : say("copyDraft")}
                </button>
                <button className="text-button" onClick={() => void chrome.tabs.create({ url: PUBLISHER_URL })}>
                  {say("openPublisher")}
                </button>
              </div>
            </>
          ) : null}
          {task.trackingUrl ? (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <div style={{ opacity: 0.7, marginBottom: 2 }}>{say("trackingLabel")}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ wordBreak: "break-all", fontSize: 10 }}>{task.trackingUrl}</code>
                <button className="text-button" onClick={() => void copyText(task.trackingUrl!, `${task.taskId}:link`)}>
                  {notes[`${task.taskId}:link`] === "done" ? say("copied") : say("copyDraft")}
                </button>
              </div>
            </div>
          ) : null}
          {task.status !== "completed" ? (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input
                style={{ flex: 1, minWidth: 160 }}
                type="url"
                placeholder={say("linkPlaceholder")}
                value={links[task.taskId] ?? ""}
                onChange={(event) => setLinks((prev) => ({ ...prev, [task.taskId]: event.target.value }))}
              />
              <button className="primary" onClick={() => void submit(task, "completed")}>
                {notes[task.taskId] === "done" ? say("submitted") : say("submitLink")}
              </button>
              <button className="text-button" onClick={() => void submit(task, "failed")}>
                {say("submitFailed")}
              </button>
            </div>
          ) : task.evidenceUrl ? (
            <a style={{ fontSize: 11, wordBreak: "break-all" }} href={task.evidenceUrl} target="_blank" rel="noreferrer">
              {task.evidenceUrl}
            </a>
          ) : null}
        </article>
      ))}
      {error ? <p style={{ fontSize: 12, color: "#c0392b" }}>{say("errorPrefix")}{error}</p> : null}
    </section>
  );
}
