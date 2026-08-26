# -*- coding: utf-8 -*-
"""
全能工作台爬虫脚本 v3（2026-08-21 重构版）
数据源（均已实测可达）：
  新闻   -> 界面新闻快报四板块    lists/1324kb(热点) / 1325kb(公司) / 主页混合(财经/时事)
  诗经   -> 古文岛诗经            guwendao.net
  名句   -> 古诗文网名句          gushiwen.cn（含译文/注释/赏析）
  评论   -> 人民日报电子版当日第5版  paper.people.com.cn/rmrb/pc/layout/.../node_05.html
定时任务：每日 6/12/17 点新闻，5 点诗经/名句/评论
"""

import httpx
from parsel import Selector
import json
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin
# 北京时间时区（GitHub Actions runner 为 UTC，必须用北京时间对齐人民日报版面日期）
BEIJING = timezone(timedelta(hours=8))
import os

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://wentfvkdfecrfelgmdix.supabase.co')
# 优先用 service key；缺省/失效时回退到 publishable(anon) key（已实测可写入）
_PUBLISHABLE_KEY = 'sb_publishable_JoMfWIeViOhdQONkYiGagQ_Oen6GgGJ'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_ANON_KEY') or _PUBLISHABLE_KEY
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}
BASE_URL = f'{SUPABASE_URL}/rest/v1'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}


def api_post(table, rows):
    if not rows:
        print(f'  ! {table} 无新数据，跳过')
        return
    url = f'{BASE_URL}/{table}'
    try:
        resp = httpx.post(url, json=rows, headers=HEADERS, timeout=30)
        if resp.status_code in (200, 201):
            print(f'  ✓ 写入 {table}: {len(rows)} 条')
        else:
            print(f'  ✗ 写入失败 {resp.status_code}: {resp.text[:200]}')
    except Exception as e:
        print(f'  ✗ 异常: {e}')


def existing_keys(table, col, vals):
    """取已有行的去重键集合"""
    out = set()
    for v in vals:
        try:
            r = httpx.get(f'{BASE_URL}/{table}?select={col}&{col}=eq.{v}', headers=HEADERS, timeout=20)
            if r.status_code == 200 and r.json():
                out.add(v)
        except Exception:
            pass
    return out


# ============================================================
# 新闻 — 界面新闻四板块（今日热点/公司头条/财经速览/时事追踪）
# ============================================================
# 板块 id 对应关系（来自 jiemian.com 主页导航 li id）：
#   1324=今日热点  1322=公司头条  1326=财经速览  1325=时事追踪
NEWS_SECTIONS = {
    '今日热点': 'https://www.jiemian.com/lists/1324kb.html',
    '公司头条': 'https://www.jiemian.com/lists/1322kb.html',
    '财经速览': 'https://www.jiemian.com/lists/1326kb.html',
    '时事追踪': 'https://www.jiemian.com/lists/1325kb.html',
}

def _parse_jiemian_list(url, category, max_items=8):
    """解析界面新闻板块子页。
    板块子页 li 结构：
      <li>
        <div class="columns-right-center__newsflash-item">
          <div class="columns-right-center__newsflash-content">
            <h4><a href="/article/{id}.html">{标题}</a></h4>
            <div class="columns-right-center__newsflash-content__summary">{摘要}</div>
          </div>
        </div>
      </li>
    返回 [{title,url,summary,category}]，title=纯标题，summary=摘要。
    """
    items = []
    try:
        resp = httpx.get(url, headers=UA, timeout=30, follow_redirects=True)
        sel = Selector(text=resp.text)
        seen = set()
        for li in sel.css('.columns-right-center__newsflash-item'):
            # 链接
            a = li.css('a[href*="/article/"]')
            if not a:
                continue
            href = a.css('::attr(href)').get() or ''
            if not href:
                continue
            if not href.startswith('http'):
                href = f'https://www.jiemian.com{href}' if href.startswith('/') else f'https://www.jiemian.com/{href}'
            if href in seen:
                continue
            # 标题：h4 内 a 的文本（li 第一个 article 链接）
            title = (li.css('h4 a::text').get() or '').strip()
            title = ' '.join(title.split())
            if not title or len(title) < 6:
                # 兜底：取 a 文本
                title = (a.css('::text').get() or '').strip()
                title = ' '.join(title.split())
            if not title or len(title) < 6:
                continue
            # 摘要：专门的 .columns-right-center__newsflash-content__summary
            summary = ''
            for sn in li.css('.columns-right-center__newsflash-content__summary'):
                txt = (sn.css('::text').get() or '').strip()
                if txt and txt != title:
                    summary = ' '.join(txt.split())
                    break
            seen.add(href)
            items.append({
                'title': title[:80],          # 标题防御性截断
                'url': href,
                'summary': summary[:120],      # 摘要防御性截断
                'source': '界面新闻',
                'date': datetime.now(BEIJING).strftime('%Y-%m-%d'),
                'category': category
            })
            if len(items) >= max_items:
                break
    except Exception as e:
        print(f'  ! {category} 列表解析异常: {e}')
    return items


def fetch_news():
    print('[新闻] 抓取界面新闻四板块...')
    all_items = []

    # 四个板块各自从独立子页抓（已确认 1322/1324/1325/1326kb.html 全部 200）
    for cat, url in NEWS_SECTIONS.items():
        items = _parse_jiemian_list(url, cat, max_items=8)
        print(f'  · {cat}: {len(items)} 条')
        all_items.extend(items)

    if all_items:
        have = existing_keys('news', 'url', [i['url'] for i in all_items])
        new = [i for i in all_items if i['url'] not in have]
        api_post('news', new)
        # 清理 7 天前的旧新闻，防止无限累积（PostgREST DELETE 需 column=op.value 格式）
        try:
            cutoff = (datetime.now(BEIJING).date() - timedelta(days=7)).isoformat()
            r = httpx.delete(f'{BASE_URL}/news?date=lt.{cutoff}',
                             headers=HEADERS, timeout=20)
            print(f'  · 清理 {cutoff} 前旧新闻: {r.status_code}')
        except Exception as e:
            print(f'  · 清理旧新闻异常: {e}')
    else:
        print('  ! 无新闻数据')


# ============================================================
# 诗经 — 古文岛
# ============================================================
def fetch_shijing():
    print('[诗经] 抓取古文岛...')
    try:
        resp = httpx.get('https://www.guwendao.net/gushi/shijing.aspx', headers=UA, timeout=30, follow_redirects=True)
        sel = Selector(text=resp.text)
        items, seen = [], set()
        for a in sel.css('a[href*="shiwenv_"]'):
            title = (a.css('::text').get() or '').strip()
            href = a.css('::attr(href)').get() or ''
            if not title or not (2 <= len(title) <= 6) or title in seen:
                continue
            seen.add(title)
            detail = f'https://www.guwendao.net{href}'
            content, section = title, '诗经'
            translation = annotation = analysis = ''
            try:
                d = httpx.get(detail, headers=UA, timeout=20, follow_redirects=True)
                ds = Selector(text=d.text)
                block = ds.css('.contson').get()
                if block:
                    raw = ' '.join(t.strip() for t in Selector(text=block).css('::text').getall() if t.strip())
                    content = raw[:90] or title
                for t in ds.css('.sons .cont ::text').getall():
                    t = t.strip()
                    if '诗经' in t:
                        section = t
                        break
                # 译文/注释/赏析：详情页 .contyishang[0] 为「译文及注释 译文...注释...」
                # [1]简析 / [2]赏析 / [3]赏析二
                blocks = ds.css('.contyishang')
                if blocks:
                    t0 = ' '.join(x.strip() for x in blocks[0].css('::text').getall() if x.strip())
                    # 去掉「译文及注释」标题头，避免首个 split('译文') 误切
                    t0 = t0.replace('译文及注释', ' ', 1)
                    if '译文' in t0:
                        after = t0.split('译文', 1)[1]
                        if '注释' in after:
                            translation = after.split('注释', 1)[0].strip()[:200]
                            annotation = after.split('注释', 1)[1].strip()[:200]
                        else:
                            translation = after.strip()[:200]
                    for b in blocks[1:]:
                        bt = ' '.join(x.strip() for x in b.css('::text').getall() if x.strip())
                        if bt.startswith('赏析'):
                            analysis = bt[2:].strip()[:300]
                            break
                        if bt.startswith('简析') and not analysis:
                            analysis = bt[2:].strip()[:300]
            except Exception:
                pass
            items.append({'title': title, 'section': section, 'content': content, 'url': detail,
                          'translation': translation, 'annotation': annotation, 'analysis': analysis})
            if len(items) >= 30:  # 多抓一些用于循环展示
                break
        have = existing_keys('shijing', 'title', [i['title'] for i in items])
        new = [i for i in items if i['title'] not in have]
        api_post('shijing', new)
    except Exception as e:
        print(f'  ✗ 诗经抓取失败: {e}')


# ============================================================
# 名句 — 古诗文网（含详情页译文/注释/赏析）
# ============================================================
def fetch_quotes():
    print('[名句] 抓取古诗文网...')
    try:
        resp = httpx.get('https://www.gushiwen.cn/mingjus/', headers=UA, timeout=30, follow_redirects=True)
        sel = Selector(text=resp.text)
        items, seen = [], set()
        for cont in sel.css('.sons .cont'):
            links = cont.css('a')
            quote = (links[0].css('::text').get() or '').strip()
            author = (links[-1].css('::text').get() or '').strip() if len(links) > 1 else ''
            detail_href = links[0].css('::attr(href)').get() or '' if links else ''

            if not quote or len(quote) < 5 or quote in seen:
                continue
            seen.add(quote)

            item = {'quote': quote, 'author': author or '佚名', 'source': '古诗文网'}

            # 进入详情页获取译文、注释、赏析（详情页正文在 .contson 内：
            # <p><span class="yzsSpan">译文</span>正文...</p>）
            if detail_href:
                try:
                    d_url = detail_href if detail_href.startswith('http') else f'https://www.gushiwen.cn{detail_href}'
                    d_resp = httpx.get(d_url, headers=UA, timeout=20, follow_redirects=True)
                    d_sel = Selector(text=d_resp.text)

                    translation = annotation = analysis = ''
                    for p in d_sel.css('.contson p'):
                        raw = ''.join(p.css('::text').getall()).strip()
                        if raw.startswith('译文'):
                            translation = raw[2:].lstrip('：:，,。 \t')[:200]
                        elif raw.startswith('注释'):
                            annotation = raw[2:].lstrip('：:，,。 \t')[:200]
                        elif raw.startswith('赏析'):
                            analysis = raw[2:].lstrip('：:，,。 \t')[:200]

                    if translation: item['translation'] = translation
                    if annotation: item['annotation'] = annotation
                    if analysis: item['analysis'] = analysis
                    if d_url: item['url'] = d_url
                except Exception:
                    pass

            items.append(item)
            if len(items) >= 30:  # 多抓用于循环
                break
        # 统一键：PostgREST 批量插入要求所有行字段完全一致，缺释义的补空串
        for it in items:
            it.setdefault('translation', '')
            it.setdefault('annotation', '')
            it.setdefault('analysis', '')
            it.setdefault('url', '')
        have = existing_keys('quotes', 'quote', [i['quote'] for i in items])
        new = [i for i in items if i['quote'] not in have]
        api_post('quotes', new)
    except Exception as e:
        print(f'  ✗ 名句抓取失败: {e}')


# ============================================================
# 评论 — 人民日报电子版当日第5版（评论版）
# 版面页：https://paper.people.com.cn/rmrb/pc/layout/{YYYYMM}/{DD}/node_05.html
# li 结构：<li><span>·</span><a href="../../../content/...">{标题}</a></li>
# ============================================================
def fetch_comments():
    print('[评论] 抓取人民日报电子版当日第5版（评论）...')
    try:
        today = datetime.now(BEIJING)
        page_url = f'https://paper.people.com.cn/rmrb/pc/layout/{today.strftime("%Y%m")}/{today.strftime("%d")}/node_05.html'
        resp = httpx.get(page_url, headers=UA, timeout=30, follow_redirects=True)
        if resp.status_code != 200:
            print(f'  ! 版面页 {page_url} 返回 {resp.status_code}')
            return
        sel = Selector(text=resp.text)
        items, seen = [], set()
        for li in sel.css('.news li'):
            a = li.css('a')
            if not a:
                continue
            title = (a.css('::text').get() or '').strip()
            title = ' '.join(title.split())
            href = a.css('::attr(href)').get() or ''
            if not title or len(title) < 6 or title in seen:
                continue
            # 过滤编辑署名/非文章条目
            if any(kw in title for kw in ['本版责编', '图片报道', '本版邮箱', '漫画', '广告']):
                continue
            seen.add(title)
            # 相对路径 ../../../content/... 转绝对 URL
            url = urljoin(page_url, href) if href else ''
            items.append({
                'title': title,
                'type': '人民日报·评论',
                'url': url,
                'date': today.strftime('%Y-%m-%d'),
                'author': '',
                'subtitle': ''
            })
            if len(items) >= 8:
                break
        # 只保留最新 5 条：先清理旧评论，再写入本次（防误删：抓到 >=1 条才清）
        if items:
            items = items[:5]
            try:
                # PostgREST 删除全部行需带过滤条件（id != 全零UUID）
                r = httpx.delete(f'{BASE_URL}/comments?id=neq.00000000-0000-0000-0000-000000000000',
                                 headers=HEADERS, timeout=20)
                print(f'  · 清理旧评论: {r.status_code}')
            except Exception as e:
                print(f'  · 清理旧评论异常: {e}')
            api_post('comments', items)
        else:
            print('  ! 未抓到评论，跳过清理（保留旧数据）')
    except Exception as e:
        print(f'  ✗ 评论抓取失败: {e}')


if __name__ == '__main__':
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M")}] 开始爬取...')
    fetch_news()
    fetch_shijing()
    fetch_quotes()
    fetch_comments()
    print('爬取完成!')
