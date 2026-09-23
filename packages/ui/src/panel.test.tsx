import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Panel } from "./panel";

afterEach(cleanup);

describe("Panel", () => {
  it("renders a plain heading when it is not collapsible", () => {
    render(
      <Panel title="Particles">
        <p>Size</p>
      </Panel>,
    );

    expect(screen.getByRole("heading", { name: "Particles" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks the consumer to flip the collapsed flag", async () => {
    const onCollapsedChange = vi.fn();
    render(
      <Panel title="Motion" collapsible collapsed={false} onCollapsedChange={onCollapsedChange}>
        <p>Speed</p>
      </Panel>,
    );

    const toggle = screen.getByRole("button", { name: "Motion" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await userEvent.click(toggle);

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    // Controlled: nothing moves until the consumer sends the new value back.
    expect(screen.getByText("Speed")).toBeTruthy();
  });

  it("hides the body while collapsed", () => {
    render(
      <Panel title="Motion" collapsible collapsed>
        <p>Speed</p>
      </Panel>,
    );

    expect(screen.getByRole("button", { name: "Motion" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.queryByText("Speed")).toBeNull();
  });

  it("ignores collapsed unless collapsible is set", () => {
    render(
      <Panel title="Lens" collapsed>
        <p>FOV</p>
      </Panel>,
    );

    expect(screen.getByText("FOV")).toBeTruthy();
  });
});
