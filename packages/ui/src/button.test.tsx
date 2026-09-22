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

  it("applies the variant classes", () => {
    render(<Button variant="primary">Go</Button>);

    expect(screen.getByRole("button", { name: "Go" }).className).toContain("bg-accent");
  });
});
