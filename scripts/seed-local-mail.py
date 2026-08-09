#!/usr/bin/env python3
"""向本地 Wrangler Durable Object 写入确定性的 QA 邮件，不发送真实邮件。

这个脚本只会访问仓库内 ``.wrangler/state`` 的本地 SQLite，并且只会替换
``seed_`` 前缀的数据。线上 Cloudflare 资源不会被读取或修改。
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DO_DIR = ROOT / ".wrangler/state/v3/do/mailedge-MailboxDO"
DEFAULT_MAILBOX = "admin@example.com"
SEED_PREFIX = "seed_"
VALID_CATEGORIES = {"important", "updates", "promotions", "verification", "social", "other"}


def target_name(mailbox: str) -> str:
    mailbox = mailbox.strip().lower()
    if not mailbox or "@" not in mailbox or any(character.isspace() for character in mailbox):
        raise ValueError(f"无效的本地测试邮箱：{mailbox!r}")
    return f"mailbox:{mailbox}"


def find_target(mailbox: str = DEFAULT_MAILBOX) -> Path:
    expected = target_name(mailbox)
    for path in DO_DIR.glob("*.sqlite"):
        try:
            with sqlite3.connect(path) as connection:
                row = connection.execute("SELECT * FROM __miniflare_do_name").fetchone()
        except sqlite3.Error:
            continue
        if row and len(row) > 1 and row[1] == expected:
            return path
    raise SystemExit(f"找不到本地 {mailbox} Durable Object，请先运行 npm run dev 并登录一次")


def fixture(
    key: str,
    sender: str,
    name: str,
    subject: str,
    snippet: str,
    text: str,
    html: str,
    received_at: str,
    *,
    read: bool = False,
    starred: bool = False,
    category: str | None = None,
) -> tuple:
    domain = sender.rsplit("@", 1)[-1]
    return (
        f"{SEED_PREFIX}{key}",
        f"<{SEED_PREFIX}{key}@{domain}>",
        sender,
        name,
        json.dumps([{"email": DEFAULT_MAILBOX}], ensure_ascii=False),
        subject,
        snippet,
        html,
        text,
        len(text.encode("utf-8")),
        int(read),
        int(starred),
        category,
        received_at,
    )


LONG_ZH_TEXT = "\n\n".join(
    [
        "你好，这是一封用于视觉回归的超长中文邮件。它包含多个段落、标题、列表和较长的连续文字，用来检查 MailEdge 详情页的正文宽度、行高、换行和滚动行为。",
        "项目背景：我们正在整理收件箱、附件管理、搜索和邮件工具栏。正文内容故意保持较长，以便观察在宽屏、窄屏、浅色主题和深色主题下是否都能稳定显示。",
        "本周进展：收件箱列表现在按日期分组，邮件行默认保持单行，发件人头像会优先尝试域名图标，找不到图标时回退到企业名称首字母。详情页支持回复、回复全部、转发、标记、移动和更多操作。",
        "数据安全说明：这封邮件只是本地测试数据，不会发送到任何真实地址，也不会写入 Cloudflare 线上账号。附件、HTML 和纯文本内容都只用于检查界面表现。",
        "请重点观察以下内容：第一，超长主题在邮件列表中是否自然省略；第二，长摘要是否会撑高单元格；第三，详情页 HTML 正文是否保持在内容区域内；第四，代码块、引用块、表格和链接是否可读。",
        "如果窗口宽度较小，正文应该继续在详情面板内部滚动，而不是让整个页面横向溢出。列表中的发件人、主题、摘要和时间也应该尽量在同一行完成布局。",
        "这里再补充一段较长的连续文字：MailEdge 运行在 Cloudflare Workers 上，邮件数据由用户自己的账户承载，D1 保存结构化数据，R2 或 KV 可以按配置保存附件和对象。不同部署方式不应改变邮件阅读体验。",
        "测试结束后，可以直接删除这封邮件，或者重新运行 seed-local-mail.py 恢复测试数据。再次执行脚本会覆盖相同 ID 的测试邮件，不会重复创建。",
    ]
)

LONG_ZH_HTML = """
<article style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.75;color:#24324a;max-width:760px;margin:0 auto">
  <header style="padding:24px;border-radius:14px;background:linear-gradient(135deg,#eef5ff,#f8fbff)">
    <p style="margin:0;color:#2864dc;font-size:13px;letter-spacing:.08em">MAILEDGE VISUAL REGRESSION</p>
    <h1 style="margin:10px 0 0;font-size:28px">超长邮件正文布局测试</h1>
    <p style="margin:8px 0 0;color:#63708a">包含段落、列表、表格、引用和链接的 HTML 内容。</p>
  </header>
  <p>这是一封较长的 HTML 测试邮件。它的目的不是展示业务信息，而是检查详情正文在不同宽度下的排版、滚动、边距和颜色。</p>
  <h2>本次检查项目</h2>
  <ul>
    <li>长主题和长摘要在列表单行布局中的省略效果。</li>
    <li>正文容器是否限制最大宽度，并保持舒适的阅读行长。</li>
    <li>表格、代码、引用和链接是否不会撑破详情面板。</li>
    <li>浅色和深色主题切换后，内容对比度是否足够。</li>
  </ul>
  <table style="border-collapse:collapse;width:100%;margin:20px 0">
    <thead><tr><th style="border:1px solid #d7deea;padding:10px;text-align:left;background:#f5f7fb">检查项</th><th style="border:1px solid #d7deea;padding:10px;text-align:left;background:#f5f7fb">预期结果</th></tr></thead>
    <tbody>
      <tr><td style="border:1px solid #d7deea;padding:10px">邮件列表</td><td style="border:1px solid #d7deea;padding:10px">发件人、主题、摘要、时间保持单行</td></tr>
      <tr><td style="border:1px solid #d7deea;padding:10px">详情正文</td><td style="border:1px solid #d7deea;padding:10px">内容可读，超出部分在面板内滚动</td></tr>
      <tr><td style="border:1px solid #d7deea;padding:10px">工具栏</td><td style="border:1px solid #d7deea;padding:10px">按钮间距一致，菜单不被裁切</td></tr>
    </tbody>
  </table>
  <blockquote style="margin:20px 0;padding:14px 18px;border-left:4px solid #2864dc;background:#f3f6fc;color:#53617a">引用块用于测试较长句子在正文中的自动换行和左侧标记。</blockquote>
  <p>如果你需要更多内容，可以打开浏览器开发者工具调整窗口宽度，分别测试桌面、平板和手机尺寸。<a href="https://mailedge.io">访问 MailEdge 官网</a>。</p>
  <pre style="white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;border-radius:10px;background:#101318;color:#d7f5d0">GET /api/messages?folder=inbox\nAccept: application/json\nX-MailEdge-Visual-Test: long-html</pre>
  <p>邮件结尾：这是本地生成的测试内容，可以安全删除。</p>
</article>
""".strip()

LONG_ENGLISH_TEXT = "\n\n".join(
    [
        "This is a long English message for MailEdge visual regression testing. The subject and preview are intentionally verbose so the compact message row can be checked at several viewport widths.",
        "The detail view should keep a readable line length, preserve paragraph spacing, and scroll inside the reading pane when the body is taller than the available viewport.",
        "This fixture also includes mixed punctuation, URLs, product names, and a deliberately long unbroken identifier: mailedge-visual-regression-long-message-2026-08-04-abcdefghijklmnopqrstuvwxyz-0123456789.",
        "Please verify that the toolbar remains visible, that HTML is sandboxed, and that the message body never causes horizontal overflow in the application shell.",
        "The final paragraph is intentionally repetitive. MailEdge should render it as normal text without collapsing the content or clipping the bottom of the message.",
    ]
)

LONG_ENGLISH_HTML = """
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.65;color:#24292f;max-width:780px">
  <div style="padding:22px;border-radius:12px;background:#f6f8fa;border:1px solid #d0d7de">
    <h1 style="margin:0 0 8px">A long-form product update</h1>
    <p style="margin:0;color:#57606a">A realistic newsletter layout for testing MailEdge rendering.</p>
  </div>
  <p>This message deliberately contains enough content to require scrolling. It should remain readable even when the application is opened in a narrow split-pane layout.</p>
  <h2>What to verify</h2>
  <ol><li>Long lines wrap instead of forcing the shell wider.</li><li>Buttons and links retain their spacing.</li><li>Tables and code samples stay inside the content area.</li></ol>
  <div style="overflow-x:auto"><table style="border-collapse:collapse;min-width:620px;width:100%"><tr><th style="text-align:left;padding:10px;border-bottom:2px solid #d8dee4">Component</th><th style="text-align:left;padding:10px;border-bottom:2px solid #d8dee4">Status</th><th style="text-align:left;padding:10px;border-bottom:2px solid #d8dee4">Notes</th></tr><tr><td style="padding:10px;border-bottom:1px solid #d8dee4">Message list</td><td style="padding:10px;border-bottom:1px solid #d8dee4;color:#1a7f37">Ready</td><td style="padding:10px;border-bottom:1px solid #d8dee4">Single-line compact rows</td></tr><tr><td style="padding:10px;border-bottom:1px solid #d8dee4">Message view</td><td style="padding:10px;border-bottom:1px solid #d8dee4;color:#1a7f37">Ready</td><td style="padding:10px;border-bottom:1px solid #d8dee4">Sandboxed HTML body</td></tr></table></div>
  <p><a href="https://github.com/gentpan/MailEdge">Open the MailEdge repository</a> to compare the implementation with this fixture.</p>
  <hr><p style="color:#57606a;font-size:13px">End of local visual regression fixture.</p>
</div>
""".strip()


MESSAGES = [
    fixture(
        "gmail",
        "news@gmail.com",
        "Gmail 产品团队",
        "你的 Gmail 安全摘要与本月新功能介绍：请检查账户设置和登录活动",
        "这是用于测试单行邮件列表的较长摘要：我们整理了本月的登录活动、安全建议、收件箱分类和新的智能整理功能。",
        "你好，\n\n这是 Gmail 测试邮件。正文包含较长文本，用于检查列表摘要、详情排版和超长内容的显示效果。请检查最近的登录活动、恢复邮箱、两步验证和设备授权。\n\nGmail 产品团队",
        '<div style="font-family:Arial,sans-serif;color:#202124;line-height:1.6"><h1>账户安全摘要</h1><p>这是 Gmail 的 HTML 测试邮件，用于验证 MailEdge 的正文渲染。</p><p>本月我们为收件箱增加了更清晰的分类、搜索和安全提示。</p><table style="border-collapse:collapse;width:100%"><tr><th style="border:1px solid #ddd;padding:8px;text-align:left">项目</th><th style="border:1px solid #ddd;padding:8px;text-align:left">状态</th></tr><tr><td style="border:1px solid #ddd;padding:8px">两步验证</td><td style="border:1px solid #ddd;padding:8px;color:#188038">已开启</td></tr><tr><td style="border:1px solid #ddd;padding:8px">最近登录</td><td style="border:1px solid #ddd;padding:8px">北京 · 今天 17:52</td></tr></table><p><a href="https://mail.google.com">打开 Gmail</a></p></div>',
        "2026-08-04T18:01:00.000Z",
        starred=True,
        category="updates",
    ),
    fixture(
        "hotmail",
        "security@hotmail.com",
        "Microsoft account",
        "重要：检测到新的登录活动，请确认这是否是你的 Microsoft 账户操作",
        "我们检测到一次新的账户登录。如果这是你本人操作，可以忽略这封邮件；如果不是，请立即保护账户。",
        "我们检测到一次新的登录活动。\n\n时间：2026 年 8 月 4 日 17:56\n位置：Singapore\n设备：Windows 11 / Edge\n\n如果这不是你的操作，请前往账户安全页面修改密码并检查恢复方式。\n\nMicrosoft 账户团队",
        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px"><div style="background:#0078d4;color:white;padding:20px"><strong>Microsoft account</strong></div><div style="padding:24px"><h2>检测到新的登录活动</h2><p>我们发现你的账户在一台新设备上登录。</p><ul><li><strong>时间：</strong>2026 年 8 月 4 日 17:56</li><li><strong>位置：</strong>Singapore</li><li><strong>设备：</strong>Windows 11 / Edge</li></ul><div style="background:#f3f6f9;padding:16px;border-radius:8px">如果这是你本人操作，无需采取任何措施。</div><p><a style="display:inline-block;background:#0078d4;color:#fff;padding:10px 18px;text-decoration:none" href="https://account.microsoft.com">查看账户活动</a></p></div></div>',
        "2026-08-04T17:56:00.000Z",
        category="important",
    ),
    fixture(
        "qq",
        "notice@qq.com",
        "QQ邮箱通知",
        "QQ邮箱新邮件提醒：你有 4 封未读邮件和一封带附件的工作通知",
        "你有 4 封未读邮件，其中包含一封带附件的工作通知。登录 QQ 邮箱查看详情。",
        "QQ邮箱提醒\n\n你有 4 封未读邮件，其中包含一封带附件的工作通知。请登录 QQ 邮箱查看详情。\n\n这是一封用于测试中文内容、长主题和附件标识的模拟邮件。",
        '<div style="font-family:Arial,Microsoft YaHei,sans-serif"><h2 style="color:#1677ff">QQ邮箱新邮件提醒</h2><p>你有 <strong>4</strong> 封未读邮件。</p><div style="border:1px solid #e6eaf0;border-radius:10px;padding:16px"><p style="margin:0 0 8px">工作通知</p><p style="margin:0;color:#667085">包含一份项目进度表和会议材料，请在今天下班前确认。</p></div><p><a href="https://mail.qq.com">进入 QQ 邮箱</a></p></div>',
        "2026-08-04T17:52:00.000Z",
        read=True,
        category="updates",
    ),
    fixture(
        "163",
        "service@163.com",
        "163邮箱服务",
        "网易邮箱服务通知：你的邮箱容量、登录保护和客户端授权状态",
        "这是网易邮箱的长文本测试，用于检查中文发件人、主题省略、摘要省略和右侧时间对齐。",
        "你好，这是网易 163 邮箱测试邮件。\n\n本邮件故意使用较长的主题和较长的摘要，帮助检查邮件列表在不同屏幕宽度下是否保持单行，并观察文本省略号是否自然。\n\n请检查登录保护、客户端授权和邮箱容量设置。",
        '<article style="font-family:PingFang SC,Microsoft YaHei,sans-serif;color:#333"><h1>邮箱服务通知</h1><p>你的邮箱服务状态正常。以下是本次通知的详细信息：</p><ol><li>登录保护：正常</li><li>客户端授权：2 台设备</li><li>邮箱容量：已使用 38%</li></ol><blockquote style="border-left:4px solid #e60012;margin:20px 0;padding:8px 16px;background:#fff5f5">这段引用用于测试 HTML 邮件中的引用块样式。</blockquote><p>感谢使用网易邮箱服务。</p></article>',
        "2026-08-04T17:46:00.000Z",
        read=True,
        starred=True,
        category="other",
    ),
    fixture(
        "yahoo",
        "digest@yahoo.com",
        "Yahoo Mail Digest",
        "Yahoo Mail 周报：收件箱整理建议、新闻摘要以及你可能感兴趣的内容",
        "本周邮件摘要包含收件箱整理建议、新闻摘要以及你可能感兴趣的内容。",
        "Yahoo Mail Digest\n\n本周我们为你整理了收件箱摘要。你可以使用搜索、星标、归档和过滤器快速处理邮件。\n\n这封邮件的内容长度适中，用于对比不同长度摘要的行内显示。",
        '<div style="font-family:Arial,sans-serif;background:#fafafa;padding:24px"><div style="background:#720e9e;color:white;padding:18px;border-radius:10px 10px 0 0"><h2 style="margin:0">Yahoo Mail Digest</h2></div><div style="background:white;padding:24px"><p>这是 Yahoo Mail 的 HTML 测试邮件。</p><hr><h3>本周推荐</h3><p>使用星标保存重要邮件，使用归档保持收件箱清爽。</p><p><span style="background:#f0e6f5;color:#720e9e;padding:6px 10px;border-radius:999px">每周摘要</span></p></div></div>',
        "2026-08-04T17:42:00.000Z",
        category="promotions",
    ),
    fixture(
        "github",
        "notifications@github.com",
        "GitHub Notifications",
        "[MailEdge] Pull request review requested: improve attachment storage and migration safety",
        "gentpan requested your review on a pull request. This message includes a long repository notification summary.",
        "GitHub Notifications\n\nGentpan requested your review on a pull request.\n\nRepository: gentpan/MailEdge\nPull request: Improve attachment storage and migration safety\n\nThis longer message tests English sender names, mixed punctuation, URLs, and multi-line HTML rendering.",
        '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><h2>Pull request review requested</h2><p><strong>gentpan</strong> requested your review on <a href="https://github.com/gentpan/MailEdge">gentpan/MailEdge</a>.</p><pre style="background:#f6f8fa;padding:16px;border-radius:6px;white-space:pre-wrap">Improve attachment storage and migration safety</pre><p style="color:#57606a">This HTML block tests code blocks, links, bold text, and long English content.</p></div>',
        "2026-08-03T21:12:00.000Z",
        read=True,
        category="updates",
    ),
    fixture(
        "cloudflare",
        "billing@cloudflare.com",
        "Cloudflare Billing",
        "Cloudflare 账户账单与 Workers 用量报告：本月资源消耗和预计费用明细",
        "本月 Workers、D1、R2 和 KV 的用量报告已经生成。此邮件用于测试企业图标和带表格正文。",
        "Cloudflare Billing\n\n本月 Workers、D1、R2 和 KV 的用量报告已经生成。\n\nWorkers Requests: 18,240\nD1 Reads: 3,210\nR2 Storage: 1.8 GB\nKV Operations: 9,430",
        '<div style="font-family:Arial,sans-serif"><div style="background:#f4811f;color:#fff;padding:18px"><strong>Cloudflare Billing</strong></div><div style="padding:20px"><h2>本月用量报告</h2><table style="border-collapse:collapse;width:100%"><tr><th style="border-bottom:1px solid #ddd;text-align:left;padding:10px">资源</th><th style="border-bottom:1px solid #ddd;text-align:right;padding:10px">用量</th></tr><tr><td style="padding:10px">Workers Requests</td><td style="padding:10px;text-align:right">18,240</td></tr><tr><td style="padding:10px">D1 Reads</td><td style="padding:10px;text-align:right">3,210</td></tr><tr><td style="padding:10px">R2 Storage</td><td style="padding:10px;text-align:right">1.8 GB</td></tr></table></div></div>',
        "2026-08-03T19:40:00.000Z",
        starred=True,
        category="important",
    ),
    fixture(
        "long-zh",
        "updates@mailedge.io",
        "MailEdge 产品团队",
        "MailEdge 超长正文布局测试：收件箱单行列表、详情阅读区、邮件工具栏、HTML 表格、引用块与主题切换完整检查通知",
        "这是一封超长中文测试邮件，包含多个段落、列表、表格、引用、代码块和链接，用于检查邮件列表单行显示以及详情正文滚动布局。",
        LONG_ZH_TEXT,
        LONG_ZH_HTML,
        "2026-08-04T18:24:00.000Z",
        category="updates",
    ),
    fixture(
        "long-en",
        "newsletter@example.com",
        "MailEdge Newsletter",
        "A very long product update for testing compact rows, responsive message details, toolbar spacing, HTML rendering, and internal scrolling across desktop and mobile viewports",
        "This intentionally long English preview checks whether sender, subject, snippet, and time remain on one line without making the message row taller.",
        LONG_ENGLISH_TEXT,
        LONG_ENGLISH_HTML,
        "2026-08-04T18:18:00.000Z",
        read=True,
        category="promotions",
    ),
    fixture(
        "long-report",
        "reports@cloudflare.com",
        "Cloudflare Usage Report",
        "Cloudflare Workers、D1、R2 与 KV 月度使用报告：本地视觉测试用长表格和长段落，不代表真实账单或线上资源状态",
        "这封报告邮件包含较长的中文摘要、HTML 表格和多组资源数据，用于检查企业头像、主题省略、正文宽度和表格横向溢出处理。",
        "Cloudflare Usage Report\n\n" + LONG_ZH_TEXT + "\n\nWorkers Requests: 18,240\nD1 Reads: 3,210\nR2 Storage: 1.8 GB\nKV Operations: 9,430",
        '<div style="font-family:Arial,Microsoft YaHei,sans-serif;line-height:1.7"><div style="background:#f4811f;color:#fff;padding:22px;border-radius:12px"><h1 style="margin:0">Cloudflare Usage Report</h1><p style="margin:8px 0 0">Local visual regression fixture — not a real invoice.</p></div><p>这是一封包含长段落与资源表格的测试报告。请确认表格不会撑破详情面板，并且正文在窄窗口下仍然可以阅读。</p><table style="border-collapse:collapse;width:100%;min-width:620px"><tr><th style="padding:10px;border:1px solid #ddd;text-align:left">资源</th><th style="padding:10px;border:1px solid #ddd;text-align:right">本月用量</th><th style="padding:10px;border:1px solid #ddd;text-align:left">说明</th></tr><tr><td style="padding:10px;border:1px solid #ddd">Workers Requests</td><td style="padding:10px;border:1px solid #ddd;text-align:right">18,240</td><td style="padding:10px;border:1px solid #ddd">请求量测试</td></tr><tr><td style="padding:10px;border:1px solid #ddd">D1 Reads</td><td style="padding:10px;border:1px solid #ddd;text-align:right">3,210</td><td style="padding:10px;border:1px solid #ddd">读取量测试</td></tr><tr><td style="padding:10px;border:1px solid #ddd">R2 Storage</td><td style="padding:10px;border:1px solid #ddd;text-align:right">1.8 GB</td><td style="padding:10px;border:1px solid #ddd">对象存储测试</td></tr><tr><td style="padding:10px;border:1px solid #ddd">KV Operations</td><td style="padding:10px;border:1px solid #ddd;text-align:right">9,430</td><td style="padding:10px;border:1px solid #ddd">键值读取测试</td></tr></table><p style="color:#667085">如果浏览器窗口较窄，请检查表格是否在邮件正文内部滚动，而不是让整个应用横向滚动。</p></div>',
        "2026-08-03T22:10:00.000Z",
        starred=True,
        category="important",
    ),
]

# 深浅色视觉专项：日期晚于基础 fixtures，重建后会固定显示在收件箱第一页。
MESSAGES.extend(
    [
        fixture(
            "dropbox-code",
            "no-reply@dropbox.com",
            "Dropbox",
            "你的 Dropbox 登录验证码是 482 917",
            "请在 10 分钟内输入此验证码。不要将验证码转发或透露给任何人。",
            "Dropbox 登录验证码\n\n482 917\n\n验证码将在 10 分钟后失效。如果这不是你的操作，请立即修改密码。",
            """
            <div style="font-family:Arial,'Microsoft YaHei',sans-serif;background:#f4f7fb;padding:28px;color:#17213a">
              <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dce3ef;border-radius:16px;padding:32px;text-align:center">
                <div style="width:48px;height:48px;line-height:48px;margin:0 auto 18px;border-radius:12px;background:#0061ff;color:#fff;font-weight:700">DB</div>
                <h1 style="margin:0 0 12px;font-size:24px">验证你的登录</h1>
                <p style="margin:0;color:#667085">请在 10 分钟内输入以下验证码</p>
                <div style="margin:26px 0;padding:18px;border-radius:12px;background:#eef4ff;color:#0052d9;font-size:32px;font-weight:700;letter-spacing:.24em">482 917</div>
                <p style="margin:0;color:#98a2b3;font-size:13px">不要将验证码转发或透露给任何人。</p>
              </div>
            </div>
            """.strip(),
            "2026-08-09T10:24:00.000Z",
            category="verification",
        ),
        fixture(
            "stripe-receipt",
            "receipts@stripe.com",
            "Stripe Receipts",
            "付款成功：MailEdge Cloud 服务订单 #ME-20260809",
            "我们已收到你的付款。订单总额 US$29.00，付款方式 Visa •••• 4242。",
            "付款成功\n\n订单：#ME-20260809\n订阅：MailEdge Cloud Pro\n金额：US$29.00\n付款方式：Visa •••• 4242",
            """
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7fb;padding:28px;color:#202124">
              <div style="max-width:680px;margin:auto;background:#fff;border:1px solid #e3e6ef;border-radius:14px;overflow:hidden">
                <div style="padding:26px 30px;background:linear-gradient(135deg,#635bff,#8b5cf6);color:#fff"><strong style="font-size:22px">Stripe</strong><span style="float:right">付款收据</span></div>
                <div style="padding:30px"><p style="margin:0 0 8px;color:#667085">订单 #ME-20260809</p><h1 style="margin:0 0 22px">US$29.00</h1>
                  <table style="border-collapse:collapse;width:100%"><tr><td style="padding:12px 0;border-bottom:1px solid #eaecf0">MailEdge Cloud Pro</td><td style="padding:12px 0;border-bottom:1px solid #eaecf0;text-align:right">US$29.00</td></tr><tr><td style="padding:12px 0;color:#667085">付款方式</td><td style="padding:12px 0;text-align:right;color:#667085">Visa •••• 4242</td></tr></table>
                  <p style="margin:22px 0 0"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#ecfdf3;color:#067647">付款成功</span></p>
                </div>
              </div>
            </div>
            """.strip(),
            "2026-08-09T10:16:00.000Z",
            read=True,
            starred=True,
            category="important",
        ),
        fixture(
            "apple-security",
            "account-security@apple.com",
            "Apple 账户安全",
            "你的 Apple 账户刚刚在一台新设备上登录",
            "设备：MacBook Pro；位置：Berlin, Germany。如果不是你本人，请立即保护账户。",
            "Apple 账户安全提醒\n\n设备：MacBook Pro\n位置：Berlin, Germany\n时间：2026-08-09 12:08\n\n如果不是你的操作，请立即修改密码。",
            """
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:660px;margin:auto;color:#1d1d1f;line-height:1.6">
              <div style="font-size:34px;margin-bottom:18px">●</div><h1 style="font-size:28px;line-height:1.25">你的 Apple 账户刚刚在一台新设备上登录</h1>
              <p>我们检测到你的账户在 <strong>MacBook Pro</strong> 上完成登录。</p>
              <div style="padding:18px;border-radius:12px;background:#f5f5f7"><table style="width:100%"><tr><td style="padding:5px;color:#6e6e73">位置</td><td style="padding:5px;text-align:right">Berlin, Germany</td></tr><tr><td style="padding:5px;color:#6e6e73">时间</td><td style="padding:5px;text-align:right">2026-08-09 12:08</td></tr></table></div>
              <p style="padding:14px 16px;border-left:4px solid #ff3b30;background:#fff2f1">如果不是你本人，请立即修改密码并检查受信任设备。</p>
              <p><a href="https://appleid.apple.com" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#0071e3;color:white;text-decoration:none">检查账户</a></p>
            </div>
            """.strip(),
            "2026-08-09T10:08:00.000Z",
            category="important",
        ),
        fixture(
            "slack-mention",
            "notification@slack.com",
            "Slack",
            "Lin 在 #mailedge-design 中提到了你",
            "“我已经上传新的深色模式设计稿，请重点检查邮件正文和工具栏对比度。”",
            "Lin 在 #mailedge-design 中提到了你：\n\n我已经上传新的深色模式设计稿，请重点检查邮件正文和工具栏对比度。",
            """
            <div style="font-family:Arial,'Microsoft YaHei',sans-serif;max-width:680px;margin:auto;color:#1d1c1d">
              <div style="padding:18px 22px;border-bottom:1px solid #ddd"><strong style="font-size:22px;color:#4a154b">Slack</strong><span style="float:right;color:#616061">#mailedge-design</span></div>
              <div style="padding:24px"><div style="display:inline-block;width:42px;height:42px;line-height:42px;text-align:center;border-radius:10px;background:#36c5f0;color:#fff;font-weight:700">L</div>
                <div style="margin:14px 0;padding:18px;border-left:4px solid #4a154b;background:#f8f5f8"><strong>Lin</strong><p style="margin:8px 0 0">我已经上传新的深色模式设计稿，请重点检查邮件正文和工具栏对比度。✨</p></div>
                <a href="https://slack.com" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#4a154b;color:#fff;text-decoration:none">在 Slack 中回复</a>
              </div>
            </div>
            """.strip(),
            "2026-08-09T09:58:00.000Z",
            read=True,
            category="social",
        ),
        fixture(
            "github-failure",
            "notifications@github.com",
            "GitHub Actions",
            "[MailEdge] Deploy production failed on main (a82cf19)",
            "Build completed with 1 error: Worker deployment was stopped before publishing assets.",
            "GitHub Actions\n\nDeploy production failed\nBranch: main\nCommit: a82cf19\n\nError: Worker deployment was stopped before publishing assets.",
            """
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:760px;margin:auto;color:#24292f">
              <h1 style="font-size:24px"><span style="color:#cf222e">●</span> Deploy production failed</h1>
              <table style="width:100%;border-collapse:collapse;margin:18px 0"><tr><td style="padding:10px;border:1px solid #d0d7de;color:#57606a">Repository</td><td style="padding:10px;border:1px solid #d0d7de">gentpan/MailEdge</td></tr><tr><td style="padding:10px;border:1px solid #d0d7de;color:#57606a">Commit</td><td style="padding:10px;border:1px solid #d0d7de"><code>a82cf19</code></td></tr></table>
              <pre style="padding:18px;border-radius:10px;background:#0d1117;color:#e6edf3;white-space:pre-wrap;overflow-wrap:anywhere"><span style="color:#ff7b72">ERROR</span> Worker deployment was stopped\nbefore publishing assets.\n\nProcess completed with exit code 1.</pre>
              <p><a href="https://github.com/gentpan/MailEdge/actions" style="color:#0969da">查看工作流日志 →</a></p>
            </div>
            """.strip(),
            "2026-08-09T09:46:00.000Z",
            starred=True,
            category="updates",
        ),
        fixture(
            "zoom-calendar",
            "no-reply@zoom.us",
            "Zoom Calendar",
            "会议邀请：MailEdge v0.2.3 设计评审（今天 15:30）",
            "时间：8 月 9 日 15:30–16:15；会议号：842 0192 6631；组织者：Lin。",
            "会议邀请\n\nMailEdge v0.2.3 设计评审\n时间：2026-08-09 15:30–16:15\n会议号：842 0192 6631",
            """
            <div style="font-family:Arial,'Microsoft YaHei',sans-serif;background:#f7f8fc;padding:24px;color:#182230">
              <div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:28px"><p style="margin:0;color:#2d8cff;font-weight:700">ZOOM CALENDAR</p><h1 style="margin:10px 0 22px">MailEdge v0.2.3 设计评审</h1>
                <table style="width:100%;border-collapse:collapse"><tr><td style="padding:10px 0;color:#667085">日期</td><td style="padding:10px 0">2026 年 8 月 9 日</td></tr><tr><td style="padding:10px 0;color:#667085">时间</td><td style="padding:10px 0">15:30–16:15</td></tr><tr><td style="padding:10px 0;color:#667085">会议号</td><td style="padding:10px 0">842 0192 6631</td></tr></table>
                <p><a href="https://zoom.us" style="display:inline-block;margin-right:8px;padding:10px 18px;border-radius:8px;background:#2d8cff;color:white;text-decoration:none">加入会议</a><a href="https://calendar.google.com" style="display:inline-block;padding:10px 18px;border-radius:8px;border:1px solid #cfd4dc;color:#344054;text-decoration:none">添加到日历</a></p>
              </div>
            </div>
            """.strip(),
            "2026-08-09T09:34:00.000Z",
            category="other",
        ),
        fixture(
            "amazon-shipment",
            "shipment-tracking@amazon.com",
            "Amazon 物流通知",
            "你的订单已发货，预计明天送达",
            "包裹已离开发货中心。配送进度 65%，运单尾号 7392。",
            "你的订单已发货\n\n预计明天送达。运单尾号：7392。",
            """
            <div style="font-family:Arial,'Microsoft YaHei',sans-serif;max-width:680px;margin:auto;color:#17213a"><div style="padding:20px;background:#131921;color:#fff"><strong style="font-size:22px">amazon</strong></div><div style="padding:28px"><h1>你的订单已发货</h1><p>预计 <strong>明天 18:00 前</strong>送达。</p>
              <div style="margin:28px 0;height:10px;border-radius:999px;background:#eaecf0;overflow:hidden"><div style="width:65%;height:100%;background:#ff9900"></div></div>
              <table style="width:100%;border-collapse:collapse"><tr><td style="padding:12px;border-bottom:1px solid #eee">已确认订单</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right;color:#067647">完成</td></tr><tr><td style="padding:12px;border-bottom:1px solid #eee">运输中</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right;color:#ff9900">进行中</td></tr><tr><td style="padding:12px">送达</td><td style="padding:12px;text-align:right;color:#98a2b3">等待</td></tr></table></div></div>
            """.strip(),
            "2026-08-09T09:20:00.000Z",
            read=True,
            category="updates",
        ),
        fixture(
            "notion-digest",
            "team@notion.so",
            "Notion",
            "本周工作区摘要：12 个页面更新、8 条评论和 3 个待办事项",
            "查看团队本周更新最多的页面、最新评论和即将到期的任务。",
            "Notion 工作区摘要\n\n12 个页面更新\n8 条评论\n3 个待办事项",
            """
            <div style="font-family:Arial,'Microsoft YaHei',sans-serif;max-width:720px;margin:auto;color:#191919"><h1 style="font-size:28px">工作区周报</h1><p style="color:#787774">2026 年 8 月 3 日—8 月 9 日</p>
              <table style="width:100%;border-spacing:10px"><tr><td style="padding:20px;border:1px solid #e5e5e5;border-radius:12px"><strong style="font-size:28px">12</strong><br><span style="color:#787774">页面更新</span></td><td style="padding:20px;border:1px solid #e5e5e5;border-radius:12px"><strong style="font-size:28px">8</strong><br><span style="color:#787774">最新评论</span></td><td style="padding:20px;border:1px solid #e5e5e5;border-radius:12px"><strong style="font-size:28px">3</strong><br><span style="color:#787774">待办事项</span></td></tr></table>
              <h2>热门页面</h2><p style="padding:14px;border-radius:8px;background:#f7f6f3">📬 MailEdge 深色模式检查清单</p><p style="padding:14px;border-radius:8px;background:#f7f6f3">🚀 v0.2.3 发布计划</p></div>
            """.strip(),
            "2026-08-09T09:06:00.000Z",
            category="promotions",
        ),
        fixture(
            "native-dark",
            "status@vercel.com",
            "Vercel Status",
            "Production deployment is ready — mailedge-web",
            "Deployment completed in 42 seconds. Preview and production aliases are available.",
            "Production deployment is ready\n\nProject: mailedge-web\nCommit: 19e4c7a\nDuration: 42 seconds",
            """
            <!doctype html><html><head><meta name="color-scheme" content="light dark"><style>
              body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.card{max-width:680px;margin:0 auto;padding:30px;border:1px solid #ddd;border-radius:14px}.log{background:#111;color:#f5f5f5;padding:18px;border-radius:10px}
              @media (prefers-color-scheme:dark){body{background:#0a0a0a;color:#ededed}.card{border-color:#303030}.log{background:#181818;color:#f5f5f5}}
            </style></head><body><div class="card"><p style="letter-spacing:.08em;color:#6b7280">VERCEL DEPLOYMENT</p><h1>Production deployment is ready</h1><p>Your project <strong>mailedge-web</strong> was deployed successfully.</p><div class="log"><code>commit&nbsp;&nbsp;19e4c7a<br>duration&nbsp;42 seconds<br>status&nbsp;&nbsp;&nbsp;READY</code></div><p><a href="https://vercel.com" style="color:#0052d9">Open deployment</a></p></div></body></html>
            """.strip(),
            "2026-08-09T08:52:00.000Z",
            read=True,
            category="updates",
        ),
        fixture(
            "plain-text",
            "support@proton.me",
            "Proton Support",
            "纯文本邮件测试：没有 HTML、图片或品牌样式",
            "这封邮件只有纯文本，用来检查段落、换行、长链接、emoji 和多语言内容。",
            "你好，\n\n这是一封没有 HTML 正文的纯文本邮件。\n\n它包含：\n- 中文与 English mixed content\n- Emoji：📬 🔐 ✅\n- 很长的链接：https://mailedge.io/usage?source=local-visual-regression&theme=light-dark&message=plain-text\n- RTL sample: مرحبا بك في MailEdge\n\n请分别在浅色和深色模式下检查字号、行高、链接换行和正文边距。\n\nProton Support",
            "",
            "2026-08-09T08:40:00.000Z",
            category="other",
        ),
        fixture(
            "outlook-nested-tables",
            "newsletter@outlook.com",
            "Outlook Newsletter",
            "Outlook 嵌套表格兼容性测试：双栏卡片、CTA 与固定宽度内容",
            "使用传统 table 布局模拟 Outlook 邮件，检查嵌套表格、固定宽度、按钮和移动端横向溢出。",
            "Outlook 嵌套表格测试\n\n左栏：发布状态\n右栏：测试通过\n\n此邮件不包含真实附件。",
            """
            <!doctype html><html><body style="margin:0;background:#eef2f7;color:#17213a;font-family:Arial,'Microsoft YaHei',sans-serif">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7"><tr><td align="center" style="padding:28px 12px">
                <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:100%;background:#fff;border:1px solid #d9e0eb">
                  <tr><td style="padding:24px 28px;background:#0052d9;color:#fff;font-size:22px;font-weight:700">Outlook layout fixture</td></tr>
                  <tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:26px">嵌套表格兼容性检查</h1><p style="margin:0 0 22px;line-height:1.7;color:#5d6b82">此正文故意使用邮件客户端常见的 presentation table，不依赖 flex 或 grid。</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
                      <td width="48%" valign="top" style="padding:16px;border:1px solid #d9e0eb"><strong>发布状态</strong><p style="margin:8px 0 0;color:#16803a">测试通过</p></td>
                      <td width="4%">&nbsp;</td>
                      <td width="48%" valign="top" style="padding:16px;border:1px solid #d9e0eb"><strong>渲染模式</strong><p style="margin:8px 0 0;color:#5d6b82">Nested table</p></td>
                    </tr></table>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px"><tr><td style="background:#0052d9;border-radius:6px"><a href="https://mailedge.io" style="display:inline-block;padding:12px 20px;color:#fff;text-decoration:none;font-weight:700">查看测试说明</a></td></tr></table>
                  </td></tr>
                </table>
              </td></tr></table>
            </body></html>
            """.strip(),
            "2026-08-09T08:28:00.000Z",
            read=True,
            category="updates",
        ),
        fixture(
            "fixed-black-canvas",
            "alerts@linear.app",
            "Linear",
            "原生黑底邮件测试：固定深色画布、浅色文字和状态卡片",
            "这封邮件始终使用黑色背景，不跟随系统主题，用于确认应用不会重复反色或破坏品牌颜色。",
            "Linear 深色通知\n\nIssue MAI-221 已完成。\n状态：Done\n优先级：High",
            """
            <!doctype html><html><head><meta name="color-scheme" content="dark"><style>
              html,body{margin:0;background:#050506;color:#f7f7f8;font-family:Arial,sans-serif}.wrap{max-width:680px;margin:0 auto;padding:32px}.card{padding:24px;border:1px solid #303036;border-radius:14px;background:#111114}.muted{color:#a3a3ad}.state{color:#6ee7a5}
            </style></head><body><div class="wrap"><p class="muted" style="letter-spacing:.08em">LINEAR ISSUE UPDATE</p><h1>MAI-221 已完成</h1><div class="card"><p><strong>邮件深色画布回归测试</strong></p><p class="muted">确认固定黑底邮件在浅色和深色应用主题中都保持作者定义的配色。</p><p class="state">● Done</p></div><p><a href="https://linear.app" style="color:#7ca7ff">Open issue</a></p></div></body></html>
            """.strip(),
            "2026-08-09T08:16:00.000Z",
            starred=True,
            category="important",
        ),
        fixture(
            "multilingual-rtl-emoji",
            "hello@mailedge.io",
            "MailEdge 国际化测试",
            "多语言排版：简体中文、English、العربية、עברית 与 emoji 📬✨",
            "同一正文混合 CJK、从右到左文本、emoji 和超长标识符，用于检查换行、方向和字符回退。",
            "你好，MailEdge。\nHello, MailEdge.\nمرحبا بك في MailEdge\nברוכים הבאים ל-MailEdge\nEmoji: 📬✨🔐✅\nIdentifier: mailedge-visual-regression-abcdefghijklmnopqrstuvwxyz-0123456789",
            """
            <article style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.75;max-width:720px;margin:auto;color:#17213a">
              <h1>多语言与方向测试 📬</h1><p>中文段落用于检查 CJK 换行和字体回退。English text checks Latin punctuation and wrapping.</p>
              <section dir="rtl" lang="ar" style="margin:18px 0;padding:16px;border-right:4px solid #0052d9;background:#f3f7ff"><strong>العربية</strong><p>مرحبا بك في MailEdge، هذه رسالة لاختبار اتجاه النص من اليمين إلى اليسار.</p></section>
              <section dir="rtl" lang="he" style="margin:18px 0;padding:16px;border-right:4px solid #7c3aed;background:#f7f3ff"><strong>עברית</strong><p>ברוכים הבאים ל-MailEdge. זהו טקסט לבדיקת כיוון ויישור.</p></section>
              <p style="overflow-wrap:anywhere"><strong>Long identifier:</strong> mailedge-visual-regression-abcdefghijklmnopqrstuvwxyz-0123456789</p><p style="font-size:24px">📬 ✨ 🔐 ✅ 🚀</p>
            </article>
            """.strip(),
            "2026-08-09T08:04:00.000Z",
            category="other",
        ),
    ]
)


def pagination_fixtures() -> list[tuple]:
    """生成可重复写入的分页数据，覆盖多个日期、分类和未读状态。"""
    senders = [
        ("updates@mailedge.io", "MailEdge 产品团队"),
        ("news@gmail.com", "Gmail 产品团队"),
        ("security@hotmail.com", "Microsoft account"),
        ("notice@qq.com", "QQ邮箱通知"),
        ("service@163.com", "163邮箱服务"),
        ("digest@yahoo.com", "Yahoo Mail Digest"),
        ("notifications@github.com", "GitHub Notifications"),
        ("billing@cloudflare.com", "Cloudflare Billing"),
    ]
    categories = ["important", "updates", "promotions", "verification", "social", "other"]
    base = datetime(2026, 8, 4, 17, 30, tzinfo=timezone.utc)
    rows: list[tuple] = []
    for index in range(1, 61):
        sender, name = senders[(index - 1) % len(senders)]
        category = categories[(index - 1) % len(categories)]
        received_at = (base - timedelta(minutes=(index - 1) * 19)).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )
        subject = f"分页测试邮件 {index:02d}：{name} 的收件箱通知与功能更新"
        snippet = (
            f"这是第 {index:02d} 封分页测试邮件，用于验证当前页数量、上一页/下一页按钮、分类徽章和时间对齐。"
        )
        text = (
            f"你好，\n\n这是 MailEdge 本地分页测试邮件 {index:02d}。\n"
            f"发件方：{name} <{sender}>\n分类：{category}\n\n"
            "这封邮件不会发送到真实地址，也不会写入 Cloudflare 线上账号。重复运行脚本会按固定 ID 更新这批数据。"
        )
        html = (
            '<div style="font-family:Arial,Microsoft YaHei,sans-serif;line-height:1.7">'
            f'<p style="color:#2864dc;letter-spacing:.06em">MAIL EDGE PAGINATION FIXTURE {index:02d}</p>'
            f"<h2>{subject}</h2>"
            f"<p>这是一封用于检查分页和邮件列表布局的本地测试邮件，分类为 <strong>{category}</strong>。</p>"
            '<p style="padding:12px;border-radius:8px;background:#f4f6fa">'
            "切换到 25、50 或 100 封每页，确认列表通过 AJAX 加载并且页面不会刷新。"
            "</p></div>"
        )
        rows.append(
            fixture(
                f"pagination-{index:03d}",
                sender,
                name,
                subject,
                snippet,
                text,
                html,
                received_at,
                read=index % 4 == 0,
                starred=index % 11 == 0,
                category=category,
            )
        )
    return rows


MESSAGES.extend(pagination_fixtures())


def validate_fixtures(messages: list[tuple] = MESSAGES) -> None:
    """Fail fast when the deterministic fixture contract drifts."""
    errors: list[str] = []
    ids = [row[0] for row in messages]
    if len(ids) != len(set(ids)):
        errors.append("fixture ID 必须唯一")
    if any(not fixture_id.startswith(SEED_PREFIX) for fixture_id in ids):
        errors.append(f"fixture ID 必须使用 {SEED_PREFIX!r} 前缀")

    categories = {row[12] for row in messages if row[12] is not None}
    unknown_categories = categories - VALID_CATEGORIES
    if unknown_categories:
        errors.append(f"存在未知分类：{sorted(unknown_categories)}")
    if not VALID_CATEGORIES.issubset(categories):
        errors.append(f"分类覆盖不完整：缺少 {sorted(VALID_CATEGORIES - categories)}")

    read_states = {row[10] for row in messages}
    starred_states = {row[11] for row in messages}
    if read_states != {0, 1}:
        errors.append("必须同时包含已读和未读邮件")
    if starred_states != {0, 1}:
        errors.append("必须同时包含星标和非星标邮件")
    if not any(row[7] == "" for row in messages):
        errors.append("必须包含纯文本（无 HTML）邮件")
    if not any(row[7] for row in messages):
        errors.append("必须包含 HTML 邮件")

    for row in messages:
        fixture_id, _internal_id, sender, _name, to_json, subject, _snippet, _html, _text, size, read, starred, _category, received_at = row
        if "@" not in sender or any(character.isspace() for character in sender):
            errors.append(f"{fixture_id}: 发件地址无效")
        if not subject:
            errors.append(f"{fixture_id}: 主题不能为空")
        if size < 0 or read not in {0, 1} or starred not in {0, 1}:
            errors.append(f"{fixture_id}: size/read/starred 数据无效")
        try:
            recipients = json.loads(to_json)
            if recipients != [{"email": DEFAULT_MAILBOX}]:
                errors.append(f"{fixture_id}: 默认收件地址不确定")
        except json.JSONDecodeError:
            errors.append(f"{fixture_id}: to_json 不是合法 JSON")
        try:
            datetime.fromisoformat(received_at.replace("Z", "+00:00"))
        except ValueError:
            errors.append(f"{fixture_id}: received_at 不是 ISO 时间")

    if errors:
        raise ValueError("QA fixture 校验失败：\n- " + "\n- ".join(errors))


def fixture_summary(messages: list[tuple] = MESSAGES) -> dict[str, object]:
    html_documents = [row[7].lower() for row in messages if row[7]]
    return {
        "count": len(messages),
        "categories": {category: sum(row[12] == category for row in messages) for category in sorted(VALID_CATEGORIES)},
        "read": sum(row[10] == 1 for row in messages),
        "unread": sum(row[10] == 0 for row in messages),
        "starred": sum(row[11] == 1 for row in messages),
        "html": sum(bool(row[7]) for row in messages),
        "plainTextOnly": sum(not row[7] and bool(row[8]) for row in messages),
        "coverage": {
            "lightHtml": any("background:#fff" in html or "background:white" in html for html in html_documents),
            "nativeDark": any("prefers-color-scheme:dark" in html.replace(" ", "") for html in html_documents),
            "fixedBlack": any('name="color-scheme" content="dark"' in html for html in html_documents),
            "outlookNestedTables": any('role="presentation"' in html for html in html_documents),
            "wideTable": any("min-width:620px" in html for html in html_documents),
            "codeBlock": any("<pre" in html for html in html_documents),
            "cjk": any("超长邮件正文布局测试" in row[7] for row in messages),
            "rtl": any('dir="rtl"' in html for html in html_documents),
            "emoji": any("📬" in row[6] or "📬" in row[8] for row in messages),
        },
        "attachments": 0,
    }


def seed_database(path: Path, mailbox: str, messages: list[tuple] = MESSAGES) -> int:
    """Replace this suite's local rows in one transaction and return the exact row count."""
    recipient_json = json.dumps([{"email": mailbox.strip().lower()}], ensure_ascii=False)
    sql = """INSERT INTO messages
      (id, internal_id, direction, folder, message_id, in_reply_to, thread_id,
       from_email, from_name, to_json, cc_json, bcc_json, reply_to_json,
       subject, snippet, html, text, headers_json, size, is_read, is_starred,
       status, provider, error, category, ai_summary, received_at)
      VALUES (?, NULL, 'inbound', 'inbox', ?, NULL, ?, ?, ?, ?, '[]', '[]', NULL,
              ?, ?, ?, ?, '{}', ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)"""
    with sqlite3.connect(path) as connection:
        table_names = {
            row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        if "messages" not in table_names:
            raise RuntimeError(f"{path} 不是已初始化的 MailEdge Durable Object（缺少 messages 表）")
        # 清掉旧版本 fixture 以及可能遗留的伪附件行，保证结果与脚本当前定义完全一致。
        if "attachments" in table_names:
            connection.execute("DELETE FROM attachments WHERE message_id GLOB ?", (f"{SEED_PREFIX}*",))
        connection.execute("DELETE FROM messages WHERE id GLOB ?", (f"{SEED_PREFIX}*",))
        for row in messages:
            message_id, internal_id, sender, name, _to_json, subject, snippet, html, text, size, read, starred, category, received_at = row
            connection.execute(
                sql,
                (message_id, internal_id, message_id, sender, name, recipient_json, subject, snippet, html, text, size, read, starred, category, received_at),
            )
        count = connection.execute(
            "SELECT COUNT(*) FROM messages WHERE id GLOB ?", (f"{SEED_PREFIX}*",)
        ).fetchone()[0]
        if count != len(messages):
            raise RuntimeError(f"fixture 写入数量不一致：预期 {len(messages)}，实际 {count}")
    return count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mailbox", default=DEFAULT_MAILBOX, help=f"目标本地信箱（默认：{DEFAULT_MAILBOX}）")
    parser.add_argument("--dry-run", action="store_true", help="只校验并输出覆盖摘要，不访问本地 SQLite")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出摘要，方便自动化检查")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    target_name(args.mailbox)
    validate_fixtures()
    summary = fixture_summary()
    if args.dry_run:
        if args.json:
            print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        else:
            print(f"fixture 校验通过：{summary['count']} 封；不会访问本地数据库")
            print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
        return

    path = find_target(args.mailbox)
    count = seed_database(path, args.mailbox)
    if args.json:
        print(json.dumps({**summary, "database": str(path), "written": count}, ensure_ascii=False, sort_keys=True))
        return
    print(f"已幂等写入 {count} 封本地 QA 邮件：{path}")
    print(
        "覆盖：浅色 HTML、原生 dark、固定黑底、Outlook 嵌套表格、宽表格、代码块、"
        "长 CJK/RTL/emoji、纯文本、全部分类、已读/未读与星标；附件元数据为 0。"
    )


if __name__ == "__main__":
    main()
