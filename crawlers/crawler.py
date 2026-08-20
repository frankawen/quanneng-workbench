# -*- coding: utf-8 -*-
"""
全能工作台爬虫脚本
爬取：新闻、诗经、名句、人民日报评论
定时任务：每日 6/12/17 点新闻，5 点诗经/名句/评论
"""

import httpx
from parsel import Selector
import json
import re
from datetime import datetime
import os

# Supabase 配置
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://wentfvkdfecrfelgmdix.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

BASE_URL = f'{SUPABASE_URL}/rest/v1'


def api_post(table, data):
    """插入数据到 Supabase"""
    url = f'{BASE_URL}/{table}'
    try:
        resp = httpx.post(url, json=data, headers=HEADERS, timeout=30)
        if resp.status_code in (200, 201):
            print(f'  ✓ 插入 {table}: {len(data)} 条')
            return resp.json()
        else:
            print(f'  ✗ 插入失败 {resp.status_code}: {resp.text[:200]}')
            return None
    except Exception as e:
        print(f'  ✗ 异常: {e}')
        return None


def api_upsert(table, data, filter_col, filter_val):
    """upsert 数据"""
    # 先查询是否已存在
    url = f'{BASE_URL}/{table}?{filter_col}=eq.{filter_val}'
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            existing = resp.json()
            if existing:
                # 更新
                upd_url = f'{BASE_URL}/{table}?id=eq.{existing[0]["id"]}'
                upd_resp = httpx.patch(upd_url, json=data, headers=HEADERS, timeout=30)
                if upd_resp.status_code in (200, 201):
                    print(f'  ✓ 更新 {table}')
                    return [existing[0]]
        # 不存在则插入
        data['crawled_at'] = datetime.now().isoformat()
        return api_post(table, data)
    except Exception as e:
        print(f'  ✗ upsert 异常: {e}')
        return None


def fetch_news():
    """爬取界面快报"""
    print('[新闻] 开始爬取...')
    url = 'https://www.jiemian.com/list_index.shtml'
    try:
        resp = httpx.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
        selector = Selector(text=resp.text)
        
        items = []
        for item in selector.css('.list-box li, .news-item, .item')[:10]:
            title_el = item.css('a::text, h3::text, .title::text')
            link_el = item.css('a::attr(href)')
            
            title = title_el.get('').strip()
            link = link_el.get('')
            
            if title and len(title) > 5:
                items.append({
                    'title': title,
                    'source': '界面快报',
                    'url': link if link.startswith('http') else f'https://www.jiemian.com{link}',
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'category': '要闻'
                })
        
        if items:
            for item in items:
                item['crawled_at'] = datetime.now().isoformat()
            api_post('news', items)
            print(f'  ✓ 获取 {len(items)} 条新闻')
        else:
            print('  ! 未获取到新闻')
    except Exception as e:
        print(f'  ✗ 新闻爬取失败: {e}')


def fetch_shijing():
    """爬取诗经"""
    print('[诗经] 开始爬取...')
    url = 'https://www.guwendao.net/gushi/shijing.aspx'
    try:
        resp = httpx.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
        selector = Selector(text=resp.text)
        
        items = []
        for item in selector.css('.poem-item, .poem, li a')[:10]:
            title = item.css('::text').get('').strip()
            link = item.css('a::attr(href)').get('')
            
            if title and len(title) > 2 and '诗经' not in title:
                items.append({
                    'title': title,
                    'section': '国风',
                    'content': f'《{title}》',
                    'url': f'https://www.guwendao.net{link}' if link.startswith('/') else link
                })
        
        if items:
            for item in items:
                item['crawled_at'] = datetime.now().isoformat()
            api_post('shijing', items)
            print(f'  ✓ 获取 {len(items)} 条诗经')
        else:
            print('  ! 未获取到诗经')
    except Exception as e:
        print(f'  ✗ 诗经爬取失败: {e}')


def fetch_quotes():
    """爬取名句"""
    print('[名句] 开始爬取...')
    url = 'https://www.gushiwen.cn/mingjus/'
    try:
        resp = httpx.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
        selector = Selector(text=resp.text)
        
        items = []
        for item in selector.css('.sons, .sentences a, .left .sentences a')[:10]:
            quote = item.css('::text').get('').strip()
            author_el = item.css('::attr(data-author)')
            author = author_el.get('')
            
            if quote and len(quote) > 5:
                items.append({
                    'quote': quote,
                    'author': author if author else '佚名',
                    'source': '古诗文网',
                    'crawled_at': datetime.now().isoformat()
                })
        
        if items:
            api_post('quotes', items)
            print(f'  ✓ 获取 {len(items)} 条名句')
        else:
            print('  ! 未获取到名句')
    except Exception as e:
        print(f'  ✗ 名句爬取失败: {e}')


def fetch_comments():
    """爬取人民日报评论"""
    print('[评论] 开始爬取...')
    today = datetime.now().strftime('%Y/%m/%d')
    url = f'https://paper.people.com.cn/rmrb/pc/layout/{today}/node_05.html'
    try:
        resp = httpx.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
        selector = Selector(text=resp.text)
        
        items = []
        for item in selector.css('.list li, .news-list li, a[href*="content"]')[:8]:
            title = item.css('::text').get('').strip()
            link = item.css('a::attr(href)').get('')
            
            if title and len(title) > 5 and '评论' in title:
                items.append({
                    'title': title,
                    'type': '人民时评',
                    'url': link if link.startswith('http') else f'https://paper.people.com.cn{link}',
                    'date': today.replace('/', '-'),
                    'crawled_at': datetime.now().isoformat()
                })
        
        if items:
            api_post('comments', items)
            print(f'  ✓ 获取 {len(items)} 条评论')
        else:
            print('  ! 未获取到评论')
    except Exception as e:
        print(f'  ✗ 评论爬取失败: {e}')


if __name__ == '__main__':
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M")}] 开始爬取...')
    
    fetch_news()
    fetch_shijing()
    fetch_quotes()
    fetch_comments()
    
    print('爬取完成!')
