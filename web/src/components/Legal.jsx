import { useEffect } from 'react'
import { useLocation } from 'react-router'

/** Shared layout for the Privacy, Terms and FAQ pages: one readable column with styled headings, lists and links. */
export function LegalPage({ title, updated, intro, children }) {
  const { hash } = useLocation()

  // Links like /privacy#storage open at that section (the router only restores scroll to the top).
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
  }, [hash])

  return (
    <article className="mx-auto max-w-2xl px-4 py-12 leading-relaxed sm:px-6 sm:py-16">
      <h1 className="text-5xl text-brand">{title}</h1>
      {updated && <p className="mt-3 text-sm text-muted">Last updated {updated}</p>}
      {intro && <p className="mt-6 text-lg text-muted">{intro}</p>}
      <div className="mt-8 space-y-4 [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_h2]:pt-6 [&_h2]:text-3xl [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </article>
  )
}
