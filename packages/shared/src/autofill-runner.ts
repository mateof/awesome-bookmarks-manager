import type { AutomationStep } from "./autofill.js";

export interface AutomationRunInput {
  steps: AutomationStep[];
  vars: Record<string, string>;
  timeoutMs: number;
}

export interface AutomationRunReport {
  ok: boolean;
  done: number;
  total: number;
  failedStep?: number;
  error?: string;
}

export async function runAutomationSteps(
  input: AutomationRunInput,
): Promise<AutomationRunReport> {
  const total = input.steps.length;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const render = (template: string) =>
    template.replace(
      /\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/g,
      (_m, key: string) => input.vars[key] ?? "",
    );
  const query = (selector: string): Element | null => {
    const docs: Document[] = [document];
    for (let i = 0; i < docs.length; i++) {
      const found = docs[i]!.querySelector(selector);
      if (found) return found;
      docs[i]!.querySelectorAll("iframe, frame").forEach((frame) => {
        try {
          const inner = (frame as HTMLIFrameElement).contentDocument;
          if (inner) docs.push(inner);
        } catch {
          return;
        }
      });
    }
    return null;
  };
  const find = async (selector: string): Promise<Element> => {
    const deadline = Date.now() + input.timeoutMs;
    for (;;) {
      const found = query(selector);
      if (found) return found;
      if (Date.now() >= deadline) {
        throw new Error(`No element matches ${selector}`);
      }
      await sleep(150);
    }
  };
  const fire = (el: Element, type: string) =>
    el.dispatchEvent(new Event(type, { bubbles: true }));
  const assignValue = (el: Element, value: string) => {
    const proto = Object.getPrototypeOf(el) as object;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else (el as HTMLInputElement).value = value;
  };
  const fill = (el: Element, value: string) => {
    const html = el as HTMLElement;
    html.focus?.();
    if (html.isContentEditable) {
      html.textContent = value;
    } else {
      assignValue(el, value);
    }
    fire(el, "input");
    fire(el, "change");
    html.blur?.();
  };
  const choose = (el: Element, value: string) => {
    if (el.tagName !== "SELECT") {
      fill(el, value);
      return;
    }
    const select = el as HTMLSelectElement;
    const wanted = value.trim().toLowerCase();
    const option =
      Array.from(select.options).find((o) => o.value === value) ??
      Array.from(select.options).find(
        (o) => (o.textContent ?? "").trim().toLowerCase() === wanted,
      );
    if (!option) throw new Error(`No option "${value}"`);
    assignValue(select, option.value);
    fire(select, "input");
    fire(select, "change");
  };
  const check = (el: Element, checked: boolean) => {
    const box = el as HTMLInputElement;
    if (box.checked !== checked) box.click();
  };

  let done = 0;
  for (const step of input.steps) {
    try {
      switch (step.action) {
        case "fill":
          fill(await find(step.selector), render(step.value));
          break;
        case "select":
          choose(await find(step.selector), render(step.value));
          break;
        case "check":
          check(await find(step.selector), step.checked);
          break;
        case "click":
          (await find(step.selector) as HTMLElement).click();
          break;
        case "wait":
          await find(step.selector);
          break;
        case "pause":
          await sleep(step.ms);
          break;
      }
      done++;
    } catch (err) {
      return {
        ok: false,
        done,
        total,
        failedStep: done,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { ok: true, done, total };
}

export function automationScriptSource(script: string, vars: Record<string, string>): string {
  return `(async (ab) => {\n${script}\n})(${JSON.stringify({ vars })});`;
}
