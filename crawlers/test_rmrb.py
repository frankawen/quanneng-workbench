import httpx
from parsel import Selector
from datetime import datetime
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

def fetch_comments():
    today = datetime.now()
    date_str = today.strftime("%Y%m/%d")
    url = f"https://paper.people.com.cn/rmrb/pc/layout/{date_str}/node_05.html"
    
    results = []
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        
        selector = Selector(text=resp.text)
        
        # 人民日报评论页面的结构
        items = selector.css("ul.rmw_list li a::attr(href)").getall()
        titles = selector.css("ul.rmw_list li a::text").getall()
        
        for href, title in zip(items, titles):
            if href and title:
                full_url = href if href.startswith("http") else f"https://paper.people.com.cn{href}"
                title_text = title.strip()
                
                # 判断类型
                if "纵论" in title_text or "纵论" in href:
                    ctype = "纵论"
                elif "纵横" in title_text or "纵横" in href:
                    ctype = "纵横"
                elif "现场" in title_text or "现场" in href:
                    ctype = "现场评论"
                else:
                    ctype = "人民时评"
                
                results.append({
                    "title": title_text,
                    "date": today.strftime("%Y-%m-%d"),
                    "type": ctype,
                    "url": full_url,
                    "crawled_at": datetime.now().isoformat(),
                })
    except Exception as e:
        print(f"抓取失败: {e}")
    
    return results

if __name__ == "__main__":
    comments = fetch_comments()
    print(f"抓取到 {len(comments)} 条评论")
    for c in comments[:5]:
        print(f"  - {c['title'][:30]}...")
