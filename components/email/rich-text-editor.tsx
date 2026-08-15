'use client'

import * as React from 'react'
import {
  Bold, Code2, Eye, Italic, Link2, List, ListOrdered, Underline,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Small contentEditable editor for composing mail.
 *
 * ClearLevel used TipTap here; that would pull seven packages into Workly for a
 * compose box, so this uses the browser's own editing commands instead. The
 * "HTML" toggle matters more than the toolbar — pasted campaign/template markup
 * needs to be editable as source without a WYSIWYG mangling it.
 */

interface Props {
  value:        string
  onChange:     (html: string) => void
  placeholder?: string
  minHeight?:   string
}

type Mode = 'rich' | 'html'

export function RichTextEditor({
  value, onChange, placeholder = 'Write your message…', minHeight = '220px',
}: Props) {
  const [mode, setMode] = React.useState<Mode>('rich')
  const ref = React.useRef<HTMLDivElement>(null)

  // Push external changes (template insert, reply quote) into the DOM without
  // clobbering what the user is typing — writing innerHTML on every keystroke
  // would reset the caret to the start.
  React.useEffect(() => {
    if (mode !== 'rich') return
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value
  }, [value, mode])

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  function addLink() {
    const url = window.prompt('Link URL')
    if (!url) return
    // Only http(s) and mailto — a javascript: URL here would be stored in the
    // message body and run for anyone who opens it.
    if (!/^(https?:|mailto:)/i.test(url)) {
      window.alert('Only http, https and mailto links are allowed.')
      return
    }
    exec('createLink', url)
  }

  const toolBtn =
    'grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink'

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2/30">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border bg-surface px-2 py-1.5">
        {mode === 'rich' && (
          <>
            <button type="button" onClick={() => exec('bold')}          title="Bold"          className={toolBtn}><Bold className="size-4" /></button>
            <button type="button" onClick={() => exec('italic')}        title="Italic"        className={toolBtn}><Italic className="size-4" /></button>
            <button type="button" onClick={() => exec('underline')}     title="Underline"     className={toolBtn}><Underline className="size-4" /></button>
            <span className="mx-1 h-5 w-px bg-border" />
            <button type="button" onClick={() => exec('insertUnorderedList')} title="Bullet list"   className={toolBtn}><List className="size-4" /></button>
            <button type="button" onClick={() => exec('insertOrderedList')}   title="Numbered list" className={toolBtn}><ListOrdered className="size-4" /></button>
            <button type="button" onClick={addLink}                     title="Insert link"   className={toolBtn}><Link2 className="size-4" /></button>
          </>
        )}
        <button
          type="button"
          onClick={() => setMode(mode === 'rich' ? 'html' : 'rich')}
          title={mode === 'rich' ? 'Edit HTML source' : 'Back to visual editor'}
          className={cn(
            'ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
            mode === 'html'
              ? 'bg-brand/10 text-brand'
              : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
          )}
        >
          {mode === 'rich' ? <><Code2 className="size-3.5" /> HTML</> : <><Eye className="size-3.5" /> Visual</>}
        </button>
      </div>

      {/* Surface */}
      {mode === 'rich' ? (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
          style={{ minHeight }}
          className={cn(
            'w-full overflow-y-auto px-3 py-2.5 text-sm leading-relaxed outline-none',
            // Placeholder for an empty contentEditable — :empty only matches when
            // the browser has not inserted a stray <br>.
            'empty:before:text-ink-soft empty:before:content-[attr(data-placeholder)]',
            '[&_a]:text-brand [&_a]:underline',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
          )}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{ minHeight }}
          className="w-full resize-y bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed outline-none"
          placeholder="<p>HTML source…</p>"
        />
      )}
    </div>
  )
}

/** Plain-text fallback body, derived from the HTML the editor produced. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
