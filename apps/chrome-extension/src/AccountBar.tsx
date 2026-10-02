import { isChinese, useUiLocale } from "./i18n";
import type { ExtensionSession } from "./api";

const say = (zh: string, en: string) => isChinese ? zh : en;

// Labels for every plan id the session endpoint can report (lib/payment/types.ts).
const planLabels: Record<string, [string, string]> = {
  free: ["免费版", "Free"],
  starter: ["入门版", "Starter"],
  pro: ["专业版", "Pro"],
  growth: ["增长版", "Growth"],
  employee: ["数字员工", "Digital employee"],
  starter_v2: ["入门版", "Starter"],
  creator_v2: ["创作者版", "Creator"],
  growth_v2: ["增长版", "Growth"],
  digital_employee_v2: ["数字员工", "Digital employee"]
};

/**
 * Signed-in identity strip: shows WHICH account is connected and its credit
 * balance in plain words. The masthead only keeps language/theme controls;
 * everything about the account lives here so multi-account users can always
 * see who they are operating as.
 */
export function AccountBar({ session, onSignOut, busy }: {
  session: ExtensionSession;
  onSignOut: () => void;
  busy?: boolean;
}) {
  useUiLocale();
  const email = session.accountEmail?.trim() || session.userId || "";
  const identity = email || say("已登录", "Signed in");
  const initial = (email[0] ?? "F").toUpperCase();
  const plan = planLabels[session.plan] ?? planLabels.free;
  return <section className="account-bar" aria-label={say("当前登录账号", "Signed-in account")}>
    <span className="account-avatar" aria-hidden="true">{initial}</span>
    <div className="account-id">
      <strong className="account-email" title={identity}>{identity}</strong>
      <span className="account-meta">
        {say(plan[0], plan[1])}
        <i aria-hidden="true">·</i>
        {say(`积分 ${session.availableCredits.toLocaleString()}`, `${session.availableCredits.toLocaleString()} credits`)}
      </span>
    </div>
    <button className="text-button" type="button" disabled={busy} onClick={onSignOut}>{say("退出", "Sign out")}</button>
  </section>;
}
