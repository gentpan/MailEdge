/** 前后端共用的邮件视图模型 */

/** catchall：没有精确登记、靠兜底信箱兜进来的邮件，与主收件箱分开存放 */
export type SystemMailFolder = "inbox" | "sent" | "drafts" | "archive" | "spam" | "trash" | "catchall";
/** 系统文件夹之外，用户创建的文件夹使用稳定 ID 保存到邮件记录中。 */
export type MailFolder = SystemMailFolder | (string & {});
export type MailDirection = "inbound" | "outbound";

export interface CustomFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface MessageAddress {
  email: string;
  name?: string;
}

export interface MessageAttachmentView {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  /** inline = 随邮件投递的真附件；link = 对象存储下载链接 */
  mode: "inline" | "link";
  downloadUrl: string;
}

export interface MessageSummary {
  id: string;
  /** 所属信箱。聚合视图下每封信可能来自不同信箱，后续操作要按它路由 */
  mailboxId?: string;
  mailboxAddress?: string;
  internalId: string | null;
  direction: MailDirection;
  folder: MailFolder;
  subject: string;
  snippet: string;
  from: MessageAddress;
  to: MessageAddress[];
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  status: string | null;
  provider: string | null;
  /** 本地规则或 AI 生成的分类标签；旧邮件可能仍为 null */
  category: string | null;
  receivedAt: string;
}

export interface MessageDetail extends MessageSummary {
  cc: MessageAddress[];
  bcc: MessageAddress[];
  replyTo: MessageAddress | null;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  size: number;
  messageId: string | null;
  inReplyTo: string | null;
  error: string | null;
  aiSummary: string | null;
  attachments: MessageAttachmentView[];
}

export interface FolderStats {
  folder: MailFolder;
  total: number;
  unread: number;
}
