/**
 * 卸载：扫描并删除部署在用户账户里的 MailEdge 资源。
 * 删除前由前端列出清单并让用户明确勾选，后端只删除被勾选项。
 */
import { cfRequest } from "./client";

export type ResourceKind = "worker" | "d1" | "r2" | "emailRule";

export interface MailEdgeResource {
  kind: ResourceKind;
  /** 资源 ID：worker 名 / D1 uuid / R2 桶名 / 路由规则 tag */
  id: string;
  label: string;
  zoneId?: string;
}

export interface DeleteResult {
  kind: ResourceKind;
  label: string;
  ok: boolean;
  detail?: string;
}

/** 扫描该账户下与 MailEdge 相关的全部资源（只读，不修改任何东西） */
export async function listMailEdgeResources(
  token: string,
  accountId: string,
): Promise<MailEdgeResource[]> {
  const resources: MailEdgeResource[] = [];

  // Worker
  try {
    const scripts = await cfRequest<Array<{ id: string }>>(
      token,
      `/accounts/${accountId}/workers/scripts?per_page=100`,
    );
    if (scripts.some((s) => s.id === "mailedge")) {
      resources.push({ kind: "worker", id: "mailedge", label: "Worker 脚本：mailedge" });
    }
  } catch {
    // 无权限或查询失败，跳过该项
  }

  // D1
  try {
    const dbs = await cfRequest<Array<{ uuid?: string; database_id?: string; name: string }>>(
      token,
      `/accounts/${accountId}/d1/database?per_page=100`,
    );
    const db = dbs.find((d) => d.name === "mailedge");
    if (db) {
      resources.push({
        kind: "d1",
        id: db.database_id ?? db.uuid ?? "",
        label: "D1 数据库：mailedge",
      });
    }
  } catch {
    // 跳过
  }

  // R2 桶
  try {
    const buckets = await cfRequest<Array<{ name: string }>>(
      token,
      `/accounts/${accountId}/r2/buckets?per_page=100`,
    );
    if (buckets.some((b) => b.name === "mailedge-attachments")) {
      resources.push({ kind: "r2", id: "mailedge-attachments", label: "R2 存储桶：mailedge-attachments" });
    }
  } catch {
    // 跳过
  }

  // Email Routing 规则（遍历该账户下所有 zone，找指向 mailedge Worker 的规则）
  try {
    const zones = await cfRequest<Array<{ id: string; name: string }>>(
      token,
      `/zones?account.id=${accountId}&per_page=100&status=active`,
    );
    for (const zone of zones) {
      const rules = await cfRequest<
        Array<{ tag: string; actions?: Array<{ type: string; worker?: string }>; matchers?: Array<{ type?: string }> }>
      >(token, `/zones/${zone.id}/email/routing/rules`).catch(() => []);
      for (const rule of rules) {
        const sendsToWorker = rule.actions?.some(
          (a) => a.type === "send_to_worker" && a.worker === "mailedge",
        );
        if (sendsToWorker) {
          const target = rule.matchers?.some((m) => m.type === "all")
            ? "Catch-all（全部来信）"
            : "精确地址";
          resources.push({
            kind: "emailRule",
            id: rule.tag,
            label: `Email 路由规则（${zone.name}）· ${target}`,
            zoneId: zone.id,
          });
        }
      }
    }
  } catch {
    // 跳过
  }

  return resources;
}

/** 删除被勾选的资源。R2 桶需先清空对象再删桶。 */
export async function deleteResources(
  token: string,
  accountId: string,
  items: MailEdgeResource[],
): Promise<DeleteResult[]> {
  const results: DeleteResult[] = [];

  for (const item of items) {
    try {
      switch (item.kind) {
        case "worker":
          await cfRequest(token, `/accounts/${accountId}/workers/scripts/${item.id}`, {
            method: "DELETE",
          });
          break;
        case "d1":
          await cfRequest(token, `/accounts/${accountId}/d1/database/${item.id}`, {
            method: "DELETE",
          });
          break;
        case "r2":
          await deleteR2Bucket(token, accountId, item.id);
          break;
        case "emailRule":
          if (!item.zoneId) throw new Error("缺少 zone 信息");
          await cfRequest(token, `/zones/${item.zoneId}/email/routing/rules/${item.id}`, {
            method: "DELETE",
          });
          break;
      }
      results.push({ kind: item.kind, label: item.label, ok: true });
    } catch (error) {
      results.push({
        kind: item.kind,
        label: item.label,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/** R2 桶必须为空才能删：先分页删除所有对象，再删桶 */
async function deleteR2Bucket(token: string, accountId: string, bucket: string): Promise<void> {
  let cursor: string | undefined;
  // 循环拉取并删除对象，直到桶为空
  for (let round = 0; round < 100; round++) {
    const query = `/accounts/${accountId}/r2/buckets/${bucket}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await cfRequest<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>(
      token,
      query,
    ).catch(() => null);
    if (!page || !page.objects?.length) break;

    for (const obj of page.objects) {
      await cfRequest(token, `/accounts/${accountId}/r2/buckets/${bucket}/objects/${encodeURIComponent(obj.key)}`, {
        method: "DELETE",
      });
    }

    if (!page.truncated) break;
    cursor = page.cursor;
  }

  await cfRequest(token, `/accounts/${accountId}/r2/buckets/${bucket}`, { method: "DELETE" });
}
