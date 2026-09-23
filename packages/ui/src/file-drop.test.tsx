import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileDrop } from "./file-drop";

afterEach(cleanup);

const png = () => new File(["x"], "photo.png", { type: "image/png" });
const text = () => new File(["x"], "notes.txt", { type: "text/plain" });

/** Enough of a DataTransfer for React's synthetic drag events. */
const transfer = (...files: File[]) => ({ files, dropEffect: "none" });

describe("FileDrop", () => {
  it("reports a file chosen through the input", async () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose a photo" onFile={onFile} />);

    await userEvent.upload(screen.getByLabelText("Choose a photo"), png());

    expect(onFile).toHaveBeenCalledOnce();
    expect(onFile.mock.calls[0]![0].name).toBe("photo.png");
  });

  it("reports a dropped file", () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose a photo" onFile={onFile} />);

    fireEvent.drop(screen.getByLabelText("Choose a photo").closest("label")!, {
      dataTransfer: transfer(png()),
    });

    expect(onFile).toHaveBeenCalledOnce();
  });

  it("ignores a drop that does not match accept", () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose a photo" accept="image/*" onFile={onFile} />);

    fireEvent.drop(screen.getByLabelText("Choose a photo").closest("label")!, {
      dataTransfer: transfer(text()),
    });

    expect(onFile).not.toHaveBeenCalled();
  });

  it("picks the first accepted file out of a mixed drop", () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose a photo" accept=".png" onFile={onFile} />);

    fireEvent.drop(screen.getByLabelText("Choose a photo").closest("label")!, {
      dataTransfer: transfer(text(), png()),
    });

    expect(onFile.mock.calls[0]![0].name).toBe("photo.png");
  });

  it("stays highlighted while the pointer crosses a child", () => {
    render(
      <FileDrop label="Choose a photo" onFile={vi.fn()}>
        <span data-testid="hint">Drop a photo</span>
      </FileDrop>,
    );
    const zone = screen.getByLabelText("Choose a photo").closest("label")!;

    fireEvent.dragEnter(zone, { dataTransfer: transfer() });
    // Entering the child arrives before leaving the parent, so a plain boolean
    // would flicker off right here.
    fireEvent.dragEnter(screen.getByTestId("hint"), { dataTransfer: transfer() });
    fireEvent.dragLeave(zone, { dataTransfer: transfer() });

    expect(zone.hasAttribute("data-dragging")).toBe(true);

    fireEvent.dragLeave(zone, { dataTransfer: transfer() });
    expect(zone.hasAttribute("data-dragging")).toBe(false);
  });
});
