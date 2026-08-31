// ============================================================
// Supabase Edge Function: crawler
// 「全能工作台」原生爬虫 —— 直接抓取 + 直接入库
//
// 目的：彻底去掉 GitHub Actions 与 PAT 依赖。
//   旧链路：pg_cron → crawl-scheduler → workflow_dispatch → GitHub Actions → crawler.py
//   新链路：pg_cron → crawler（本函数）→ Supabase
// PAT 过期 / GitHub 拒收等故障从此与本链路无关。
//
// 移植自 crawlers/crawler.py（v3），逻辑逐条对齐：
//   新闻   → 界面新闻四板块
//   诗经   → 古文岛
//   名句   → 古诗文网
//   评论   → 人民日报电子版当日第5版
//   每日一读 → 学习强国公众号（wxpub 列表 + 直连微信页取 og:title）
//
// 性能：原 Python 版「逐条 existing_keys」会产生 60+ 次数据库往返，
// 在 Edge Function 时限内风险大；本版改为「一次性拉列 → 内存比对」，
// 详情页只对新增条目并发抓取（并发 6）。
// ============================================================

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";

// ------------------------------------------------------------
// 环境变量（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入）
// ------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://wentfvkdfecrfelgmdix.supabase.co";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
// 第三方公众号接口凭据：只允许从 Supabase Secrets 读取，禁止硬编码（仓库公开）。
// 在 Supabase 控制台 → Edge Functions → Secrets 添加：
//   WXPUB_APP_ID      = <公众号接口 app_id>
//   WXPUB_SECURE_KEY  = <公众号接口 secure_key>
// 未配置时「每日一读」自动跳过，其余数据源（新闻/诗经/名句/评论）不受影响。
const WXPUB_APP_ID = Deno.env.get("WXPUB_APP_ID") || "";
const WXPUB_SECURE_KEY = Deno.env.get("WXPUB_SECURE_KEY") || "";
const WXPUB_READY = Boolean(WXPUB_APP_ID && WXPUB_SECURE_KEY);

const REST = `${SUPABASE_URL}/rest/v1`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ------------------------------------------------------------
// 通用工具
// ------------------------------------------------------------
const log: string[] = [];
function say(...a: unknown[]) {
  const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  log.push(s);
  console.log(s);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** 北京时间字段（Edge Function 运行在 UTC，必须显式转区，否则版面日期会差一天） */
function bjParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  const hour = parseInt(p.hour || "0", 10) % 24; // hour12:false 时个别实现会返回 24
  return {
    year: p.year || "1970",
    month: p.month || "01",
    day: p.day || "01",
    hour,
    minute: parseInt(p.minute || "0", 10),
    date: `${p.year}-${p.month}-${p.day}`,
    ym: `${p.year}${p.month}`,
  };
}

/** 北京时间往前推 n 天的日期串 */
function bjDateMinus(days: number) {
  const d = new Date(Date.now() - days * 86400_000);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** 并发受限的 map（控制对外请求速率，避免被源站限流） */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) break;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        say(`  ! 并发任务异常: ${e}`);
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/** 带超时的 fetch */
async function http(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string>; method?: string; body?: string } = {}
): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeout ?? 20_000);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers ?? { "User-Agent": UA },
      body: opts.body,
      redirect: "follow",
      signal: ctl.signal,
    });
  } catch (e) {
    say(`  ! 请求失败 ${url.slice(0, 60)}: ${e}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function httpText(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string> } = {}
): Promise<string> {
  const r = await http(url, opts);
  if (!r || !r.ok) return "";
  try {
    return await r.text();
  } catch {
    return "";
  }
}

// ------------------------------------------------------------
// Supabase / PostgREST
// ------------------------------------------------------------
function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sbGet<T = any>(path: string): Promise<T[]> {
  try {
    const r = await http(`${REST}/${path}`, { headers: sbHeaders(), timeout: 25_000 });
    if (!r || !r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

async function sbPost(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    say(`  · ${table} 无新数据，跳过`);
    return 0;
  }
  try {
    const r = await http(`${REST}/${table}`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(rows),
      timeout: 30_000,
    });
    if (r && (r.status === 200 || r.status === 201)) {
      say(`  ✓ 写入 ${table}: ${rows.length} 条`);
      return rows.length;
    }
    const txt = r ? (await r.text().catch(() => "")).slice(0, 200) : "no response";
    say(`  ✗ 写入失败 ${table} ${r?.status}: ${txt}`);
    return 0;
  } catch (e) {
    say(`  ✗ 写入异常 ${table}: ${e}`);
    return 0;
  }
}

async function sbDelete(path: string) {
  try {
    const r = await http(`${REST}/${path}`, { method: "DELETE", headers: sbHeaders(), timeout: 25_000 });
    say(`  · 删除 ${path.split("?")[0]}: ${r?.status}`);
    return r?.status ?? 0;
  } catch (e) {
    say(`  · 删除异常: ${e}`);
    return 0;
  }
}

/** 一次拉整列做内存去重（替代原版逐条 GET，把 60+ 次往返压成 1 次） */
async function existingSet(table: string, col: string, extra = "", limit = 1000): Promise<Set<string>> {
  const rows = await sbGet<Record<string, unknown>>(
    `${table}?select=${col}${extra}&limit=${limit}`
  );
  return new Set(rows.map((r) => String(r[col] ?? "")));
}

// ------------------------------------------------------------
// DOM（对齐 parsel 的 ::text / ::attr 语义）
// ------------------------------------------------------------
function parse(html: string): any {
  try {
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
}

function qsa(root: any, sel: string): any[] {
  if (!root) return [];
  try {
    return Array.from(root.querySelectorAll(sel) ?? []);
  } catch {
    return [];
  }
}

function qs(root: any, sel: string): any {
  if (!root) return null;
  try {
    return root.querySelector(sel);
  } catch {
    return null;
  }
}

/** 等价于 parsel 的 ::text getall（按文本节点逐个收集，已 strip） */
function textNodesOf(node: any, out: string[] = []): string[] {
  if (!node) return out;
  if (node.nodeType === 3) {
    const t = String(node.textContent ?? node.data ?? "").trim();
    if (t) out.push(t);
    return out;
  }
  const kids = node.childNodes;
  if (kids) for (const k of Array.from(kids) as any[]) textNodesOf(k, out);
  return out;
}

/** parsel ' '.join(::text) */
function joinText(el: any): string {
  return textNodesOf(el).join(" ");
}

/** 单元素文本（等价 .css('::text').get()） */
function oneText(el: any): string {
  return (textNodesOf(el)[0] ?? "").trim();
}

/** 空白折叠（等价 Python ' '.join(s.split())） */
function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ============================================================
// 新闻 — 界面新闻四板块
// ============================================================
const NEWS_SECTIONS: Record<string, string> = {
  今日热点: "https://www.jiemian.com/lists/1324kb.html",
  公司头条: "https://www.jiemian.com/lists/1322kb.html",
  财经速览: "https://www.jiemian.com/lists/1326kb.html",
  时事追踪: "https://www.jiemian.com/lists/1325kb.html",
};

function parseJiemian(html: string, category: string, dateStr: string, maxItems = 8) {
  const doc = parse(html);
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const li of qsa(doc, ".columns-right-center__newsflash-item")) {
    const a = qs(li, 'a[href*="/article/"]');
    if (!a) continue;
    let href = a.getAttribute("href") || "";
    if (!href) continue;
    if (!href.startsWith("http")) {
      href = href.startsWith("/") ? `https://www.jiemian.com${href}` : `https://www.jiemian.com/${href}`;
    }
    if (seen.has(href)) continue;

    let title = squash(oneText(qs(li, "h4 a")));
    if (!title || title.length < 6) title = squash(oneText(a));
    if (!title || title.length < 6) continue;

    let summary = "";
    for (const sn of qsa(li, ".columns-right-center__newsflash-content__summary")) {
      const t = squash(oneText(sn));
      if (t && t !== title) {
        summary = t;
        break;
      }
    }

    seen.add(href);
    items.push({
      title: title.slice(0, 80),
      url: href,
      summary: summary.slice(0, 120),
      source: "界面新闻",
      date: dateStr,
      category,
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

async function fetchNews(dateStr: string) {
  say("[新闻] 抓取界面新闻四板块...");
  const all: Record<string, unknown>[] = [];
  const pages = await mapLimit(Object.entries(NEWS_SECTIONS), 4, async ([cat, url]) => {
    const html = await httpText(url, { timeout: 25_000 });
    const items = html ? parseJiemian(html, cat, dateStr) : [];
    say(`  · ${cat}: ${items.length} 条`);
    return items;
  });
  for (const p of pages) if (p) all.push(...p);

  if (!all.length) {
    say("  ! 无新闻数据");
    return 0;
  }
  const cutoff = bjDateMinus(7);
  const have = await existingSet("news", "url", `&date=gte.${cutoff}`, 1000);
  const fresh = all.filter((i) => !have.has(String(i.url)));
  const n = await sbPost("news", fresh);
  await sbDelete(`news?date=lt.${cutoff}`); // 清理 7 天前旧新闻
  return n;
}

// ============================================================
// 诗经 — 古文岛
// ============================================================
async function fetchShijing() {
  say("[诗经] 抓取古文岛...");
  const html = await httpText("https://www.guwendao.net/gushi/shijing.aspx", { timeout: 25_000 });
  if (!html) {
    say("  ✗ 诗经列表页获取失败");
    return 0;
  }
  const doc = parse(html);
  const cands: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const a of qsa(doc, 'a[href*="shiwenv_"]')) {
    const title = squash(oneText(a));
    const href = a.getAttribute("href") || "";
    if (!title || title.length < 2 || title.length > 6) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    cands.push({ title, url: `https://www.guwendao.net${href}` });
    if (cands.length >= 30) break;
  }

  const have = await existingSet("shijing", "title", "", 1000);
  const fresh = cands.filter((c) => !have.has(c.title)); // 只对新条目抓详情
  say(`  · 列表 ${cands.length} 条，新增 ${fresh.length} 条`);

  const items = (
    await mapLimit(fresh, 6, async (c) => {
      const d = await httpText(c.url, { timeout: 20_000 });
      const ds = parse(d);
      let content = c.title;
      const block = qs(ds, ".contson");
      if (block) content = squash(joinText(block)).slice(0, 90) || c.title;

      let section = "诗经";
      for (const el of qsa(ds, ".sons .cont")) {
        for (const t of textNodesOf(el)) {
          if (t.includes("诗经")) {
            section = t;
            break;
          }
        }
        if (section !== "诗经") break;
      }

      let translation = "";
      let annotation = "";
      let analysis = "";
      const blocks = qsa(ds, ".contyishang");
      if (blocks.length) {
        let t0 = joinText(blocks[0]).replace("译文及注释", " ");
        if (t0.includes("译文")) {
          const after = t0.split("译文", 2)[1] ?? "";
          if (after.includes("注释")) {
            translation = after.split("注释", 2)[0].trim().slice(0, 200);
            annotation = after.split("注释", 2)[1].trim().slice(0, 200);
          } else {
            translation = after.trim().slice(0, 200);
          }
        }
        for (const b of blocks.slice(1)) {
          const bt = squash(joinText(b));
          if (bt.startsWith("赏析")) {
            analysis = bt.slice(2).trim().slice(0, 300);
            break;
          }
          if (bt.startsWith("简析") && !analysis) analysis = bt.slice(2).trim().slice(0, 300);
        }
      }
      return {
        title: c.title,
        section,
        content,
        url: c.url,
        translation,
        annotation,
        analysis,
      };
    })
  ).filter(Boolean) as Record<string, unknown>[];

  return await sbPost("shijing", items);
}

// ============================================================
// 名句 — 古诗文网
// ============================================================
async function fetchQuotes() {
  say("[名句] 抓取古诗文网...");
  const html = await httpText("https://www.gushiwen.cn/mingjus/", { timeout: 25_000 });
  if (!html) {
    say("  ✗ 名句列表页获取失败");
    return 0;
  }
  const doc = parse(html);
  const cands: { quote: string; author: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const cont of qsa(doc, ".sons .cont")) {
    const links = qsa(cont, "a");
    if (!links.length) continue;
    const quote = squash(oneText(links[0]));
    const author = links.length > 1 ? squash(oneText(links[links.length - 1])) : "";
    const href = links[0].getAttribute("href") || "";
    if (!quote || quote.length < 5 || seen.has(quote)) continue;
    seen.add(quote);
    const url = href ? (href.startsWith("http") ? href : `https://www.gushiwen.cn${href}`) : "";
    cands.push({ quote, author: author || "佚名", url });
    if (cands.length >= 30) break;
  }

  const have = await existingSet("quotes", "quote", "", 1000);
  const fresh = cands.filter((c) => !have.has(c.quote));
  say(`  · 列表 ${cands.length} 条，新增 ${fresh.length} 条`);

  const items = (
    await mapLimit(fresh, 6, async (c) => {
      const item: Record<string, unknown> = {
        quote: c.quote,
        author: c.author,
        source: "古诗文网",
        translation: "",
        annotation: "",
        analysis: "",
        url: c.url,
      };
      if (!c.url) return item;
      const d = await httpText(c.url, { timeout: 20_000 });
      const ds = parse(d);
      for (const p of qsa(ds, ".contson p")) {
        const raw = textNodesOf(p).join("").trim();
        const strip = (s: string) => s.replace(/^[：:，,。\s\t]+/, "").slice(0, 200);
        if (raw.startsWith("译文")) item.translation = strip(raw.slice(2));
        else if (raw.startsWith("注释")) item.annotation = strip(raw.slice(2));
        else if (raw.startsWith("赏析")) item.analysis = strip(raw.slice(2));
      }
      return item;
    })
  ).filter(Boolean) as Record<string, unknown>[];

  return await sbPost("quotes", items);
}

// ============================================================
// 评论 — 人民日报电子版当日第5版
// ============================================================
async function fetchComments(bj: { ym: string; day: string; date: string }) {
  say("[评论] 抓取人民日报电子版当日第5版...");
  const pageUrl = `https://paper.people.com.cn/rmrb/pc/layout/${bj.ym}/${bj.day}/node_05.html`;
  const html = await httpText(pageUrl, { timeout: 25_000 });
  if (!html) {
    say(`  ! 版面页获取失败 ${pageUrl}`);
    return 0;
  }
  const doc = parse(html);
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const li of qsa(doc, ".news li")) {
    const a = qs(li, "a");
    if (!a) continue;
    const title = squash(oneText(a));
    const href = a.getAttribute("href") || "";
    if (!title || title.length < 6 || seen.has(title)) continue;
    if (["本版责编", "图片报道", "本版邮箱", "漫画", "广告"].some((k) => title.includes(k))) continue;
    seen.add(title);
    let url = "";
    if (href) {
      try {
        url = new URL(href, pageUrl).href;
      } catch {
        url = href;
      }
    }
    items.push({ title, type: "人民日报·评论", url, date: bj.date, author: "", subtitle: "" });
    if (items.length >= 8) break;
  }

  if (!items.length) {
    say("  ! 未抓到评论，跳过清理（保留旧数据）");
    return 0;
  }
  const top = items.slice(0, 5);
  await sbDelete("comments?id=neq.00000000-0000-0000-0000-000000000000");
  return await sbPost("comments", top);
}

// ============================================================
// 每日一读 — 学习强国公众号
// ============================================================
async function wxpubList(name: string, start: string, end: string) {
  if (!WXPUB_READY) return { urls: [] as string[], dates: [] as string[] };
  try {
    const r = await http("https://wxpub.aibana.art/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: WXPUB_APP_ID,
        secure_key: WXPUB_SECURE_KEY,
        name,
        startDate: start,
        endDate: end,
      }),
      timeout: 40_000,
    });
    if (r && r.ok) {
      const d = await r.json();
      return { urls: (d.urls ?? []) as string[], dates: (d.date ?? []) as string[] };
    }
    say(`  ! wxpub 列表 ${r?.status}`);
  } catch (e) {
    say(`  ! wxpub 列表异常: ${e}`);
  }
  return { urls: [] as string[], dates: [] as string[] };
}

/** 直连微信原文页取 og:title + 简介 */
async function wxMeta(url: string): Promise<{ title: string; summary: string }> {
  const html = await httpText(url, {
    timeout: 25_000,
    headers: { "User-Agent": UA, Referer: "https://mp.weixin.qq.com/" },
  });
  if (!html) return { title: "", summary: "" };
  const meta = (prop: string): string => {
    const m =
      new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`).exec(html) ||
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`).exec(html);
    return m ? m[1] : "";
  };
  const title = meta("og:title");
  let summary = meta("og:description");
  if (!summary) {
    const mc = /id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/.exec(html);
    if (mc) summary = squash(mc[1].replace(/<[^>]+>/g, ""));
  }
  return { title, summary: (summary || "").slice(0, 90) };
}

async function fetchDailyRead(dateStr: string) {
  say("[每日一读] 抓取学习强国公众号...");
  if (!WXPUB_READY) {
    say("  ! 未配置 WXPUB_APP_ID / WXPUB_SECURE_KEY，跳过（不影响其它数据源）");
    return 0;
  }
  const todayHave = await existingSet("daily_read", "date", "", 200);
  if (todayHave.has(dateStr)) {
    say("  · 今日已抓取，跳过");
    return 0;
  }
  const { urls, dates } = await wxpubList("学习强国", bjDateMinus(2), dateStr);
  if (!urls.length) {
    say("  ! 未获取到文章列表");
    return 0;
  }
  const paired = urls
    .map((u, i) => ({ u, d: dates[i] ?? "" }))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

  const haveUrl = await existingSet("daily_read", "url", "", 200);
  for (const { u } of paired) {
    if (haveUrl.has(u)) continue;
    const { title, summary } = await wxMeta(u);
    if (title && title.includes("每日一读")) {
      return await sbPost("daily_read", [
        { date: dateStr, title: title.slice(0, 120), summary, url: u, source: "学习强国" },
      ]);
    }
  }
  say("  ! 近 3 天未找到「每日一读」文章（可能尚未发布，下个整点再试）");
  return 0;
}

// ============================================================
// 抓取主体（可从 handler 同步 await，也可交给 waitUntil 后台跑）
// ============================================================
async function runCrawl(force: boolean) {
  log.length = 0;
  const bj = bjParts();
  say(
    `[${bj.date} ${String(bj.hour).padStart(2, "0")}:${String(bj.minute).padStart(2, "0")}] 开始爬取（北京时间 ${bj.hour} 点档）`
  );

  const res: Record<string, number> = {};
  const t0 = Date.now();

  try {
    if (force || ![5, 6, 12, 17].includes(bj.hour)) {
      // 全量补抓（手动 / 延迟补跑）
      res.news = await fetchNews(bj.date);
      res.shijing = await fetchShijing();
      res.quotes = await fetchQuotes();
      res.comments = await fetchComments(bj);
      res.daily_read = await fetchDailyRead(bj.date);
    } else if (bj.hour === 5) {
      res.shijing = await fetchShijing();
      res.quotes = await fetchQuotes();
      res.daily_read = await fetchDailyRead(bj.date);
    } else {
      res.news = await fetchNews(bj.date);
      res.comments = await fetchComments(bj);
      res.shijing = await fetchShijing();
      res.quotes = await fetchQuotes();
      res.daily_read = await fetchDailyRead(bj.date);
    }
  } catch (e) {
    say(`✗ 顶层异常: ${e}`);
    return { ok: false, error: String(e), results: res, hour: bj.hour, date: bj.date, log: [...log] };
  }

  const ms = Date.now() - t0;
  say(`爬取完成! 耗时 ${(ms / 1000).toFixed(1)}s`);
  return { ok: true, hour: bj.hour, date: bj.date, elapsed_ms: ms, results: res, log: [...log] };
}

// ============================================================
// 入口
//
// 默认「立即返回 + 后台继续跑」：pg_net 的等待超时只有 5 秒，而抓取约 20 秒，
// 同步等待会让 pg_cron 侧记录不到响应（status_code 为 NULL）。
// 用 EdgeRuntime.waitUntil 把任务挂到后台，函数秒回 200，抓取照常完成。
// 手动验证时加 ?sync=1 即可同步等待并拿到完整日志。
// ============================================================
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  // 鉴权：CRON_SECRET 由 Supabase Secrets 注入；若未设置则拒绝（避免函数裸奔）
  if (!CRON_SECRET) {
    return json({ ok: false, error: "CRON_SECRET not configured on server" }, 500);
  }
  const url = new URL(req.url);
  const got = req.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (got !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!SERVICE_KEY) {
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  }

  const force = url.searchParams.get("all") === "1";
  const sync = url.searchParams.get("sync") === "1";

  if (sync || typeof EdgeRuntime === "undefined") {
    return json(await runCrawl(force));
  }

  EdgeRuntime.waitUntil(runCrawl(force));
  const bj = bjParts();
  return json({
    ok: true,
    mode: "async",
    hour: bj.hour,
    date: bj.date,
    message: "抓取已在后台启动，日志见 Supabase 控制台 → Edge Functions → crawler → Logs",
  });
});
