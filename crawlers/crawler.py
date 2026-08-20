"""
全能工作台 - 爬虫脚本
功能：抓取新闻、诗经、名句、人民日报评论数据
用法：python crawlers.py --type news|shijing|quotes|comments
"""

import os
import sys
import httpx
from pathlib import Path
from parsel import Selector
from datetime import datetime
import json

# Supabase 配置
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("错误：请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 环境变量")
    sys.exit(1)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def supabase_upsert(table: str, data: list[dict], unique_key: str = "id"):
    """Upsert 数据到 Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={unique_key}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    
    response = httpx.post(url, headers=headers, json=data, timeout=30)
    if response.status_code in (200, 201, 204):
        print(f"  ✓ {table}: 成功写入 {len(data)} 条")
        return True
    else:
        print(f"  ✗ {table}: 失败 - {response.status_code} {response.text[:200]}")
        return False


def fetch_news() -> list[dict]:
    """抓取界面新闻快报"""
    print("\n📰 抓取界面快报...")
    
    # 界面快报三个子模块
    urls = [
        "https://www.jiemian.com/lists/",
        "https://news.jiemian.com/",
        "https://indepth.jiemian.com/",
    ]
    
    results = []
    for url in urls:
        try:
            resp = httpx.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            
            selector = Selector(text=resp.text)
            
            # 抓取文章列表（根据实际页面结构调整选择器）
            articles = selector.css("div.list-title a::attr(href)").getall()
            titles = selector.css("div.list-title a::text").getall()
            
            for href, title in zip(articles, titles):
                if href and title:
                    results.append({
                        "title": title.strip(),
                        "source": "界面快报",
                        "url": href if href.startswith("http") else f"https://www.jiemian.com{href}",
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "category": "财经" if "indepth" in url else "科技",
                    })
        except Exception as e:
            print(f"  ⚠ 抓取 {url} 失败: {e}")
    
    return results[:5]  # 只取前5条


def fetch_shijing() -> list[dict]:
    """抓取诗经全文"""
    print("\n📖 抓取诗经全文...")
    
    base_url = "https://www.guwendao.net/gushi/shijing.aspx"
    results = []
    
    try:
        resp = httpx.get(base_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        
        selector = Selector(text=resp.text)
        
        # 抓取诗篇链接
        poems = selector.css("div.main a[href*='/gushi/shijing_']::attr(href)").getall()
        titles = selector.css("div.main a[href*='/gushi/shijing_']::text").getall()
        
        for href, title in zip(poems, titles):
            if href and title and "http" not in href:
                poem_url = f"https://www.guwendao.net{href}"
                poem_content = fetch_poem_content(poem_url)
                
                results.append({
                    "title": title.strip(),
                    "section": "国风",  # 可以根据实际分类
                    "content": poem_content,
                    "crawled_at": datetime.now().isoformat(),
                })
                
                if len(results) >= 10:
                    break
                    
    except Exception as e:
        print(f"  ⚠ 抓取诗经失败: {e}")
    
    return results


def fetch_poem_content(url: str) -> str:
    """抓取单篇诗经内容"""
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        
        selector = Selector(text=resp.text)
        content = selector.css("div.content p::text").getall()
        
        return " ".join([p.strip() for p in content if p.strip()])
    except Exception as e:
        print(f"  ⚠ 抓取 {url} 失败: {e}")
        return ""


def fetch_quotes() -> list[dict]:
    """抓取名句大全"""
    print("\n💬 抓取名句大全...")
    
    url = "https://www.gushiwen.cn/mingjus/"
    results = []
    
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        
        selector = Selector(text=resp.text)
        
        # 抓取名句和出处
        quotes = selector.css("a[href*='/mingju/']::text").getall()
        sources = selector.css("a[href*='/mingju/']::attr(href)").getall()
        authors = selector.css("a[href*='/shiwenv_']::text").getall()
        
        for q, s, a in zip(quotes, sources, authors[:len(quotes)]):
            if q and s:
                results.append({
                    "quote": q.strip(),
                    "author": a.strip() if a else None,
                    "source": f"https://www.gushiwen.cn{s}" if not s.startswith("http") else s,
                    "crawled_at": datetime.now().isoformat(),
                })
                
                if len(results) >= 10:
                    break
                    
    except Exception as e:
        print(f"  ⚠ 抓取名句失败: {e}")
    
    return results


def fetch_comments() -> list[dict]:
    """抓取人民日报评论（05版）"""
    print("\n✍️ 抓取人民日报评论...")
    
    today = datetime.now()
    date_str = today.strftime("%Y%m/%d")
    url = f"https://paper.people.com.cn/rmrb/pc/layout/{date_str}/node_05.html"
    
    results = []
    
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        
        selector = Selector(text=resp.text)
        
        # 抓取评论标题和链接
        items = selector.css("ul.news-list li a::attr(href)").getall()
        titles = selector.css("ul.news-list li a::text").getall()
        
        for href, title in zip(items, titles):
            if href and title:
                full_url = href if href.startswith("http") else f"https://paper.people.com.cn{href}"
                
                # 判断评论类型
                comment_type = "人民时评"
                if "纵横" in title:
                    comment_type = "纵深"
                elif "现场" in title:
                    comment_type = "现场评论"
                
                results.append({
                    "title": title.strip(),
                    "date": today.strftime("%Y-%m-%d"),
                    "type": comment_type,
                    "url": full_url,
                    "crawled_at": datetime.now().isoformat(),
                })
                
    except Exception as e:
        print(f"  ⚠ 抓取评论失败: {e}")
    
    return results


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="全能工作台爬虫")
    parser.add_argument("--type", choices=["news", "shijing", "quotes", "comments", "all"], default="all")
    args = parser.parse_args()
    
    all_results = []
    
    if args.type in ["news", "all"]:
        all_results.extend(fetch_news())
    
    if args.type in ["shijing", "all"]:
        all_results.extend(fetch_shijing())
        # 单独处理诗经
        if all_results:
            supabase_upsert("shijing", all_results[-10:], unique_key="id")
            all_results = []
    
    if args.type in ["quotes", "all"]:
        quotes = fetch_quotes()
        supabase_upsert("quotes", quotes, unique_key="id")
    
    if args.type in ["comments", "all"]:
        comments = fetch_comments()
        supabase_upsert("comments", comments, unique_key="id")
    
    if args.type == "news" and all_results:
        supabase_upsert("news", all_results, unique_key="id")
    
    print("\n✅ 爬取完成！")


if __name__ == "__main__":
    main()
