import { describe, expect, it } from "vitest";
import { dirPrefix, partition, r2Key, safeName } from "../src/lib/r2key";

const AT = new Date(Date.UTC(2026, 6, 15));

describe("safeName", () => {
  it("保留中文等非 ASCII 文件名（排查问题时看得出是什么文件）", () => {
    expect(safeName("设计稿.zip")).toBe("设计稿.zip");
    expect(safeName("プレゼン.pdf")).toBe("プレゼン.pdf");
  });

  it("剔除路径分隔符，杜绝目录穿越", () => {
    expect(safeName("../../etc/passwd")).toBe("etc_passwd");
    expect(safeName("a/b\\c.txt")).toBe("a_b_c.txt");
  });

  it("剔除会影响 URL 解析的字符", () => {
    expect(safeName("a?b#c%d\"e'f<g>h|i:j*k.txt")).toBe("a_b_c_d_e_f_g_h_i_j_k.txt");
  });

  it("剔除控制字符", () => {
    expect(safeName("a\u0000b\u001fc.txt")).toBe("abc.txt");
  });

  it("空白折叠成单个下划线", () => {
    expect(safeName("我 的   文件.txt")).toBe("我_的_文件.txt");
  });

  it("连续下划线合并", () => {
    expect(safeName("a___b.txt")).toBe("a_b.txt");
  });

  it("去掉开头的点和下划线，避免隐藏文件", () => {
    expect(safeName(".env")).toBe("env");
    expect(safeName("__init__.py")).toBe("init_.py");
  });

  it("空名或全是非法字符时兜底为 file", () => {
    expect(safeName("")).toBe("file");
    expect(safeName("\x00\x01")).toBe("file");
    expect(safeName("...")).toBe("file");
  });

  it("按字符截断，不会把多字节字符切成半个", () => {
    const result = safeName("中".repeat(200));
    expect([...result].length).toBe(100);
    expect(result).not.toContain("�");
  });

  it("截断长度可调", () => {
    expect([...safeName("a".repeat(200), 120)].length).toBe(120);
  });
});

describe("partition", () => {
  it("形如 YYYY-MM，月份补零", () => {
    expect(partition(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01");
    expect(partition(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12");
  });

  it("按 UTC 切分，不受本机时区影响", () => {
    // 北京时间 2026-08-01 07:00 仍属 UTC 的 7 月
    expect(partition(new Date("2026-07-31T23:00:00Z"))).toBe("2026-07");
  });
});

describe("r2Key", () => {
  it("收件附件键按 用途/信箱/年月/邮件/序号-文件名 分层", () => {
    expect(r2Key.inboundAttachment("box1", "msg1", 0, "报告.pdf", AT)).toBe(
      "inbound/box1/2026-07/msg1/0-报告.pdf",
    );
  });

  it("原始报文与附件同目录，便于整封清理", () => {
    const raw = r2Key.inboundRaw("box1", "msg1", AT);
    const att = r2Key.inboundAttachment("box1", "msg1", 0, "a.txt", AT);
    expect(raw).toBe("inbound/box1/2026-07/msg1/raw.eml");
    expect(dirPrefix(raw)).toBe(dirPrefix(att));
  });

  it("发信载荷目录带信箱与内部 ID", () => {
    expect(r2Key.outboundDir("box1", "mail_01X", AT)).toBe("outbound/box1/2026-07/mail_01X");
  });

  it("分享键含 token", () => {
    expect(r2Key.share("box1", "tok123", "大文件.zip", AT)).toBe("shares/box1/2026-07/tok123/大文件.zip");
  });

  it("文件名里的路径分隔符不会撑出额外层级", () => {
    const key = r2Key.inboundAttachment("box1", "msg1", 0, "../../evil.sh", AT);
    expect(key.split("/").length).toBe(5);
    expect(key.endsWith("/0-evil.sh")).toBe(true);
  });
});

describe("dirPrefix", () => {
  it("返回末级目录（含尾斜杠）", () => {
    expect(dirPrefix("inbound/box1/2026-07/msg1/raw.eml")).toBe("inbound/box1/2026-07/msg1/");
  });

  it("没有斜杠时原样返回", () => {
    expect(dirPrefix("raw.eml")).toBe("raw.eml");
  });
});
