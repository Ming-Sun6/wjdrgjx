import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("UI响应式布局契约", () => {
  it("所有控件与卡片使用border-box和不超过父容器的宽度", () => {
    expect(styles).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box/s);
    expect(styles).toMatch(/input,\s*select,\s*textarea,\s*button\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.panel,\s*\.inputs,\s*\.results,[^{]+\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
  });

  it("主布局和表单Grid允许子项收缩，不保留固定像素最小列宽", () => {
    expect(styles).toMatch(/main\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*1\.1fr\)/s);
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(styles).toMatch(/main\s*>\s*\*,[^{]+\{\s*min-width:\s*0;/s);
    expect(styles).not.toMatch(/grid-template-columns:\s*minmax\(\d+px/);
    expect(styles).not.toMatch(/width:\s*(?:600|800)px/);
  });

  it("长下拉文字和技能说明不会撑开黑色卡片", () => {
    expect(styles).toMatch(/select\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
    expect(styles).toMatch(/\.skill-detail p,\s*\.skill-detail small\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(styles).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});
