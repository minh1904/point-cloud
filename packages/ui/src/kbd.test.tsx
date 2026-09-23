import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Kbd } from "./kbd";

afterEach(cleanup);

describe("Kbd", () => {
  it("renders a real kbd element, not a styled span", () => {
    render(<Kbd>Ctrl</Kbd>);
    const key = screen.getByText("Ctrl");
    expect(key.tagName).toBe("KBD");
  });

  it("lets className through", () => {
    render(<Kbd className="w-20">Space</Kbd>);
    expect(screen.getByText("Space").className).toContain("w-20");
  });
});
