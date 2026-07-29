import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import type {
  FolderStats,
  MailFolder,
  MessageAddress,
  MessageAttachmentView,
  MessageDetail,
  MessageSummary,
} from "../shared/message";

export interface StoreMessageInput {
  id: string;
  internalId?: string | null;
  direction: "inbound" | "outbound";
  folder: MailFolder;
  messageId?: string | null;
  inReplyTo?: string | null;
  threadId?: string | null;
  from: MessageAddress;
  to: MessageAddress[];
  cc?: MessageAddress[];
  bcc?: MessageAddress[];
  replyTo?: MessageAddress | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  size?: number;
  isRead?: boolean;
  status?: string | null;
  provider?: string | null;
  error?: string | null;
  category?: string | null;
  aiSummary?: string | null;
  receivedAt?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    mode: "inline" | "link";
    r2Key: string | null;
    token: string | null;
  }>;
}

/**
 * 一个邮箱地址一个实例，邮件正文存在实例自带的 SQLite 里。
 * 附件二进制不进 SQLite，只存 R2 键或分享 token。
 */
export class MailboxDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  private migrate(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id           TEXT PRIMARY KEY,
        internal_id  TEXT,
        direction    TEXT NOT NULL,
        folder       TEXT NOT NULL DEFAULT 'inbox',
        message_id   TEXT,
        in_reply_to  TEXT,
        thread_id    TEXT,
        from_email   TEXT NOT NULL,
        from_name    TEXT,
        to_json      TEXT NOT NULL DEFAULT '[]',
        cc_json      TEXT NOT NULL DEFAULT '[]',
        bcc_json     TEXT NOT NULL DEFAULT '[]',
        reply_to_json TEXT,
        subject      TEXT NOT NULL DEFAULT '',
        snippet      TEXT NOT NULL DEFAULT '',
        html         TEXT,
        text         TEXT,
        headers_json TEXT NOT NULL DEFAULT '{}',
        size         INTEGER NOT NULL DEFAULT 0,
        is_read      INTEGER NOT NULL DEFAULT 0,
        is_starred   INTEGER NOT NULL DEFAULT 0,
        status       TEXT,
        provider     TEXT,
        error        TEXT,
        category     TEXT,
        ai_summary   TEXT,
        received_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(folder, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_internal ON messages(internal_id);

      CREATE TABLE IF NOT EXISTS attachments (
        id           TEXT PRIMARY KEY,
        message_id   TEXT NOT NULL,
        filename     TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size         INTEGER NOT NULL DEFAULT 0,
        mode         TEXT NOT NULL DEFAULT 'inline',
        r2_key       TEXT,
        token        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
    `);

    // 存量 DO 的补列：category / ai_summary 是后加的，ADD COLUMN 幂等靠 catch 兜住。
    // 必须在依赖这些列的索引之前执行——否则存量表上的 CREATE INDEX 会因列不存在而抛错。
    for (const column of ["category TEXT", "ai_summary TEXT"]) {
      try {
        this.sql.exec(`ALTER TABLE messages ADD COLUMN ${column}`);
      } catch {
        // 列已存在，忽略
      }
    }
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_messages_category ON messages(category)`);
  }

  async store(input: StoreMessageInput): Promise<void> {
    const receivedAt = input.receivedAt ?? new Date().toISOString();
    const snippet = buildSnippet(input.text, input.html);

    this.sql.exec(
      `INSERT OR REPLACE INTO messages
       (id, internal_id, direction, folder, message_id, in_reply_to, thread_id,
        from_email, from_name, to_json, cc_json, bcc_json, reply_to_json,
        subject, snippet, html, text, headers_json, size, is_read, is_starred,
        status, provider, error, category, ai_summary, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               COALESCE((SELECT is_starred FROM messages WHERE id = ?), 0), ?, ?, ?,
               COALESCE(?, (SELECT category FROM messages WHERE id = ?)),
               COALESCE(?, (SELECT ai_summary FROM messages WHERE id = ?)), ?)`,
      input.id,
      input.internalId ?? null,
      input.direction,
      input.folder,
      input.messageId ?? null,
      input.inReplyTo ?? null,
      input.threadId ?? input.messageId ?? input.id,
      input.from.email,
      input.from.name ?? null,
      JSON.stringify(input.to),
      JSON.stringify(input.cc ?? []),
      JSON.stringify(input.bcc ?? []),
      input.replyTo ? JSON.stringify(input.replyTo) : null,
      input.subject,
      snippet,
      input.html ?? null,
      input.text ?? null,
      JSON.stringify(input.headers ?? {}),
      input.size ?? 0,
      input.isRead ? 1 : 0,
      input.id,
      input.status ?? null,
      input.provider ?? null,
      input.error ?? null,
      input.category ?? null,
      input.id,
      input.aiSummary ?? null,
      input.id,
      receivedAt,
    );

    this.sql.exec(`DELETE FROM attachments WHERE message_id = ?`, input.id);
    for (const attachment of input.attachments ?? []) {
      this.sql.exec(
        `INSERT INTO attachments (id, message_id, filename, content_type, size, mode, r2_key, token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        attachment.id,
        input.id,
        attachment.filename,
        attachment.contentType,
        attachment.size,
        attachment.mode,
        attachment.r2Key,
        attachment.token,
      );
    }
  }

  async list(params: {
    folder?: MailFolder;
    category?: string;
    limit?: number;
    before?: string;
    search?: string;
  }): Promise<{ items: MessageSummary[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.folder) {
      conditions.push("folder = ?");
      values.push(params.folder);
    }
    if (params.category) {
      conditions.push("category = ?");
      values.push(params.category);
    }
    if (params.before) {
      conditions.push("received_at < ?");
      values.push(params.before);
    }
    if (params.search) {
      conditions.push("(subject LIKE ? OR snippet LIKE ? OR from_email LIKE ? OR text LIKE ?)");
      const pattern = `%${params.search}%`;
      values.push(pattern, pattern, pattern, pattern);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.sql
      .exec<MessageRow>(
        `SELECT m.*, (SELECT COUNT(*) FROM attachments a WHERE a.message_id = m.id) AS attachment_count
         FROM messages m ${where} ORDER BY received_at DESC LIMIT ?`,
        ...values,
        limit + 1,
      )
      .toArray();

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toSummary);
    return { items, nextCursor: hasMore ? (items.at(-1)?.receivedAt ?? null) : null };
  }

  async get(id: string): Promise<MessageDetail | null> {
    const row = this.sql
      .exec<MessageRow>(
        `SELECT m.*, (SELECT COUNT(*) FROM attachments a WHERE a.message_id = m.id) AS attachment_count
         FROM messages m WHERE id = ?`,
        id,
      )
      .toArray()[0];
    if (!row) return null;

    const attachments = this.sql
      .exec<AttachmentRow>(`SELECT * FROM attachments WHERE message_id = ?`, id)
      .toArray()
      .map(toAttachmentView);

    return {
      ...toSummary(row),
      cc: parseAddresses(row.cc_json),
      bcc: parseAddresses(row.bcc_json),
      replyTo: row.reply_to_json ? (JSON.parse(row.reply_to_json) as MessageAddress) : null,
      html: row.html,
      text: row.text,
      headers: JSON.parse(row.headers_json) as Record<string, string>,
      size: row.size,
      messageId: row.message_id,
      inReplyTo: row.in_reply_to,
      error: row.error,
      aiSummary: row.ai_summary,
      attachments,
    };
  }

  async setCategory(id: string, category: string): Promise<void> {
    this.sql.exec(`UPDATE messages SET category = ? WHERE id = ?`, category, id);
  }

  async setSummary(id: string, summary: string): Promise<void> {
    this.sql.exec(`UPDATE messages SET ai_summary = ? WHERE id = ?`, summary, id);
  }

  async setRead(id: string, isRead: boolean): Promise<void> {
    this.sql.exec(`UPDATE messages SET is_read = ? WHERE id = ?`, isRead ? 1 : 0, id);
  }

  async setStarred(id: string, isStarred: boolean): Promise<void> {
    this.sql.exec(`UPDATE messages SET is_starred = ? WHERE id = ?`, isStarred ? 1 : 0, id);
  }

  async move(id: string, folder: MailFolder): Promise<void> {
    this.sql.exec(`UPDATE messages SET folder = ? WHERE id = ?`, folder, id);
  }

  /** 从回收站彻底删除，返回需要一并清理的 R2 键 */
  async purge(id: string): Promise<string[]> {
    const keys = this.sql
      .exec<{ r2_key: string | null }>(`SELECT r2_key FROM attachments WHERE message_id = ?`, id)
      .toArray()
      .map((row) => row.r2_key)
      .filter((key): key is string => Boolean(key));

    this.sql.exec(`DELETE FROM attachments WHERE message_id = ?`, id);
    this.sql.exec(`DELETE FROM messages WHERE id = ?`, id);
    return keys;
  }

  async stats(): Promise<FolderStats[]> {
    return this.sql
      .exec<{ folder: string; total: number; unread: number }>(
        `SELECT folder, COUNT(*) AS total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread
         FROM messages GROUP BY folder`,
      )
      .toArray()
      .map((row) => ({ folder: row.folder as MailFolder, total: row.total, unread: row.unread ?? 0 }));
  }

  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ filename: string; contentType: string; size: number; r2Key: string | null; token: string | null } | null> {
    const row = this.sql
      .exec<AttachmentRow>(`SELECT * FROM attachments WHERE message_id = ? AND id = ?`, messageId, attachmentId)
      .toArray()[0];
    if (!row) return null;
    return {
      filename: row.filename,
      contentType: row.content_type,
      size: row.size,
      r2Key: row.r2_key,
      token: row.token,
    };
  }

  /** 发信状态变化后同步「已发送」里的那封 */
  async updateOutboundStatus(
    internalId: string,
    patch: { status: string; provider?: string | null; error?: string | null },
  ): Promise<void> {
    this.sql.exec(
      `UPDATE messages SET status = ?, provider = COALESCE(?, provider), error = ? WHERE internal_id = ?`,
      patch.status,
      patch.provider ?? null,
      patch.error ?? null,
      internalId,
    );
  }
}

interface MessageRow extends Record<string, SqlStorageValue> {
  id: string;
  internal_id: string | null;
  direction: string;
  folder: string;
  message_id: string | null;
  in_reply_to: string | null;
  thread_id: string | null;
  from_email: string;
  from_name: string | null;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  reply_to_json: string | null;
  subject: string;
  snippet: string;
  html: string | null;
  text: string | null;
  headers_json: string;
  size: number;
  is_read: number;
  is_starred: number;
  status: string | null;
  provider: string | null;
  error: string | null;
  category: string | null;
  ai_summary: string | null;
  received_at: string;
  attachment_count: number;
}

interface AttachmentRow extends Record<string, SqlStorageValue> {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size: number;
  mode: string;
  r2_key: string | null;
  token: string | null;
}

function toSummary(row: MessageRow): MessageSummary {
  return {
    id: row.id,
    internalId: row.internal_id,
    direction: row.direction as MessageSummary["direction"],
    folder: row.folder as MailFolder,
    subject: row.subject,
    snippet: row.snippet,
    from: { email: row.from_email, name: row.from_name ?? undefined },
    to: parseAddresses(row.to_json),
    isRead: row.is_read === 1,
    isStarred: row.is_starred === 1,
    hasAttachments: row.attachment_count > 0,
    status: row.status,
    provider: row.provider,
    category: (row.category as MessageSummary["category"]) ?? null,
    receivedAt: row.received_at,
  };
}

function toAttachmentView(row: AttachmentRow): MessageAttachmentView {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    mode: row.mode as "inline" | "link",
    downloadUrl: row.token ? `/d/${row.token}` : `/api/messages/${row.message_id}/attachments/${row.id}`,
  };
}

function parseAddresses(value: string): MessageAddress[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as MessageAddress[]) : [];
  } catch {
    return [];
  }
}

function buildSnippet(text?: string | null, html?: string | null): string {
  const source = text ?? stripHtml(html ?? "");
  return source.replace(/\s+/g, " ").trim().slice(0, 200);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}
