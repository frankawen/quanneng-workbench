// supabase/functions/crawl-scheduler/index.ts
//
// 作用：被 Supabase pg_cron 定时调用，向 GitHub Actions 发送 workflow_dispatch，
//       触发已验证的 Python 爬虫（crawlers/crawler.py）执行抓取。
// 目的：用 Supabase 可靠的 pg_cron 取代 GitHub 自身不可靠的 schedule 触发器，
//       根治「定时任务整窗丢触发」问题。爬虫逻辑完全复用，无需重写抓取。
//
// 依赖 Secrets（Supabase 控制台 → Functions → Secrets 配置）：
//   GITHUB_TOKEN : 具备 workflow scope 的 GitHub PAT
//   CRON_SECRET  : 可选；pg_cron 调用时通过 x-cron-secret 头带上，防止函数被公网滥用
//                  （留空则不鉴权，函数可被匿名调用，仅触发一次公开仓库的 workflow）

const REPO = 'frankawen/quanneng-workbench'
const DISPATCH_URL = `https://api.github.com/repos/${REPO}/actions/workflows/crawl.yml/dispatches`

Deno.serve(async (req: Request) => {
  try {
    // 1) 简单鉴权
    const auth =
      req.headers.get('x-cron-secret') ??
      new URL(req.url).searchParams.get('secret') ??
      ''
    const expected = Deno.env.get('CRON_SECRET') ?? ''
    if (expected && auth !== expected) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 2) 取 GitHub PAT
    const token = Deno.env.get('GITHUB_TOKEN')
    if (!token) {
      return new Response('Missing GITHUB_TOKEN secret', { status: 500 })
    }

    // 3) 触发 GitHub Actions（crawler.py 内部按北京时间小时自行决定抓哪类）
    const res = await fetch(DISPATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'supabase-edge-cron',
      },
      body: JSON.stringify({ ref: 'main' }),
    })

    if (!res.ok) {
      const txt = await res.text()
      return new Response(`Dispatch failed (${res.status}): ${txt.slice(0, 300)}`, {
        status: 502,
      })
    }
    return new Response(
      JSON.stringify({ ok: true, repo: REPO, dispatched_at: new Date().toISOString() }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 })
  }
})
