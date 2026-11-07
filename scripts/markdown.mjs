// Small, dependency-free Markdown renderer for trusted repository skills.
// Raw HTML in the source is always escaped; links are limited to relative paths and https.

export const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function splitFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) return { fields: {}, body: source };
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { fields, body: source.slice(match[0].length) };
}

export function slugify(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function safeHref(href, rewriteLink) {
  if (/^https:\/\//i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
  return rewriteLink ? rewriteLink(href) : href;
}

export function inline(text, options = {}) {
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (whole, label, href) => {
    const target = safeHref(href.replace(/&amp;/g, '&'), options.rewriteLink);
    if (!target) return label;
    const external = /^https:/i.test(target);
    return `<a href="${escapeHtml(target)}"${external ? ' rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?=[^\w*]|$)/g, '$1<em>$2</em>').replace(/(^|[^\w])_([^_\s][^_]*)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

const tableRow = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));

export function renderMarkdown(source, options = {}) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const used = new Map();
  let index = 0;
  const isBlockStart = line => /^(#{1,6})\s|^```|^\s*([-*+]|\d+[.)])\s|^>\s?|^\s*(?:---+|\*\*\*+)\s*$|^\|/.test(line);
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = /^```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      index++;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) body.push(lines[index++]);
      index++;
      const language = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : '';
      out.push(`<pre${language}><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const html = inline(heading[2], options);
      let id = slugify(html) || 'section';
      const count = used.get(id) ?? 0;
      used.set(id, count + 1);
      if (count) id = `${id}-${count}`;
      headings.push({ level, id, text: html.replace(/<[^>]+>/g, '') });
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      index++;
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr>'); index++; continue; }
    if (/^\|/.test(line) && index + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const header = tableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && /^\|/.test(lines[index])) rows.push(tableRow(lines[index++]));
      out.push(`<div class="table"><table><thead><tr>${header.map(cell => `<th>${inline(cell, options)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${header.map((_, column) => `<td>${inline(row[column] ?? '', options)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) body.push(lines[index++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(body.join('\n'), options).html}</blockquote>`);
      continue;
    }
    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    if (listItem.test(line)) {
      // Nested lists by indentation; continuation lines join the current item.
      const root = { children: [], ordered: /\d/.test(listItem.exec(line)[2]) };
      const stack = [{ indent: listItem.exec(line)[1].length, list: root }];
      let current = null;
      while (index < lines.length) {
        const text = lines[index];
        const item = listItem.exec(text);
        if (item) {
          const indent = item[1].length;
          while (stack.length > 1 && indent < stack.at(-1).indent) stack.pop();
          if (indent > stack.at(-1).indent && current) {
            const list = { children: [], ordered: /\d/.test(item[2]) };
            current.sub = list;
            stack.push({ indent, list });
          }
          current = { text: item[3], sub: null };
          stack.at(-1).list.children.push(current);
          index++;
        } else if (text.trim() && /^\s+/.test(text) && current) {
          current.text += ` ${text.trim()}`;
          index++;
        } else break;
      }
      const renderList = list => `<${list.ordered ? 'ol' : 'ul'}>${list.children.map(child => `<li>${inline(child.text, options)}${child.sub ? renderList(child.sub) : ''}</li>`).join('')}</${list.ordered ? 'ol' : 'ul'}>`;
      out.push(renderList(root));
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !(paragraph.length && isBlockStart(lines[index]))) paragraph.push(lines[index++].trim());
    out.push(`<p>${inline(paragraph.join(' '), options)}</p>`);
  }
  return { html: out.join('\n'), headings };
}
