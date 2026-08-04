import type { Env } from "../env";
import { newId } from "../lib/id";

export interface ContactRecord {
  id: string;
  user_id: string;
  email: string;
  name: string;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactView {
  id: string;
  email: string;
  name: string;
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function toContact(row: ContactRecord): ContactView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listContacts(env: Env, userId: string): Promise<ContactView[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, email, name, company, notes, created_at, updated_at
     FROM contacts WHERE user_id = ? ORDER BY lower(name) ASC, lower(email) ASC`,
  )
    .bind(userId)
    .all<ContactRecord>();
  return results.map(toContact);
}

export async function getContact(env: Env, userId: string, id: string): Promise<ContactView | null> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, email, name, company, notes, created_at, updated_at
     FROM contacts WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first<ContactRecord>();
  return row ? toContact(row) : null;
}

export async function findContactByEmail(
  env: Env,
  userId: string,
  email: string,
): Promise<ContactView | null> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, email, name, company, notes, created_at, updated_at
     FROM contacts WHERE user_id = ? AND lower(email) = lower(?) LIMIT 1`,
  )
    .bind(userId, email.trim())
    .first<ContactRecord>();
  return row ? toContact(row) : null;
}

function normalizeInput(input: { email?: string; name?: string; company?: string; notes?: string }) {
  const email = input.email?.trim().toLowerCase() ?? "";
  const name = input.name?.trim().replace(/\s+/g, " ") ?? "";
  const company = input.company?.trim().replace(/\s+/g, " ") || null;
  const notes = input.notes?.trim() || null;
  if (!email.includes("@") || email.length > 320) throw new Error("邮箱地址格式不正确");
  if (!name) throw new Error("联系人姓名不能为空");
  if (name.length > 80) throw new Error("联系人姓名不能超过 80 个字符");
  if (company && company.length > 80) throw new Error("公司名称不能超过 80 个字符");
  if (notes && notes.length > 1000) throw new Error("备注不能超过 1000 个字符");
  return { email, name, company, notes };
}

export async function createContact(
  env: Env,
  userId: string,
  input: { email?: string; name?: string; company?: string; notes?: string },
): Promise<ContactView> {
  const value = normalizeInput(input);
  const existing = await findContactByEmail(env, userId, value.email);
  if (existing) throw new Error("该发件人已经在联系人中");

  const id = newId("contact");
  await env.DB.prepare(
    `INSERT INTO contacts (id, user_id, email, name, company, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, value.email, value.name, value.company, value.notes)
    .run();
  const contact = await getContact(env, userId, id);
  if (!contact) throw new Error("联系人创建失败");
  return contact;
}

export async function updateContact(
  env: Env,
  userId: string,
  id: string,
  input: { email?: string; name?: string; company?: string; notes?: string },
): Promise<ContactView> {
  const value = normalizeInput(input);
  const contact = await getContact(env, userId, id);
  if (!contact) throw new Error("联系人不存在");
  const duplicate = await env.DB.prepare(
    `SELECT id FROM contacts WHERE user_id = ? AND lower(email) = lower(?) AND id <> ? LIMIT 1`,
  )
    .bind(userId, value.email, id)
    .first<{ id: string }>();
  if (duplicate) throw new Error("该邮箱已经属于其他联系人");

  await env.DB.prepare(
    `UPDATE contacts
     SET email = ?, name = ?, company = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(value.email, value.name, value.company, value.notes, id, userId)
    .run();
  const updated = await getContact(env, userId, id);
  if (!updated) throw new Error("联系人更新失败");
  return updated;
}

export async function deleteContact(env: Env, userId: string, id: string): Promise<boolean> {
  const result = await env.DB.prepare(`DELETE FROM contacts WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return Boolean(result.meta.changes);
}
