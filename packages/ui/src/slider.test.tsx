import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Slider } from "./slider";

afterEach(cleanup);

// The keyboard-focusable part is a visually hidden <input type="range">
// labelled with the slider label. Base UI also keeps the thumb hidden until it
// has measured the layout, which jsdom never does, so find the input by label
// rather than by role.
function getSlider(name: string): HTMLInputElement {
  return screen.getByLabelText(name, { selector: "input" }) as HTMLInputElement;
}

describe("Slider", () => {
  it("exposes an accessible slider named by its label", () => {
    render(<Slider label="Size" defaultValue={0.5} />);

    const slider = getSlider("Size");
    expect(slider).toHaveProperty("value", "0.5");
  });

  it("steps with the arrow keys", async () => {
    const onValueChange = vi.fn();
    render(
      <Slider label="Size" defaultValue={0.5} step={0.1} onValueChange={onValueChange} />,
    );

    getSlider("Size").focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onValueChange).toHaveBeenLastCalledWith(0.6);
  });

  it("stays inside min and max", async () => {
    const onValueChange = vi.fn();
    render(
      <Slider label="Size" defaultValue={1} min={0} max={1} step={0.1} onValueChange={onValueChange} />,
    );

    getSlider("Size").focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onValueChange).not.toHaveBeenCalledWith(1.1);
  });

  it("shows the formatted value", () => {
    render(
      <Slider label="Speed" defaultValue={1.5} max={3} format={{ maximumFractionDigits: 1 }} />,
    );

    expect(screen.getByText("1.5")).toBeDefined();
  });
});
