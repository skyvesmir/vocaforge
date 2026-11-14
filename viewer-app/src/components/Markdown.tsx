"use client";

// NOTES.md の表示。
// サニタイズの方針: marked は「字句解析（トークン化）」にだけ使い、HTML 文字列は一切作らない・差し込まない
// （dangerouslySetInnerHTML は使わない）。トークンを React の要素に組み立てるので、
// 本文中の HTML タグ（<script> など）は、タグとしては働かず、そのまま文字として表示される。
// リンク先は http / https / mailto と相対パスだけを通し、javascript: などは捨てる。画像は読み込まず、リンクにする。
import { useMemo, type ReactNode } from "react";
import { marked } from "marked";

type Tok = { type: string; tokens?: Tok[]; [key: string]: unknown };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]+);/g, (all: string, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return all;
      try {
        return String.fromCodePoint(code);
      } catch {
        return all;
      }
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : all;
  });
}

/** 通してよいリンク先だけを返す（だめなら null）。 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const s = decodeEntities(href).trim();
  if (s === "") return null;
  // eslint-disable-next-line no-control-regex
  const compact = s.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  if (compact.startsWith("//")) return null;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  if (!m) return s; // 相対パス・ページ内リンク
  const scheme = (m[1] ?? "").toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto" ? s : null;
}

const hasCheckbox = (toks?: Tok[]): boolean => !!toks && toks.some((x) => x.type === "checkbox" || hasCheckbox(x.tokens));

function checkbox(key: string, checked: unknown): ReactNode {
  return <input key={key} type="checkbox" checked={checked === true} readOnly disabled />;
}

/** 文中の要素。隣り合う文字列は1つにまとめる。 */
function inline(tokens: Tok[] | undefined, kp: string): ReactNode[] {
  const out: ReactNode[] = [];
  const push = (n: ReactNode) => {
    if (typeof n === "string") {
      if (n === "") return;
      const last = out.length - 1;
      const prev = out[last];
      if (typeof prev === "string") {
        out[last] = prev + n;
        return;
      }
    }
    out.push(n);
  };
  (tokens ?? []).forEach((t, i) => {
    const key = `${kp}.${i}`;
    switch (t.type) {
      case "text":
      case "escape":
        if (t.tokens) inline(t.tokens, key).forEach(push);
        else push(decodeEntities(str(t.text)));
        break;
      case "strong":
        push(<strong key={key}>{inline(t.tokens, key)}</strong>);
        break;
      case "em":
        push(<em key={key}>{inline(t.tokens, key)}</em>);
        break;
      case "del":
        push(<del key={key}>{inline(t.tokens, key)}</del>);
        break;
      case "codespan":
        push(<code key={key}>{str(t.text)}</code>);
        break;
      case "br":
        push(<br key={key} />);
        break;
      case "checkbox":
        push(checkbox(key, t.checked));
        break;
      case "link":
      case "image": {
        const href = safeHref(t.href);
        const body: ReactNode =
          t.type === "link" && t.tokens && t.tokens.length > 0 ? inline(t.tokens, key) : str(t.text) || str(t.href);
        if (href) {
          push(
            <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
              {body}
            </a>,
          );
        } else if (Array.isArray(body)) {
          body.forEach(push);
        } else {
          push(body);
        }
        break;
      }
      case "html": {
        // HTML は、タグとして使わず、書かれたとおりの文字として出す（<br> だけは改行にする）
        const raw = str(t.raw) || str(t.text);
        if (/^<br\s*\/?>$/i.test(raw.trim())) push(<br key={key} />);
        else push(raw);
        break;
      }
      default:
        if (t.tokens) inline(t.tokens, key).forEach(push);
        else push(str(t.raw));
    }
  });
  return out;
}

function blocks(tokens: Tok[] | undefined, kp: string): ReactNode[] {
  const out: ReactNode[] = [];
  (tokens ?? []).forEach((t, i) => {
    const key = `${kp}.${i}`;
    switch (t.type) {
      case "space":
        break;
      case "heading": {
        // ページの見出し（h1）の下に入るので、1段下げる（# → h2）
        const depth = Math.min(6, Math.max(1, Number(t.depth) || 1) + 1);
        const Tag = `h${depth}` as "h2" | "h3" | "h4" | "h5" | "h6";
        out.push(<Tag key={key}>{inline(t.tokens, key)}</Tag>);
        break;
      }
      case "paragraph":
        out.push(<p key={key}>{inline(t.tokens, key)}</p>);
        break;
      case "text":
        out.push(...(t.tokens ? inline(t.tokens, key) : [decodeEntities(str(t.text))]));
        break;
      case "checkbox":
        out.push(checkbox(key, t.checked));
        break;
      case "code":
        out.push(
          <pre key={key}>
            <code>{str(t.text)}</code>
          </pre>,
        );
        break;
      case "blockquote":
        out.push(<blockquote key={key}>{blocks(t.tokens, key)}</blockquote>);
        break;
      case "hr":
        out.push(<hr key={key} />);
        break;
      case "list": {
        const items = Array.isArray(t.items) ? (t.items as Tok[]) : [];
        const children = items.map((it, j) => (
          <li key={`${key}.${j}`}>
            {it.task && !hasCheckbox(it.tokens) ? checkbox(`${key}.${j}.c`, it.checked) : null}
            {blocks(it.tokens, `${key}.${j}`)}
          </li>
        ));
        if (t.ordered) {
          out.push(
            <ol key={key} start={typeof t.start === "number" ? t.start : undefined}>
              {children}
            </ol>,
          );
        } else {
          out.push(<ul key={key}>{children}</ul>);
        }
        break;
      }
      case "table": {
        const header = Array.isArray(t.header) ? (t.header as Tok[]) : [];
        const rows = Array.isArray(t.rows) ? (t.rows as Tok[][]) : [];
        const align = Array.isArray(t.align) ? (t.align as unknown[]) : [];
        const cellStyle = (c: number) => {
          const a = align[c];
          return a === "left" || a === "right" || a === "center" ? ({ textAlign: a } as const) : undefined;
        };
        out.push(
          <div className="md-table-wrap" key={key}>
            <table>
              <thead>
                <tr>
                  {header.map((c, j) => (
                    <th key={j} style={cellStyle(j)}>
                      {inline(c.tokens, `${key}.h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri}>
                    {(Array.isArray(r) ? r : []).map((c, j) => (
                      <td key={j} style={cellStyle(j)}>
                        {inline(c.tokens, `${key}.${ri}.${j}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        break;
      }
      case "html": {
        const raw = (str(t.raw) || str(t.text)).trim();
        if (raw !== "") out.push(<p key={key}>{raw}</p>);
        break;
      }
      default: {
        if (t.tokens) out.push(<p key={key}>{inline(t.tokens, key)}</p>);
        else if (str(t.raw).trim() !== "") out.push(<p key={key}>{str(t.raw)}</p>);
      }
    }
  });
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const tokens = useMemo(() => {
    try {
      return marked.lexer(text) as unknown as Tok[];
    } catch {
      return null;
    }
  }, [text]);
  if (!tokens) return <pre className="raw-json">{text}</pre>;
  return <div className="md">{blocks(tokens, "b")}</div>;
}
