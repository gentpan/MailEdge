import { useEffect, useRef } from "react";

/**
 * 实时推送：为每个信箱开一条 WebSocket 连到其 Durable Object。
 * 收信/变动时后端广播，前端据此刷新。断线自动指数退避重连，
 * 25 秒心跳保活，多事件在 400ms 内合并成一次刷新。
 */
export function useMailStream(mailboxIds: string[], onEvent: () => void): void {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const key = [...mailboxIds].sort().join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const proto = location.protocol === "https:" ? "wss" : "ws";

    let debounce: number | undefined;
    const emit = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => cb.current(), 400);
    };

    const conns = ids.map((id) => new StreamConn(id, proto, emit));
    return () => {
      window.clearTimeout(debounce);
      for (const conn of conns) conn.close();
    };
  }, [key]);
}

class StreamConn {
  private ws: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private pingTimer?: number;
  private reconnectTimer?: number;

  constructor(
    private readonly id: string,
    private readonly proto: string,
    private readonly onEvent: () => void,
  ) {
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(`${this.proto}://${location.host}/api/mailboxes/${this.id}/stream`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);
    };
    ws.onmessage = (event) => {
      if (event.data !== "pong") this.onEvent();
    };
    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      if (this.closed) return;
      const delay = Math.min(1000 * 2 ** this.attempt++, 30000);
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // onclose 会接手重连
      }
    };
  }

  close(): void {
    this.closed = true;
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close();
    } catch {
      // 已关闭
    }
  }
}
