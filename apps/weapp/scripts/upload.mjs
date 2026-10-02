/**
 * CI 上传：node scripts/upload.mjs --version 1.0.0 --desc "大赛首发"
 * 前置：
 *  1. mp.weixin.qq.com → 开发管理 → 开发设置 → 小程序代码上传密钥（private.<APPID>.key）放到本目录
 *  2. IP 白名单里加上本机出口 IP（或关闭白名单）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ci from "miniprogram-ci";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const version = arg("version", "0.0.1");
const desc = arg("desc", "");

const projectConfig = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const appid = projectConfig.appid;
if (!appid || appid === "touristappid") {
  console.error("先在 project.config.json 填入真实 AppID");
  process.exit(1);
}
const privateKeyPath = path.join(root, `private.${appid}.key`);
if (!fs.existsSync(privateKeyPath)) {
  console.error(`缺少上传密钥 ${privateKeyPath}（mp 后台 → 开发设置 → 小程序代码上传密钥）`);
  process.exit(1);
}

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath: root,
  privateKeyPath,
  ignores: ["node_modules/**/*"]
});

await ci.upload({
  project,
  version,
  desc,
  setting: { es6: true, minify: true },
  onProgressUpdate: () => {}
});
console.log(`uploaded ${version}`);
