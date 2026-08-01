import { describe, expect, it } from "vitest";
import {
  extractDeployedUrl,
  extractJson,
  hasBucket,
  isUnauthenticated,
  parseAccount,
  parseJsonc,
  replaceStringValue,
} from "../scripts/lib/config.mjs";

/** 贴近真实 wrangler.jsonc：既有注释，又有含 // 的 URL */
const CONFIG = `{
  // 前端静态资源
  "name": "mailedge",
  "main": "src/index.ts",
  /* 多行注释
     也要能剥掉 */
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mailedge",
      "database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"
    }
  ],
  "vars": {
    // 注意这行的值里带 //
    "APP_URL": "https://mailedge.example.com"
  }
}`;

describe("parseJsonc", () => {
  it("剥掉行注释与块注释后能解析", () => {
    const config = parseJsonc(CONFIG);
    expect(config.name).toBe("mailedge");
    expect(config.d1_databases[0].database_name).toBe("mailedge");
  });

  it("不会把 URL 里的 // 当成注释吃掉", () => {
    expect(parseJsonc(CONFIG).vars.APP_URL).toBe("https://mailedge.example.com");
  });

  it("容忍注释后残留的尾逗号", () => {
    expect(parseJsonc('{"a": 1, /* x */ }')).toEqual({ a: 1 });
  });

  it("字符串里的 /* 不被当作块注释起点", () => {
    expect(parseJsonc('{"glob": "src/**/*.ts"}').glob).toBe("src/**/*.ts");
  });

  it("转义引号不会截断字符串", () => {
    expect(parseJsonc('{"quote": "say \\"hi\\" // not a comment"}').quote).toBe('say "hi" // not a comment');
  });

  it("真正语法错误时抛错", () => {
    expect(() => parseJsonc("{ oops }")).toThrow();
  });
});

/** 替换应当成功的场景，顺手把 null 挡掉让类型收敛 */
function rewrite(raw: string, key: string, value: string): string {
  const next = replaceStringValue(raw, key, value);
  if (next === null) throw new Error(`配置里找不到键 ${key}`);
  return next;
}

describe("replaceStringValue", () => {
  it("回填 database_id 且不动其他内容", () => {
    const next = rewrite(CONFIG, "database_id", "abc-123");
    expect(next).toContain('"database_id": "abc-123"');
    expect(parseJsonc(next).d1_databases[0].database_id).toBe("abc-123");
  });

  it("注释原样保留（这正是不用 JSON.parse 重写的原因）", () => {
    const next = rewrite(CONFIG, "database_id", "abc-123");
    expect(next).toContain("// 前端静态资源");
    expect(next).toContain("/* 多行注释");
  });

  it("回填 APP_URL", () => {
    const next = rewrite(CONFIG, "APP_URL", "https://mailedge.workers.dev");
    expect(parseJsonc(next).vars.APP_URL).toBe("https://mailedge.workers.dev");
  });

  it("值里含 $& 时不会被当成替换模式", () => {
    const next = rewrite(CONFIG, "database_id", "a$&b");
    expect(parseJsonc(next).d1_databases[0].database_id).toBe("a$&b");
  });

  it("连续回填两个键互不干扰", () => {
    const next = rewrite(rewrite(CONFIG, "database_id", "uuid-1"), "APP_URL", "https://x.workers.dev");
    const config = parseJsonc(next);
    expect(config.d1_databases[0].database_id).toBe("uuid-1");
    expect(config.vars.APP_URL).toBe("https://x.workers.dev");
    expect(config.name).toBe("mailedge");
  });

  it("键不存在时返回 null，交给调用方报错", () => {
    expect(replaceStringValue(CONFIG, "not_there", "x")).toBeNull();
  });

  it("只替换目标键，同名前缀的键不受影响", () => {
    const next = rewrite('{"id": "a", "database_id": "b"}', "id", "z");
    expect(parseJsonc(next)).toEqual({ id: "z", database_id: "b" });
  });
});

describe("extractJson", () => {
  it("跳过 wrangler 的横幅取出对象", () => {
    const output = ` ⛅️ wrangler 4.118.0\n────────\n{ "uuid": "abc" }\n`;
    expect(extractJson(output)).toEqual({ uuid: "abc" });
  });

  it("取出数组", () => {
    expect(extractJson('banner\n[{"name":"ENCRYPTION_KEY"}]')).toEqual([{ name: "ENCRYPTION_KEY" }]);
  });

  it("没有 JSON 时返回 null", () => {
    expect(extractJson("You are not authenticated.")).toBeNull();
    expect(extractJson("")).toBeNull();
  });

  it("JSON 残缺时返回 null 而不是抛错", () => {
    expect(extractJson("{ broken")).toBeNull();
  });
});

describe("extractDeployedUrl", () => {
  it("从部署输出里取出 workers.dev 地址", () => {
    const output = "Uploaded mailedge\nDeployed mailedge triggers\n  https://mailedge.acme.workers.dev\n";
    expect(extractDeployedUrl(output)).toBe("https://mailedge.acme.workers.dev");
  });

  it("剥掉句尾标点", () => {
    expect(extractDeployedUrl("见 https://mailedge.acme.workers.dev.")).toBe(
      "https://mailedge.acme.workers.dev",
    );
    expect(extractDeployedUrl("(https://a.b.workers.dev)")).toBe("https://a.b.workers.dev");
  });

  it("没有地址时返回 null", () => {
    expect(extractDeployedUrl("Total Upload: 300 KiB")).toBeNull();
    expect(extractDeployedUrl(null)).toBeNull();
  });
});

describe("登录状态判断", () => {
  it("未登录的两种提示都能识别", () => {
    expect(isUnauthenticated("You are not authenticated. Please run `wrangler login`.")).toBe(true);
    expect(isUnauthenticated("Please run wrangler login")).toBe(true);
  });

  it("已登录时为 false", () => {
    expect(isUnauthenticated("Account Name │ 0123456789abcdef0123456789abcdef")).toBe(false);
  });

  it("从表格里取出账号名与 ID", () => {
    const output = "│ Acme Inc │ 0123456789abcdef0123456789abcdef │";
    expect(parseAccount(output)).toEqual({ name: "Acme Inc", id: "0123456789abcdef0123456789abcdef" });
  });

  it("认不出时返回 null", () => {
    expect(parseAccount("Getting User settings...")).toBeNull();
  });
});

describe("hasBucket", () => {
  it("能认出已存在的桶", () => {
    expect(hasBucket("name: mailedge-attachments\ncreation_date: 2026", "mailedge-attachments")).toBe(true);
  });

  it("前缀相同的桶名不算命中（否则会跳过真正要建的桶）", () => {
    expect(hasBucket("name: mailedge-attachments", "mailedge")).toBe(false);
  });

  it("空输出为 false", () => {
    expect(hasBucket("", "mailedge-attachments")).toBe(false);
    expect(hasBucket(null, "x")).toBe(false);
  });
});
