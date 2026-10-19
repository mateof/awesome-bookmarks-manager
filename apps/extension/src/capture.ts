import type { AutomationStep } from "@awesome-bookmarks/shared";

export interface CapturedField {
  selector: string;
  kind: "fill" | "select" | "check";
  value: string;
}

export function captureFormFields(): CapturedField[] {
  const SKIP = new Set([
    "hidden",
    "password",
    "submit",
    "button",
    "reset",
    "file",
    "image",
  ]);
  const esc = (s: string) => CSS.escape(s);
  const unique = (selector: string) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  const selectorFor = (el: Element): string => {
    if (el.id && unique(`#${esc(el.id)}`)) return `#${esc(el.id)}`;
    const tag = el.tagName.toLowerCase();
    const name = el.getAttribute("name");
    if (name) {
      const byName = `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
      if (unique(byName)) return byName;
      if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
        const byValue = `${byName}[value="${el.value.replace(/"/g, '\\"')}"]`;
        if (unique(byValue)) return byValue;
      }
    }
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && parts.length < 8) {
      const current: Element = node;
      if (current.id && unique(`#${esc(current.id)}`)) {
        parts.unshift(`#${esc(current.id)}`);
        break;
      }
      const parent: Element | null = current.parentElement;
      const sameTag = parent
        ? Array.from(parent.children).filter((c) => c.tagName === current.tagName)
        : [];
      const nth = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(current) + 1})` : "";
      parts.unshift(`${current.tagName.toLowerCase()}${nth}`);
      node = parent;
    }
    return parts.join(" > ");
  };
  const visible = (el: HTMLElement) =>
    !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);

  const out: CapturedField[] = [];
  for (const el of Array.from(document.querySelectorAll("input, select, textarea"))) {
    const field = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.disabled || !visible(field)) continue;
    if (field instanceof HTMLInputElement) {
      if (SKIP.has(field.type)) continue;
      if (field.type === "checkbox" || field.type === "radio") {
        if (field.checked) out.push({ selector: selectorFor(field), kind: "check", value: "" });
        continue;
      }
    }
    if (field instanceof HTMLSelectElement) {
      if (field.selectedIndex > 0) {
        out.push({ selector: selectorFor(field), kind: "select", value: field.value });
      }
      continue;
    }
    if (field.value.trim() !== "") {
      out.push({ selector: selectorFor(field), kind: "fill", value: field.value });
    }
  }
  return out;
}

export function stepsFromCapture(
  fields: CapturedField[],
  variables: Record<string, string>,
): AutomationStep[] {
  const byValue = new Map<string, string>();
  for (const [key, value] of Object.entries(variables)) {
    const norm = value.trim().toLowerCase();
    if (norm && !byValue.has(norm)) byValue.set(norm, key);
  }
  const template = (value: string) => {
    const key = byValue.get(value.trim().toLowerCase());
    return key ? `{{${key}}}` : value;
  };
  return fields.map((f): AutomationStep => {
    if (f.kind === "check") return { action: "check", selector: f.selector, checked: true };
    if (f.kind === "select") return { action: "select", selector: f.selector, value: template(f.value) };
    return { action: "fill", selector: f.selector, value: template(f.value) };
  });
}
