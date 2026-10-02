/**
 * ICP / 公安备案号展示（仅国内站 www.finfold.cn 构建时生效）。
 *
 * 《非经营性互联网信息服务备案管理办法》要求备案号标注在网站页面
 * 底部并链接至工信部备案系统；部分省份管局还要求展示公安备案号。
 * 两个号码都通过 NEXT_PUBLIC_ 构建变量注入：Cloudflare 上的
 * www.finfold.app 构建不设置它们，组件渲染为空，行为不变。
 */
const MIIT_BEIAN_URL = "https://beian.miit.gov.cn/";

function gonganQueryUrl(gonganNumber: string): string {
  const code = gonganNumber.match(/\d{8,}/)?.[0] ?? "";
  return code
    ? `https://beian.mps.gov.cn/#/query/webSearch?code=${code}`
    : "https://beian.mps.gov.cn/";
}

export function BeianNotice({ className = "" }: { className?: string }) {
  const icpNumber = process.env.NEXT_PUBLIC_ICP_BEIAN_NUMBER;
  const gonganNumber = process.env.NEXT_PUBLIC_GONGAN_BEIAN_NUMBER;
  if (!icpNumber && !gonganNumber) return null;

  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {icpNumber ? (
        <a
          href={MIIT_BEIAN_URL}
          target="_blank"
          rel="noopener"
          className="focus-ring rounded transition-colors hover:text-fg"
        >
          {icpNumber}
        </a>
      ) : null}
      {gonganNumber ? (
        <a
          href={gonganQueryUrl(gonganNumber)}
          target="_blank"
          rel="noopener"
          className="focus-ring rounded transition-colors hover:text-fg"
        >
          {gonganNumber}
        </a>
      ) : null}
    </p>
  );
}
