import type { Env } from "../env";
import { newId } from "../lib/id";
import type { CustomFolder } from "../shared/message";

interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

function toFolder(row: FolderRow): CustomFolder {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function listFolders(env: Env, userId: string): Promise<CustomFolder[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, name, created_at
     FROM mail_folders WHERE user_id = ? ORDER BY created_at ASC, name ASC`,
  )
    .bind(userId)
    .all<FolderRow>();
  return results.map(toFolder);
}

export async function getFolder(env: Env, userId: string, id: string): Promise<CustomFolder | null> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, name, created_at FROM mail_folders WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first<FolderRow>();
  return row ? toFolder(row) : null;
}

export async function createFolder(env: Env, userId: string, name: string): Promise<CustomFolder> {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("文件夹名称不能为空");
  if (normalized.length > 40) throw new Error("文件夹名称不能超过 40 个字符");

  const duplicate = await env.DB.prepare(
    `SELECT id FROM mail_folders WHERE user_id = ? AND lower(name) = lower(?) LIMIT 1`,
  )
    .bind(userId, normalized)
    .first<{ id: string }>();
  if (duplicate) throw new Error("该文件夹已存在");

  const id = newId("folder");
  await env.DB.prepare(`INSERT INTO mail_folders (id, user_id, name) VALUES (?, ?, ?)`)
    .bind(id, userId, normalized)
    .run();
  const folder = await getFolder(env, userId, id);
  if (!folder) throw new Error("文件夹创建失败");
  return folder;
}

export async function renameFolder(
  env: Env,
  userId: string,
  id: string,
  name: string,
): Promise<CustomFolder> {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("文件夹名称不能为空");
  if (normalized.length > 40) throw new Error("文件夹名称不能超过 40 个字符");
  const folder = await getFolder(env, userId, id);
  if (!folder) throw new Error("文件夹不存在");
  const duplicate = await env.DB.prepare(
    `SELECT id FROM mail_folders WHERE user_id = ? AND lower(name) = lower(?) AND id <> ? LIMIT 1`,
  )
    .bind(userId, normalized, id)
    .first<{ id: string }>();
  if (duplicate) throw new Error("该文件夹已存在");
  await env.DB.prepare(`UPDATE mail_folders SET name = ? WHERE id = ? AND user_id = ?`)
    .bind(normalized, id, userId)
    .run();
  const updated = await getFolder(env, userId, id);
  if (!updated) throw new Error("文件夹更新失败");
  return updated;
}

export async function deleteFolder(env: Env, userId: string, id: string): Promise<boolean> {
  const result = await env.DB.prepare(`DELETE FROM mail_folders WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return Boolean(result.meta.changes);
}
