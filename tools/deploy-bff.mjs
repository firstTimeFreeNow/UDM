import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
export function validateConfig(env) {
  if (
    !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || "") ||
    !env.CLOUDFLARE_API_TOKEN
  )
    throw Error("CloudflareのアカウントIDとAPIトークンを設定してください。");
  if (!/^[a-f0-9]{64}$/.test(env.UDM_BFF_SHARED_SECRET || ""))
    throw Error(
      "UDM_BFF_SHARED_SECRETには32バイトの乱数を64文字の16進数で設定してください。",
    );
  const url = new URL(env.AF_EXEC_URL || "");
  if (
    url.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error("AF_EXEC_URLに既存のApps Script URLを設定してください。");
}
export async function deployBff(env = process.env, { execute = run } = {}) {
  validateConfig(env);
  const dir = await mkdtemp(join(tmpdir(), "udm-bff-deploy-"));
  try {
    const secrets = join(dir, "secrets.json");
    await writeFile(
      secrets,
      JSON.stringify({ UDM_BFF_SHARED_SECRET: env.UDM_BFF_SHARED_SECRET }),
      { mode: 0o600 },
    );
    const result = await execute(
      process.execPath,
      [
        fileURLToPath(new URL("../apps/bff/node_modules/wrangler/bin/wrangler.js", import.meta.url)),
        "deploy",
        "--config",
        fileURLToPath(new URL("../apps/bff/wrangler.jsonc", import.meta.url)),
        "--var",
        "AF_EXEC_URL:" + env.AF_EXEC_URL,
        "--secrets-file",
        secrets,
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...Object.fromEntries(Object.entries(env).filter(([key]) => !["UDM_BFF_SHARED_SECRET", "CLASPRC_JSON"].includes(key))),
          WRANGLER_SEND_METRICS: "false",
          DEBUG: "",
          NODE_DEBUG: "",
        },
      },
    );
    // Do not echo raw CLI output, which can include deployment environment values.
    const url = result.stdout.match(
      /https:\/\/udm-bff\.[a-z0-9-]+\.workers\.dev/,
    );
    return { deployed: true, url: url?.[0] || null };
  } catch {
    throw Error(
      "BFFのデプロイ完了を確認できませんでした。Cloudflareの権限・設定とデプロイ履歴を確認してください。",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
if (process.argv[1]?.endsWith("/deploy-bff.mjs")) {
  try {
    console.log(JSON.stringify(await deployBff()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
