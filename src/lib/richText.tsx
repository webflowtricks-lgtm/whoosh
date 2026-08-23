/**
 * Rich text markup for skill descriptions.
 * Supported syntax:
 *   **text**                → bold
 *   __text__                → underline
 *   [color:#ff0000]...[/color] → colored text (hex)
 *   [color:red]...[/color]  → colored text (named color)
 */
import React from 'react';

const NAMED_COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  white: '#ffffff',
  black: '#111111',
  gray: '#9ca3af',
  gold: '#ffd700',
};

export const RICH_TEXT_COLOR_PALETTE: { name: string; hex: string }[] = Object.entries(NAMED_COLORS).map(
  ([name, hex]) => ({ name, hex })
);

const MARKUP_RE = /(\*\*|__|\[\/?color:[^\]]*\])/g;

export function stripRichMarkup(text: string | undefined | null): string {
  if (!text) return '';
  return text.replace(MARKUP_RE, '');
}

export function parseRichTextNodes(
  text: string | undefined | null,
  opts: { keepTokens?: boolean } = {}
): React.ReactNode[] {
  if (!text) return [];
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let bold = false;
  let underline = false;
  const colorStack: string[] = [];

  const parts = text.split(MARKUP_RE);
  for (const part of parts) {
    if (!part) continue;

    const pushToken = () => {
      // Keep token chars occupying space so an overlay editor stays aligned,
      // but paint them invisible (WYSIWYG mode).
      if (opts.keepTokens) {
        nodes.push(
          <React.Fragment key={key++}>
            <span style={{ color: 'transparent' }}>{part}</span>
          </React.Fragment>
        );
      }
    };

    if (part === '**') {
      pushToken();
      bold = !bold;
      continue;
    }
    if (part === '__') {
      pushToken();
      underline = !underline;
      continue;
    }
    const openMatch = part.match(/^\[color:([^\]]*)\]$/);
    if (openMatch) {
      pushToken();
      const raw = openMatch[1].trim().toLowerCase();
      const resolved = NAMED_COLORS[raw] ?? (/^#[0-9a-f]{3,8}$/.test(raw) ? raw : undefined);
      colorStack.push(resolved ?? 'inherit');
      continue;
    }
    if (/^\[\/color\]$/.test(part)) {
      pushToken();
      colorStack.pop();
      continue;
    }

    const hasColor = colorStack.length > 0 && colorStack[colorStack.length - 1] !== 'inherit';
    if (bold || underline || hasColor) {
      nodes.push(
        <React.Fragment key={key++}>
          <span
            style={{
              fontWeight: bold ? 700 : undefined,
              textDecoration: underline ? 'underline' : undefined,
              color: hasColor ? colorStack[colorStack.length - 1] : undefined,
            }}
          >
            {part}
          </span>
        </React.Fragment>
      );
    } else {
      nodes.push(<React.Fragment key={key++}>{part}</React.Fragment>);
    }
  }
  return nodes;
}

export function RichText({ text, keepTokens }: { text?: string | null; keepTokens?: boolean }) {
  return <>{parseRichTextNodes(text, { keepTokens })}</>;
}

/** Escape plain text for safe injection as HTML */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convert stored markup (**b**, __u__, [color:x]...[/color]) into simple HTML for contentEditable editors */
export function parseRichTextToHtml(text?: string | null): string {
  if (!text) return '';
  let html = '';
  let bold = false;
  let under = false;
  const colors: string[] = [];

  const openTags = () =>
    (bold ? '<b>' : '') + (under ? '<u>' : '') + (colors.length ? `<span style="color:${colors[colors.length - 1]}">` : '');
  const closeTags = () =>
    (colors.length ? '</span>' : '') + (under ? '</u>' : '') + (bold ? '</b>' : '');
  const reopen = () => {
    html += closeTags() + openTags();
  };

  for (const part of text.split(MARKUP_RE)) {
    if (!part) continue;
    if (part === '**') {
      bold = !bold;
      reopen();
      continue;
    }
    if (part === '__') {
      under = !under;
      reopen();
      continue;
    }
    const openMatch = part.match(/^\[color:([^\]]*)\]$/);
    if (openMatch) {
      const raw = openMatch[1].trim().toLowerCase();
      const resolved = NAMED_COLORS[raw] ?? (/^#[0-9a-f]{3,8}$/.test(raw) ? raw : undefined);
      colors.push(resolved ?? 'inherit');
      reopen();
      continue;
    }
    if (/^\[\/color\]$/.test(part)) {
      colors.pop();
      reopen();
      continue;
    }
    html += escapeHtml(part);
  }
  html += closeTags();
  return html;
}

function rgbColorToHex(cssColor: string): string | null {
  const c = cssColor.trim().toLowerCase();
  const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) {
    const to2 = (n: string) => parseInt(n, 10).toString(16).padStart(2, '0');
    return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`;
  }
  if (/^#[0-9a-f]{3,8}$/.test(c)) return c;
  return null;
}

/** Convert editor DOM (innerHTML) back into the stored markup format */
export function htmlToRichMarkup(html: string): string {
  if (!html) return '';
  const host = document.createElement('div');
  host.innerHTML = html;
  let out = '';

  const walkChildren = (parent: Node) => {
    let firstBlock = true;
    parent.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent || '';
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;

      if (el.tagName === 'BR') {
        out += '\n';
        return;
      }

      const isBlock = el.tagName === 'DIV' || el.tagName === 'P';
      if (isBlock && !firstBlock) out += '\n';
      if (isBlock) firstBlock = false;

      const st = el.style;
      const fw = st.fontWeight;
      const isBold = el.tagName === 'B' || el.tagName === 'STRONG' || fw === 'bold' || fw === '700';
      const decoration = `${st.textDecorationLine || ''} ${st.textDecoration || ''}`;
      const isUnder = el.tagName === 'U' || /underline/i.test(decoration);
      const rawColor = st.color || el.getAttribute('color') || '';
      const colorHex = rawColor ? rgbColorToHex(rawColor) : null;

      if (isBold) out += '**';
      if (isUnder) out += '__';
      if (colorHex) out += `[color:${colorHex}]`;
      walkChildren(el);
      if (colorHex) out += '[/color]';
      if (isUnder) out += '__';
      if (isBold) out += '**';
    });
  };

  walkChildren(host);
  // Collapse artifacts from nested identical tags
  return out.replace(/\*\*\*\*/g, '').replace(/____/g, '');
}
