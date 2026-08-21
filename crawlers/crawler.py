# -*- coding: utf-8 -*-
"""
全能工作台爬虫脚本 v3（2026-08-21 重构版）
数据源（均已实测可达）：
  新闻   -> 界面新闻快报四板块    lists/1324kb(热点) / 1325kb(公司) / 主页混合(财经/时事)
  诗经   -> 古文岛诗经            guwendao.net
  名句   -> 古诗文网名句          gushiwen.cn（含译文/注释/赏析）
  评论   -> 人民网观点频道        opinion.people.com.cn（人民日报评论）
定时任务：每日 6/12/17 点新闻，5 点诗经/名句/评论
"""

import httpx
from parsel import Selector
import json
import re
from datetime import datetime, timedelta
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
NEWS_SECTIONS = {
    '今日热点': 'https://www.jiemian.com/lists/1324kb.html',
    '公司头条': 'https://www.jiemian.com/lists/1325kb.html',
}

def _parse_jiemian_list(url, category, max_items=8):
    """解析界面新闻列表页，返回 [{title,url,desc,category}]"""
    items = []
    try:
        resp = httpx.get(url, headers=UA, timeout=30, follow_redirects=True)
        sel = Selector(text=resp.text)
        seen = set()
        for li in sel.css('.d-list ul li, [class*=newsflash] ul li'):
            text = li.xpath('string(.)').get() or ''
            text = ' '.join(text.split())
            a_tag = li.css('a').get()
            href = ''
            if a_tag:
                # 从 <a> 标签提取 href
                m = re.search(r'href="([^"]+)"', a_tag)
                if m:
                    href = m.group(1)

            # 提取标题和描述：通常格式为 "HH:MM标题描述文字"
            # 时间开头如 "10:05" 或 "09:48"
            clean = re.sub(r'^\d{1,2}:\d{2}\s*', '', text).strip()
            if not clean or len(clean) < 10 or clean in seen:
                continue
            seen.add(clean)

            # 尝试分离标题和描述（第一个句号或逗号后截断作为描述）
            title = clean
            desc = ''
            # 如果文本较长（>40字），前半作标题，后半作描述
            if len(clean) > 45:
                for sep in ['。', '，', ',', '.']:
                    if sep in clean[25:]:
                        idx = clean.index(sep, 25) + 1
                        title = clean[:idx].strip()
                        desc = clean[idx:].strip()
                        break
                if not desc:
                    title = clean[:35].strip()
                    desc = clean[35:].strip()

            url_full = href if href.startswith('http') else f'https://www.jiemian.com{href}' if href else '#'

            items.append({
                'title': title,
                'url': url_full,
                'summary': desc[:80] if desc else '',
                'source': '界面新闻',
                'date': datetime.now().strftime('%Y-%m-%d'),
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

    # 各独立板块
    for cat, url in NEWS_SECTIONS.items():
        items = _parse_jiemian_list(url, cat, max_items=8)
        print(f'  · {cat}: {len(items)} 条')
        all_items.extend(items)

    # 财经速览/时事追踪从主页滚动快报补充（这两个子页面返回403）
    try:
        resp = httpx.get('https://www.jiemian.com/lists/4.html', headers=UA, timeout=30, follow_redirects=True)
        sel = Selector(text=resp.text)
        extra_seen = set(i['title'] for i in all_items)
        extra = []
        for li in sel.css('[class*=newsflash] ul li'):
            text = (li.xpath('string(.)').get() or '').strip()
            text = re.sub(r'^\d{1,2}:\d{2}\s*', '', text).strip()
            if not text or len(text) < 10 or text in extra_seen:
                continue
            a = li.css('a')
            href = a.css('::attr(href)').get() or ''
            # 简单分类关键词
            cat = '时事追踪'
            if any(kw in text for kw in ['股','市','基金','A股','IPO','财报','营收','利润']):
                cat = '财经速览'
            elif any(kw in text for kw in ['公司','企业','融资','上市','CEO','腾讯','阿里']):
                cat = '公司头条'
            extra.append({'title': text[:45], 'url': href if href.startswith('http') else f'https://www.jiemian.com{href}',
                          'summary': text[45:125] if len(text)>45 else '', 'source': '界面新闻',
                          'date': datetime.now().strftime('%Y-%m-%d'), 'category': cat})
            extra_seen.add(text)
            if len(extra) >= 10:
                break

        # 按分类分配到对应板块（每板块最多补到8条）
        for cat in ['财经速览', '时事追踪']:
            cat_items = [i for i in extra if i['category'] == cat][:8]
            print(f'  · {cat}(补充): {len(cat_items)} 条')
            all_items.extend(cat_items)
    except Exception as e:
        print(f'  ! 主页补充抓取异常: {e}')

    if all_items:
        have = existing_keys('news', 'url', [i['url'] for i in all_items])
        new = [i for i in all_items if i['url'] not in have]
        api_post('news', new)
        # 清理 7 天前的旧新闻，防止无限累积
        try:
            cutoff = (datetime.now().date() - timedelta(days=7)).isoformat()
            r = httpx.delete(f'{BASE_URL}/news?date.lt.{cutoff}',
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
# 评论 — 人民网观点频道（人民日报评论）
# ============================================================
def fetch_comments():
    print('[评论] 抓取人民网观点频道...')
    try:
        resp = httpx.get('http://opinion.people.com.cn/', headers=UA, timeout=30, follow_redirects=True)
        sel = Selector(text=resp.text)
        items, seen = [], set()
        for el in sel.css('li'):
            a = el.css('a').get() or ''
            if not a:
                continue
            title = (el.xpath('string(.//a)').get() or '').strip()
            href = el.css('a::attr(href)').get() or ''
            if not title or not (6 <= len(title) <= 50) or title in seen:
                continue
            # 过滤非评论内容
            if any(kw in title for kw in ['图片', '视频', '直播', '专题']):
                continue
            seen.add(title)
            url = href if href.startswith('http') else f'http://opinion.people.com.cn{href}'
            items.append({
                'title': title,
                'type': '人民日报·评论',
                'url': url,
                'date': datetime.now().strftime('%Y-%m-%d'),
                'author': '',
                'subtitle': ''
            })
            if len(items) >= 10:
                break
        # 人民日报评论只保留最新 5 条：先清理旧评论，再写入本次 5 条
        # 防误删：仅在本次抓到 >=1 条时才清理，避免抓取失败时空表
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
