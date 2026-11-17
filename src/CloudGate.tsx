import { useEffect, useState, type ReactNode } from "react";
import {
  DATA_REPOSITORY,
  readCloud,
  rememberedToken,
  TOKEN_KEY,
  type CloudSnapshot,
} from "./cloud";

const TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new?name=%E6%97%A5%E6%9C%89%E6%95%B0%E4%BA%91%E7%AB%AF%E8%B4%A6%E6%9C%AC&target_name=ivanclaw126-design&contents=write&expires_in=90";

export function GithubSyncSettings({
  connected,
  onConnect,
  onDisconnect,
}: {
  connected: boolean;
  onConnect: (token: string, remember: boolean) => Promise<void>;
  onDisconnect: () => void;
}) {
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel settings-panel github-settings">
      <div className="settings-heading">
        <div>
          <h2>GitHub 云端同步</h2>
          <p>所有设备共用一个私人账本，无需注册应用账号。</p>
        </div>
      </div>
      {connected ? (
        <div className="setting-row">
          <div>
            <h3>已连接私有账本</h3>
            <p>本页的修改直接保存到 GitHub。断开仅影响此设备，云端数据保留。</p>
          </div>
          <button className="btn btn-secondary" onClick={onDisconnect}>
            断开此设备
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            if (!token.trim().startsWith("github_pat_")) {
              setError("请使用只授权账本仓库的 GitHub fine-grained 令牌。");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await onConnect(token.trim(), remember);
              setToken("");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "连接失败，请检查网络和令牌。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            在 GitHub 创建 fine-grained 令牌，只选择{" "}
            <a
              href={`https://github.com/${DATA_REPOSITORY}`}
              target="_blank"
              rel="noreferrer"
            >
              daily-cost-data
            </a>{" "}
            私有仓库，并将 Contents 设为 Read and
            write。每台设备首次配置一次即可。
          </p>
          <a
            className="text-button"
            href={TOKEN_URL}
            target="_blank"
            rel="noreferrer"
          >
            创建 GitHub 访问令牌 ↗
          </a>
          <div className="form-grid">
            <label className="full">
              访问令牌
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                disabled={busy}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
              />
            </label>
          </div>
          <label className="remember-token">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(e) => setRemember(e.target.checked)}
            />
            在这台私人设备记住令牌
          </label>
          <p className="muted">
            令牌仅保存在你选择的浏览器内（或本次页面内），用于直接访问
            GitHub，不会上传到网站或写入公开代码。清除浏览器数据后需重新配置，云端账本仍保留。
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "正在连接…" : "连接同一份云端账本"}
          </button>
        </form>
      )}
    </section>
  );
}

export function CloudGate({
  children,
}: {
  children: (
    cloud: CloudSnapshot | undefined,
    token: string,
    connect: (token: string, remember: boolean) => Promise<void>,
    disconnect: () => void,
  ) => ReactNode;
}) {
  const [token, setToken] = useState(rememberedToken);
  const [snapshot, setSnapshot] = useState<CloudSnapshot | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(token));
  // Initial reading starts once per mount; the effect owns cancellation of stale results.
  const [initialToken] = useState(token);
  useInitialRead(initialToken, setSnapshot, setError, setLoading);
  const connect = async (next: string, remember: boolean) => {
    const snapshot = await readCloud(next);
    if (remember) {
      try {
        localStorage.setItem(TOKEN_KEY, next);
      } catch {
        throw new Error("浏览器不允许保存令牌，请取消记住令牌后重试。");
      }
    } else {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* memory-only connection */
      }
    }
    setSnapshot(snapshot);
    setToken(next);
    setError("");
    setLoading(false);
  };
  const disconnect = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      setError("无法清除已保存的令牌，请检查浏览器存储权限后重试。");
      return;
    }
    setToken("");
    setSnapshot(undefined);
    setError("");
    setLoading(false);
  };
  if (token && !snapshot)
    return (
      <main className="cloud-gate">
        <div className="cloud-connect">
          <h1>日有数 · 我的云端账本</h1>
          {loading ? (
            <p role="status">正在从 GitHub 读取你的账本…</p>
          ) : (
            <>
              <p className="form-error" role="alert">
                {error || "暂时无法读取账本，请重试。"}
              </p>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setLoading(true);
                  setError("");
                  try {
                    setSnapshot(await readCloud(token));
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "读取失败，请检查网络。",
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                重新读取
              </button>
              <GithubSyncSettings
                connected={false}
                onConnect={connect}
                onDisconnect={disconnect}
              />
              <button className="text-button" onClick={disconnect}>
                断开同步，查看此浏览器的旧账本
              </button>
            </>
          )}
        </div>
      </main>
    );
  return children(snapshot, token, connect, disconnect);
}

function useInitialRead(
  token: string,
  setSnapshot: (snapshot: CloudSnapshot) => void,
  setError: (error: string) => void,
  setLoading: (loading: boolean) => void,
) {
  useEffect(() => {
    if (!token) return;
    let live = true;
    readCloud(token)
      .then((snapshot) => {
        if (live) setSnapshot(snapshot);
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : "读取失败，请检查网络。");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [token, setSnapshot, setError, setLoading]);
}
