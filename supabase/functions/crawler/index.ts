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
//   新闻   → RSS 聚合（中新网·时政滚动 为主，少数派·数字生活 点缀）
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

/**
 * GET 一页数据。
 * ⚠️ 返回 null 表示「请求失败」（网络/超时/非 2xx），与「确实没有数据」（[]）严格区分。
 * 历史坑：旧实现失败时静默返回 []，导致 existingSet 拿到空集 → 去重失效 →
 *         同一批数据被每枪 cookie 反复全量写入（诗经重复 6 轮、新闻重复 218 条均因此）。
 */
async function sbGet<T = any>(path: string): Promise<T[] | null> {
  try {
    const r = await http(`${REST}/${path}`, { headers: sbHeaders(), timeout: 25_000 });
    if (!r || !r.ok) return null;
    return (await r.json()) as T[];
  } catch {
    return null;
  }
}

async function sbPost(table: string, rows: Record<string, unknown>[], onConflict?: string) {
  if (!rows.length) {
    say(`  · ${table} 无新数据，跳过`);
    return 0;
  }
  // conflict 时用 upsert-ignore 语义：即使应用层去重失效，数据库唯一约束也会兜住重复行
  const doPost = async (conflict?: string) => {
    const qs = conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : "";
    const pref = conflict ? "return=minimal,resolution=ignore-duplicates" : "return=minimal";
    return await http(`${REST}/${table}${qs}`, {
      method: "POST",
      headers: sbHeaders({ Prefer: pref }),
      body: JSON.stringify(rows),
      timeout: 30_000,
    });
  };
  try {
    let r = await doPost(onConflict);
    if (r && (r.status === 200 || r.status === 201)) {
      say(`  ✓ 写入 ${table}: ${rows.length} 条${onConflict ? "（唯一约束去重）" : ""}`);
      return rows.length;
    }
    // 目标列还没建唯一约束时 PostgREST 返回 400/409 → 自动降级为普通插入，避免整批丢失
    if (onConflict && r && (r.status === 400 || r.status === 409)) {
      say(`  · ${table} 尚无唯一约束(${onConflict})，降级为普通插入`);
      r = await doPost();
      if (r && (r.status === 200 || r.status === 201)) {
        say(`  ✓ 写入 ${table}: ${rows.length} 条`);
        return rows.length;
      }
    }
    const txt = r ? (await r.text().catch(() => "")).slice(0, 200) : "no response";
    say(`  ✗ 写入失败 ${table} ${r?.status}: ${txt}`);
    return 0;
  } catch (e) {
    say(`  ✗ 写入异常 ${table}: ${e}`);
    return 0;
  }
}

/** PATCH 更新（用于名句释义回填等增量修复） */
async function sbPatch(table: string, filter: string, data: Record<string, unknown>) {
  try {
    const r = await http(`${REST}/${table}?${filter}`, {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(data),
      timeout: 25_000,
    });
    return r?.status ?? 0;
  } catch (e) {
    say(`  ✗ PATCH 异常 ${table}: ${e}`);
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
/**
 * 分页取全表（绕过 Supabase PostgREST 服务端 max-rows=1000 硬截断）。
 * ⚠️ 实测 limit=20000 也只返回 1000 行，必须用 limit+offset 循环分页。
 */
async function sbGetAll(
  table: string,
  select: string,
  extra = "",
  pageSize = 1000,
  maxRows = 30000
): Promise<Record<string, unknown>[] | null> {
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const rows = await sbGet<Record<string, unknown>>(
      `${table}?select=${select}${extra}&limit=${pageSize}&offset=${offset}`
    );
    if (rows === null) return null; // 任一页失败 = 整体失败，交由调用方决策（绝不当作空集）
    out.push(...rows);
    if (rows.length < pageSize) break; // 最后一页不满页 = 取完
  }
  return out;
}

async function existingSet(table: string, col: string, extra = "", limit = 30000): Promise<Set<string>> {
  // ⚠️ 必须分页取全量：曾用 limit=1000（且服务端 max-rows=1000 硬截断），
  // quotes 表超千后去重失效，同日多轮 cron 全部重复入库（2026-09-09 实测）
  const rows = await sbGetAll(table, col, extra, 1000, limit);
  // ⚠️ 读取失败必须抛错，不能退化成空集：空集会让「全部数据」都被判定为新增 → 整批重复写入
  if (rows === null) {
    throw new Error(`existingSet(${table}.${col}) 读取失败，为避免重复入库已中止本轮`);
  }
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
// 新闻 — 多源聚合（中新网·时政滚动 为主源，ZAKER·myzaker + 少数派·数字生活 为点缀）
// 主源中新网（2026-09-07c→d 回归）：chinanews.com.cn RSS 滚动新闻，每日 ~30 条，稳定可靠。
// 点缀说明：
//   · ZAKER myzaker.com 首页 SSR（~7 条/天静态可爬，同文多链须按 title 去重）；
//   · 少数派 sspai.com 官方 JSON API（/api/v1/article/index/page/get），结构化字段全、免解析、云端出口稳定。
//       - 同一接口返回「少数派」常规文章 + 「派早报」（字段 morning_paper_title 非空即为早报）
//       - 按 released_time 倒序，天然覆盖早报发布时间不固定的问题（无需多枪）
// 人民网/新华网官方 RSS 均已冻结（人民网停在 2016/2025、新华网无日期停在 2022），不可用。
// ============================================================
const NEWS_FEEDS: { name: string; url: string; max: number; type: "rss" | "sspai_api" | "zaker_home" }[] = [
  // 主源：中新网滚动新闻
  { name: "中新网", url: "https://www.chinanews.com.cn/rss/scroll-news.xml", max: 30, type: "rss" },
  // 点缀：ZAKER 综合门户 + 少数派数字生活（统一走官方 JSON API，按 morning_paper_title 拆源）
  { name: "ZAKER", url: "https://www.myzaker.com/", max: 10, type: "zaker_home" },
  // 少数派：官方 JSON API（limit=20 足够覆盖每日新增 + 早报）
  { name: "少数派", url: "https://sspai.com/api/v1/article/index/page/get?limit=20&offset=0&created_at=0", max: 8, type: "sspai_api" },
  // 派早报：复用同一 API，解析器按 morning_paper_title 过滤；max 单独控制上限
  { name: "派早报", url: "https://sspai.com/api/v1/article/index/page/get?limit=20&offset=0&created_at=0", max: 5, type: "sspai_api" },
];

/**
 * 解析少数派官方 JSON API（/api/v1/article/index/page/get）。
 * 同一接口返回「少数派」常规文章 + 「派早报」（标题以 "派早报" 开头即为早报）。
 * 入参 source 为 "少数派" 或 "派早报"，按标题前缀自动过滤。
 * 返回字段与原 HTML 解析器兼容：title, url, summary, source, date, category。
 */
function parseSspaiApi(jsonText: string, source: string, dateStr: string, maxItems: number): Record<string, unknown>[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const list = (data as Record<string, unknown>)?.data;
  if (!Array.isArray(list)) return [];

  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const it of list) {
    const obj = it as Record<string, unknown>;
    const id = obj.id;
    const title = String(obj.title || "").trim();
    const summary = String(obj.summary || "").trim();
    if (!id || !title || title.length < 4) continue;
    const url = `https://sspai.com/post/${id}`;
    if (seen.has(url)) continue;

    // 按 source 过滤：派早报只取标题以 "派早报" 开头；少数派跳过早报
    const isMorning = title.startsWith("派早报");
    if (source === "派早报" && !isMorning) continue;
    if (source === "少数派" && isMorning) continue;

    seen.add(url);
    items.push({
      title: title.slice(0, 80),
      url,
      summary: summary.slice(0, 200),
      source,
      date: dateStr,
      category: source,
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

/** 解析 ZAKER(myzaker.com) 首页 SSR：遍历所有含 .article-title 的 <a>（标题/来源/时间，无正文摘要） */
function parseZakerHome(html: string, source: string, dateStr: string, maxItems: number): Record<string, unknown>[] {
  const doc = parse(html);
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const a of qsa(doc, "a")) {
    const t = qs(a, ".article-title");
    if (!t) continue; // 仅保留真正含文章标题的链接（跳过导航/页脚等）
    let href = (a.getAttribute("href") || "").trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    if (href.startsWith("//")) href = "https:" + href; // 协议相对 → https
    if (!href.startsWith("http")) continue; // 跳过站内相对链接（频道/标签等）
    const title = squash(oneText(t));
    if (!title || title.length < 6) continue;
    // ⚠️ 必须按 title 去重：myzaker 同一文章有多个 href 格式（l.php 跳转 vs /article/ 直链），
    //    仅靠 href 去重会导致同文不同链重复入库
    if (seen.has(title)) continue;
    seen.add(title);
    // 原始媒体来源（人民日报/新华社等）回填到 summary；首页无正文摘要
    const aitem = a.parentElement;
    const fromEl = aitem ? qs(aitem, ".article-from") : null;
    const from = fromEl ? squash(oneText(fromEl)) : "";
    items.push({
      title: title.slice(0, 80),
      url: href,
      summary: from ? `来源：${from}` : "",
      source,
      date: dateStr,
      category: source,
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

/** 解码 HTML 实体 + 剥离标签（RSS description 常含 HTML/CDATA） */
function decodeNewsText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rssTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1] : "";
}

function parseRss(xml: string, source: string, dateStr: string, max: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = itemRe.exec(xml)) !== null && i < max) {
    const block = m[1];
    const title = decodeNewsText(rssTag(block, "title"));
    let link = rssTag(block, "link").trim();
    if (!link) link = rssTag(block, "guid").trim();
    const desc = decodeNewsText(rssTag(block, "description"));
    if (!title || !link) continue;
    out.push({
      title: title.slice(0, 80),
      url: link,
      summary: desc.slice(0, 200),
      source,
      date: dateStr,
      category: source,
    });
    i++;
  }
  return out;
}

// 新闻源英文标识 → 实际 source 名（供 ?feeds= 参数使用，避免 URL 里传中文；支持逗号分隔多源）
// sspai：官方 JSON API 单次请求同时返回「少数派」常规文章 + 「派早报」（按 morning_paper_title 拆分）
const FEED_ALIASES: Record<string, string[]> = {
  zaker: ["ZAKER"],
  chinanews: ["中新网"],
  sspai: ["少数派", "派早报"],
  paizaobao: ["派早报"],
};

async function fetchNews(dateStr: string, onlySources?: string[]) {
  say(
    `[新闻] 抓取多源聚合（中新网为主 + ZAKER/少数派点缀 + 派早报置顶）${
      onlySources?.length ? `，仅抓 ${onlySources.join("/")}` : ""
    }...`
  );
  let feeds = NEWS_FEEDS;
  if (onlySources?.length) {
    feeds = NEWS_FEEDS.filter((f) => onlySources.includes(f.name));
    if (!feeds.length) {
      say(`  ! 未知新闻源标识: ${onlySources.join("/")}（可用: chinanews / zaker / sspai / paizaobao）`);
      return 0;
    }
  }
  const all: Record<string, unknown>[] = [];
  const results = await mapLimit(feeds, 2, async (f) => {
    let items: Record<string, unknown>[] = [];
    if (f.type === "zaker_home") {
      // ZAKER：首页 SSR HTML（综合门户聚合，标题/来源/时间，无正文摘要）
      const html = await httpText(f.url, { timeout: 25_000, headers: { "User-Agent": UA } });
      items = html ? parseZakerHome(html, f.name, dateStr, f.max) : [];
    } else if (f.type === "sspai_api") {
      // 少数派 / 派早报：官方 JSON API（结构化、免解析、云端出口稳定）
      // 同一接口返回两类数据，解析器按 morning_paper_title 自动拆分
      const jsonText = await httpText(f.url, { timeout: 15_000, headers: { "User-Agent": UA } });
      items = jsonText ? parseSspaiApi(jsonText, f.name, dateStr, f.max) : [];
    } else {
      const xml = await httpText(f.url, { timeout: 25_000 });
      items = xml ? parseRss(xml, f.name, dateStr, f.max) : [];
    }
    say(`  · ${f.name}: ${items.length} 条`);
    return items;
  });
  for (const p of results) if (p) all.push(...p);

  // 批内 URL 去重保险：同一轮内多源/解析器重复出现的链接只保留第一条
  const batchSeen = new Set<string>();
  const deduped = all.filter((it) => {
    const u = String(it.url || "");
    if (!u || batchSeen.has(u)) return false;
    batchSeen.add(u);
    return true;
  });
  if (deduped.length !== all.length) say(`  · 批内去重: ${all.length} → ${deduped.length}`);

  if (!deduped.length) {
    say("  ! 无新闻数据");
    return 0;
  }
  const cutoff = bjDateMinus(7);
  // ⚠️ 不要传 limit 覆盖默认值：news 表已过千行（1350），写 1000 会导致
  // 只读前 1000 行、最新数据不在去重集合 → 同日多轮 cron 全部重复入库（2026-09-10 实测）
  const have = await existingSet("news", "url", `&date=gte.${cutoff}`);
  const fresh = deduped.filter((it) => !have.has(String(it.url)));
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

  const have = await existingSet("shijing", "title");
  const fresh = cands.filter((c) => !have.has(c.title)); // 只对新条目抓详情
  say(`  · 列表 ${cands.length} 条，新增 ${fresh.length} 条`);

  let skipped = 0;
  const items = (
    // 并发降到 3：古文岛对并发详情页请求较敏感，6 并发时约 1/3 会被限流返回空壳页
    await mapLimit(fresh, 3, async (c) => {
      // 拉取正文：首次解析失败多半是源站限流误伤（并发抓详情页时常见），
      // 等待 + 抖动后重试一次，避免把好条目误判成坏条目丢掉。
      let ds: any = null;
      let body = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 1200 + Math.random() * 900));
        const d = await httpText(c.url, { timeout: 20_000 });
        if (!d) continue;
        const dr = parse(d);
        const block = qs(dr, ".contson");
        const b = block ? squash(joinText(block)) : "";
        if (b.length >= 8) {
          ds = dr;
          body = b;
          break;
        }
      }
      // 🔴 质量门禁：两轮都解析不出正文 → 跳过，绝不退化成标题入库。
      //    历史坑：旧实现用 `content = c.title` 兜底，导致「樛木」这类只有标题、
      //    无正文无译文的坏记录混进表内 —— 这正是前端「诗经显示不全」的直接原因。
      if (!ds) {
        skipped++;
        return null;
      }
      const content = body.slice(0, 90);

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

  if (skipped) say(`  · 跳过解析失败/正文为空条目: ${skipped} 条（拒绝坏数据入库）`);
  if (!items.length) {
    say("  · 无有效诗经数据");
    return 0;
  }
  // 传 onConflict=title：若 DB 已建唯一约束则双保险（应用层去重失效也不会重复行）
  return await sbPost("shijing", items, "title");
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

  const have = await existingSet("quotes", "quote");
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
      await fillQuoteDetail(item, c.url);
      return item;
    })
  ).filter(Boolean) as Record<string, unknown>[];

  const written = await sbPost("quotes", items);

  // ── 存量释义回填：每次运行顺带修复最旧的 6 条全空记录（历史抓取失败/反爬拦截）──
  try {
    const empties = (await sbGet<{ id: string; url: string }[]>(
      "quotes?select=id,url&translation=eq.&annotation=eq.&analysis=eq.&url=neq.&order=crawled_at.asc&limit=6"
    )) ?? [];
    if (empties.length) {
      say(`  · 回填存量空释义 ${empties.length} 条...`);
      let fixed = 0;
      for (const row of empties) {
        if (!row.url) continue;
        const patch: Record<string, unknown> = {};
        const tmp: Record<string, unknown> = { translation: "", annotation: "", analysis: "" };
        await fillQuoteDetail(tmp, row.url);
        if (tmp.translation) patch.translation = tmp.translation;
        if (tmp.annotation) patch.annotation = tmp.annotation;
        if (tmp.analysis) patch.analysis = tmp.analysis;
        if (Object.keys(patch).length) {
          await sbPatch("quotes", `id=eq.${row.id}`, patch);
          fixed++;
        }
      }
      if (fixed) say(`  ✓ 回填成功 ${fixed} 条`);
    }
  } catch (e) {
    say(`  ! 回填异常（不影响主流程）: ${e}`);
  }

  return written;
}

/**
 * 抓取名句详情页并解析译文/注释/赏析，写回 item。
 * 解析全空时视为被反爬拦截/页面异常，延迟后重试一次。
 */
async function fillQuoteDetail(item: Record<string, unknown>, url: string) {
  const parseDetail = (html: string) => {
    const ds = parse(html);
    for (const p of qsa(ds, ".contson p")) {
      const raw = textNodesOf(p).join("").trim();
      const strip = (s: string) => s.replace(/^[：:，,。\s\t]+/, "").slice(0, 200);
      if (raw.startsWith("译文")) item.translation = strip(raw.slice(2));
      else if (raw.startsWith("注释")) item.annotation = strip(raw.slice(2));
      else if (raw.startsWith("赏析")) item.analysis = strip(raw.slice(2));
    }
  };
  const d = await httpText(url, { timeout: 20_000 });
  if (d) parseDetail(d);
  if (!item.translation && !item.annotation && !item.analysis) {
    // 首次解析全空 → 等待后重试一次（降低并发反爬误伤）
    await new Promise((r) => setTimeout(r, 1500));
    const d2 = await httpText(url, { timeout: 20_000 });
    if (d2) parseDetail(d2);
  }
}

/**
 * 清理 quotes 表重复行（?dedupe=quotes 触发，一次性维护动作）。
 * 背景：existingSet 曾用 limit=1000，表超千后去重失效，同日多轮 cron 重复入库。
 * 策略：按 quote 分组，保留「释义字段非空数最多」的一条（平局保留 id 最小=最早），
 *      其余分批删除。返回删除数。
 */
async function dedupeQuotes(): Promise<{ removed: number }> {
  say("[维护] 清理重复名句...");
  const rows = (await sbGetAll(
    "quotes",
    "id,quote,translation,annotation,analysis",
    "",
    1000,
    30000
  )) as {
    id: string;
    quote: string;
    translation: string;
    annotation: string;
    analysis: string;
  }[] | null;
  if (!rows) throw new Error("读取 quotes 失败");
  const groups = new Map<string, { id: string; score: number }>();
  for (const r of rows) {
    const score = (r.translation ? 1 : 0) + (r.annotation ? 1 : 0) + (r.analysis ? 1 : 0);
    const cur = groups.get(r.quote);
    if (!cur || score > cur.score) groups.set(r.quote, { id: r.id, score });
    // 平局保留先出现的（sbGet 未排序时默认主键序，先出现=更早插入）
  }
  const keep = new Set([...groups.values()].map((v) => v.id));
  const toDelete = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
  say(`  · 总 ${rows.length} 条，保留 ${keep.size} 组，待删 ${toDelete.length} 条`);
  let removed = 0;
  const BATCH = 100;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    const inList = batch.join(",");
    const r = await http(`${REST}/quotes?id=in.(${inList})`, {
      method: "DELETE",
      headers: sbHeaders({ Prefer: "return=representation" }),
      timeout: 30_000,
    });
    if (r && (r.status === 200 || r.status === 204)) removed += batch.length;
    else say(`  ! 批次删除失败 status=${r?.status}`);
  }
  say(`  ✓ 已删除重复 ${removed} 条`);
  return { removed };
}

/**
 * 清理 news 表重复行（?dedupe=news 触发，一次性维护动作）。
 * 背景：fetchNews 的 existingSet 曾传 limit=1000，news 表过千行后去重失效，
 *      同日 4 枪 cron 重复入库（2026-09-10 实测 1350 行、中新网 26/30 重复）。
 * 策略：按 url 分组，保留 crawled_at 最早的一条，其余分批删除。返回删除数。
 */
async function dedupeNews(): Promise<{ removed: number }> {
  say("[维护] 清理重复新闻...");
  const rows = (await sbGetAll("news", "id,url,crawled_at", "", 1000, 30000)) as {
    id: string;
    url: string;
    crawled_at: string;
  }[] | null;
  if (!rows) throw new Error("读取 news 失败");
  const groups = new Map<string, { id: string; at: string }>();
  for (const r of rows) {
    const cur = groups.get(r.url);
    if (!cur || (r.crawled_at || "") < cur.at) groups.set(r.url, { id: r.id, at: r.crawled_at || "" });
  }
  const keep = new Set([...groups.values()].map((v) => v.id));
  const toDelete = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
  say(`  · 总 ${rows.length} 条，保留 ${keep.size} 组，待删 ${toDelete.length} 条`);
  let removed = 0;
  const BATCH = 100;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    const inList = batch.join(",");
    const r = await http(`${REST}/news?id=in.(${inList})`, {
      method: "DELETE",
      headers: sbHeaders({ Prefer: "return=representation" }),
      timeout: 30_000,
    });
    if (r && (r.status === 200 || r.status === 204)) removed += batch.length;
    else say(`  ! 批次删除失败 status=${r?.status}`);
  }
  say(`  ✓ 已删除重复 ${removed} 条`);
  return { removed };
}

/**
 * 清理 shijing 表重复行（?dedupe=shijing 触发，一次性维护动作）。
 * 背景：existingSet 读取失败时旧实现静默返回空集 → 每枪 30 条全量重复写入
 *      （2026-09-14 实测 181 行里只有 30 个唯一 title，最多重复 7 次）。
 * 策略：按 title 分组，保留「正文最长 + 释义字段非空数最多」的一条，其余分批删除。
 */
async function dedupeShijing(): Promise<{ removed: number; kept: number; total: number }> {
  say("[维护] 清理重复诗经...");
  const rows = (await sbGetAll(
    "shijing",
    "id,title,content,translation,annotation,analysis",
    "",
    1000,
    30000
  )) as
    | {
        id: string;
        title: string;
        content: string;
        translation: string;
        annotation: string;
        analysis: string;
      }[]
    | null;
  if (!rows) throw new Error("读取 shijing 失败");

  // score：正文长度优先（质量门禁后正文必然完整），其次释义完整度
  const score = (r: (typeof rows)[number]) =>
    Math.min((r.content || "").length, 200) * 10 +
    (r.translation ? 1 : 0) +
    (r.annotation ? 1 : 0) +
    (r.analysis ? 1 : 0);
  const groups = new Map<string, { id: string; score: number }>();
  for (const r of rows) {
    const s = score(r);
    const cur = groups.get(r.title);
    if (!cur || s > cur.score) groups.set(r.title, { id: r.id, score: s });
  }
  const keep = new Set([...groups.values()].map((v) => v.id));
  const toDelete = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
  say(`  · 总 ${rows.length} 条，保留 ${keep.size} 组，待删 ${toDelete.length} 条`);

  let removed = 0;
  const BATCH = 100;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    const r = await http(`${REST}/shijing?id=in.(${batch.join(",")})`, {
      method: "DELETE",
      headers: sbHeaders({ Prefer: "return=representation" }),
      timeout: 30_000,
    });
    if (r && (r.status === 200 || r.status === 204)) removed += batch.length;
    else say(`  ! 批次删除失败 status=${r?.status}`);
  }
  say(`  ✓ 已删除重复 ${removed} 条，保留 ${keep.size} 条`);
  return { removed, kept: keep.size, total: rows.length };
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
async function runCrawl(force: boolean, onlyFeed?: string[], onlySource?: string) {
  log.length = 0;
  const bj = bjParts();
  const feedLabel = onlyFeed?.length ? onlyFeed.join("/") : "";
  const scopeLabel = onlySource ? `仅 ${onlySource}` : feedLabel;
  say(
    `[${bj.date} ${String(bj.hour).padStart(2, "0")}:${String(bj.minute).padStart(2, "0")}] 开始爬取（北京时间 ${bj.hour} 点档）${scopeLabel ? `，指定源: ${scopeLabel}` : ""}`
  );

  const res: Record<string, number> = {};
  const t0 = Date.now();

  // 每个数据源独立兜底：某一源读取失败（如 existingSet 抛错）不应拖垮其它源
  const safe = async (name: string, fn: () => Promise<number>) => {
    try {
      res[name] = await fn();
    } catch (e) {
      res[name] = -1;
      say(`  ✗ ${name} 本轮跳过: ${e instanceof Error ? e.message : e}`);
    }
  };

  try {
    if (onlySource) {
      // 单源重抓（维护入口 ?only=shijing / quotes / news / comments / daily_read）
      const table: Record<string, () => Promise<number>> = {
        news: () => fetchNews(bj.date),
        shijing: () => fetchShijing(),
        quotes: () => fetchQuotes(),
        comments: () => fetchComments(bj),
        daily_read: () => fetchDailyRead(bj.date),
      };
      const fn = table[onlySource];
      if (!fn) throw new Error(`unknown only: ${onlySource}`);
      await safe(onlySource, fn);
    } else if (onlyFeed?.length) {
      // 指定源抓取（如 8:30 档补抓少数派 + 派早报，抢当天的早报）
      await safe("news", () => fetchNews(bj.date, onlyFeed));
    } else if (force || ![5, 6, 12, 17].includes(bj.hour)) {
      // 全量补抓（手动 / 延迟补跑）
      await safe("news", () => fetchNews(bj.date));
      await safe("shijing", () => fetchShijing());
      await safe("quotes", () => fetchQuotes());
      await safe("comments", () => fetchComments(bj));
      await safe("daily_read", () => fetchDailyRead(bj.date));
    } else if (bj.hour === 5) {
      await safe("shijing", () => fetchShijing());
      await safe("quotes", () => fetchQuotes());
      await safe("daily_read", () => fetchDailyRead(bj.date));
    } else {
      await safe("news", () => fetchNews(bj.date));
      await safe("comments", () => fetchComments(bj));
      await safe("shijing", () => fetchShijing());
      await safe("quotes", () => fetchQuotes());
      await safe("daily_read", () => fetchDailyRead(bj.date));
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
  // ?dedupe=quotes|news：一次性清理重复行（历史去重失效导致的重复行），保留每组最早/最全的一条
  const dedupeTarget = url.searchParams.get("dedupe") || "";
  if (dedupeTarget) {
    if (!["quotes", "news", "shijing"].includes(dedupeTarget)) {
      return json(
        { ok: false, error: `unknown dedupe target: ${dedupeTarget} (可用: quotes / news / shijing)` },
        400
      );
    }
    const result =
      dedupeTarget === "quotes"
        ? await dedupeQuotes()
        : dedupeTarget === "news"
          ? await dedupeNews()
          : await dedupeShijing();
    return json({ ok: true, dedupe: dedupeTarget, ...result });
  }
  // ?migrate=paizaobao：把历史「派早报」条目从 少数派 改判到专用 source（一次性维护）
  const migrate = url.searchParams.get("migrate") || "";
  if (migrate) {
    if (migrate !== "paizaobao") {
      return json({ ok: false, error: `unknown migrate target: ${migrate}` }, 400);
    }
    const r = await http(
      `${REST}/news?source=eq.${encodeURIComponent("少数派")}&title=like.${encodeURIComponent("派早报*")}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=representation" }),
        body: JSON.stringify({ source: "派早报", category: "派早报" }),
        timeout: 30_000,
      }
    );
    const moved = r ? Number(r.headers.get("content-range")?.split("/")[1] ?? 0) : 0;
    return json({ ok: !!(r && r.ok), migrate: "paizaobao", moved, status: r?.status ?? null });
  }
  // ?feeds=sspai / chinanews：只抓指定新闻源（供 8:30 档单独补抓少数派等场景）
  // 支持逗号分隔多源：?feeds=sspai,paizaobao
  const feedAlias = url.searchParams.get("feeds") || "";
  let onlyFeed: string[] | undefined = undefined;
  if (feedAlias) {
    const picked: string[] = [];
    for (const part of feedAlias.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const names = FEED_ALIASES[part];
      if (!names) {
        return json({ ok: false, error: `unknown feeds param: ${part} (可用: chinanews / zaker / sspai / paizaobao)` }, 400);
      }
      for (const n of names) if (!picked.includes(n)) picked.push(n);
    }
    onlyFeed = picked.length ? picked : undefined;
  }
  // ?only=shijing|quotes|news|comments|daily_read：只重抓单个数据源（维护/补抓用）
  const onlySource = url.searchParams.get("only") || undefined;

  if (sync || typeof EdgeRuntime === "undefined") {
    return json(await runCrawl(force, onlyFeed, onlySource));
  }

  EdgeRuntime.waitUntil(runCrawl(force, onlyFeed, onlySource));
  const bj = bjParts();
  return json({
    ok: true,
    mode: "async",
    hour: bj.hour,
    date: bj.date,
    message: "抓取已在后台启动，日志见 Supabase 控制台 → Edge Functions → crawler → Logs",
  });
});
