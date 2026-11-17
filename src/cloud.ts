import { parseLedger, type Ledger } from "./model.ts";

export const DATA_REPOSITORY = "ivanclaw126-design/daily-cost-data";
export const DATA_BRANCH = "main";
export const DATA_PATH = "ledger.json";
export const TOKEN_KEY = "riyou-shu:github-token:v1";
const API_URL = `https://api.github.com/repos/${DATA_REPOSITORY}/contents/${DATA_PATH}`;
const MAX_BYTES = 900_000;

export interface CloudSnapshot {
  ledger: Ledger;
  revision: string;
}
export function rememberedToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}
function headers(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}
export function encodeLedger(ledger: Ledger): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(parseLedger(ledger), null, 2) + "\n",
  );
  if (bytes.length > MAX_BYTES)
    throw new Error("账本超过 900 KB，请先导出备份并精简付款记录后重试。");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function decodeLedger(content: string): Ledger {
  const binary = atob(content.replace(/\s/g, ""));
  if (binary.length > MAX_BYTES)
    throw new Error("云端账本超过支持的大小，请先在私有仓库中下载备份。");
  return parseLedger(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    ),
  );
}
function requestError(response: Response): Error {
  if (response.status === 401)
    return new Error("GitHub 令牌已失效，请在此设备重新连接。");
  if (response.status === 404)
    return new Error(
      "无法访问私有账本，请确认令牌已授权 daily-cost-data 仓库及 Contents 读写权限。",
    );
  if (response.status === 403 || response.status === 429)
    return new Error(
      response.headers.get("x-ratelimit-remaining") === "0"
        ? "GitHub 请求额度暂时用尽，请稍后重试。"
        : "GitHub 拒绝了请求，请检查令牌的仓库权限或稍后重试。",
    );
  return new Error("GitHub 暂时无法处理账本请求，请保留未保存副本后重试。");
}
export async function readCloud(token: string): Promise<CloudSnapshot> {
  const response = await fetch(`${API_URL}?ref=${DATA_BRANCH}`, {
    headers: headers(token),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw requestError(response);
  const row = await response.json();
  if (
    row.type !== "file" ||
    row.encoding !== "base64" ||
    typeof row.content !== "string" ||
    !/^[a-f0-9]{40}$/.test(row.sha)
  )
    throw new Error(
      "私有仓库中的账本格式无效，请先下载原文件检查，现有文件不会被覆盖。",
    );
  return { ledger: decodeLedger(row.content), revision: row.sha };
}
export class CloudConflict extends Error {
  constructor() {
    super(
      "另一台设备更新了账本。本次修改尚未保存，请先下载未保存副本，再读取最新账本并重试。",
    );
  }
}
export async function writeCloud(
  ledger: Ledger,
  revision: string,
  token: string,
): Promise<CloudSnapshot> {
  const content = encodeLedger(ledger);
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Update personal ledger",
        content,
        sha: revision,
        branch: DATA_BRANCH,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error(
      "云端保存未确认，请先下载未保存副本。网络恢复后读取最新账本，确认是否已经保存。",
    );
  }
  if (response.status === 409 || response.status === 422)
    throw new CloudConflict();
  if (!response.ok) throw requestError(response);
  const result = await response.json();
  if (!/^[a-f0-9]{40}$/.test(result.content?.sha))
    throw new Error("云端未返回有效保存结果，请读取最新账本确认。");
  return { ledger: parseLedger(ledger), revision: result.content.sha };
}
