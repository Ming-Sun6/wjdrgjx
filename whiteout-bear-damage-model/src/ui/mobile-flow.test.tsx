/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalculatorApp } from "./App";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("手机端计算流程", () => {
  it("切换分区保留输入，计算完成进入结果，修改参数标记旧结果", () => {
    const { container } = render(<CalculatorApp />);
    fireEvent.change(screen.getByLabelText("盾兵兵数"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "阵容优化" }));
    fireEvent.click(screen.getByRole("button", { name: "参数设置" }));
    expect((screen.getByLabelText("盾兵兵数") as HTMLInputElement).value).toBe("1000");
    fireEvent.click(screen.getByRole("button", { name: "计算 10 回合伤害" }));
    expect(container.querySelector(".app-shell")?.getAttribute("data-view")).toBe("results");
    expect(screen.queryByText(/参数已修改，请重新计算/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "参数设置" }));
    fireEvent.change(screen.getByLabelText("盾兵兵数"), { target: { value: "2000" } });
    expect(screen.getByText(/参数已修改，请重新计算/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "计算 10 回合伤害" }));
    expect(screen.queryByText(/参数已修改，请重新计算/)).toBeNull();
  });

  it("城镇增益折叠摘要反映当前选项", () => {
    render(<CalculatorApp />);
    const group = screen.getByText("城镇增益").closest("details")!;
    expect(group.open).toBe(false);
    group.open = true;
    fireEvent.change(screen.getByLabelText("攻击", { exact: true }), { target: { value: "large" } });
    group.open = false;
    expect(group.querySelector("summary")?.textContent).toContain("攻击大药");
  });

  it("取消或修改参数会终止优化线程，迟到的消息不会恢复旧任务", async () => {
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((event: { data: { ok: false; message: string } }) => void) | null = null;
      onerror: unknown;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { FakeWorker.instances.push(this); }
    }
    vi.stubGlobal("Worker", FakeWorker);
    render(<CalculatorApp />);
    fireEvent.change(screen.getByLabelText("盾兵兵数"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "阵容优化" }));
    fireEvent.click(screen.getByRole("button", { name: "优化兵种比例" }));
    const old = FakeWorker.instances[0]!;
    expect(screen.getByRole("button", { name: "取消优化" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "取消优化" })); });
    expect(old.terminate).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "优化兵种比例" }));
    await act(async () => { old.onmessage?.({ data: { ok: false, message: "过期任务" } }); });
    expect(screen.getByRole("button", { name: "取消优化" })).toBeTruthy();
    expect(screen.queryByText("过期任务")).toBeNull();
    await act(async () => { fireEvent.change(screen.getByLabelText("盾兵兵数"), { target: { value: "1234" } }); });
    expect(FakeWorker.instances[1]!.terminate).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "取消优化" })).toBeNull();
  });
});
