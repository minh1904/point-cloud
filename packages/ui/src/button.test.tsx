import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button";

afterEach(cleanup);

describe("Button", () => {
  it("renders its label and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Export</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Export
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to the primary 28px button", () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });

    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("h-7");
    expect(button.className).toContain("text-xs-plus");
  });

  it("lets className override variant classes", () => {
    render(
      <Button variant="outline" className="h-9">
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });

    expect(button.className).toContain("h-9");
    expect(button.className).not.toContain("h-7");
  });
});
