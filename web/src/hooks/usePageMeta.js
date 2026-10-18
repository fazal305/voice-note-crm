import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { SITE_URL } from '../lib/site'

function setMeta(selector, attribute, value) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attribute, value)
}

/**
 * Keeps per-route head tags in step with the URL: public pages point their canonical and og:url at themselves,
 * and everything under /app is marked noindex (it sits behind a sign-in anyway).
 */
export function usePageMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const url = `${SITE_URL}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`
    setMeta('link[rel="canonical"]', 'href', url)
    setMeta('meta[property="og:url"]', 'content', url)

    const isApp = pathname === '/app' || pathname.startsWith('/app/')
    let robots = document.head.querySelector('meta[name="robots"]')
    if (isApp) {
      if (!robots) {
        robots = document.createElement('meta')
        robots.name = 'robots'
        document.head.appendChild(robots)
      }
      robots.content = 'noindex, nofollow'
    } else {
      robots?.remove()
    }
  }, [pathname])
}
