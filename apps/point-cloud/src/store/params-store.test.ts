import { beforeEach, describe, expect, it } from "vitest";

import { defaultValues } from "@/params/schema";

import { useParamsStore } from "./params-store";

const store = () => useParamsStore.getState();

beforeEach(() => {
  useParamsStore.setState({ values: defaultValues(), past: [], future: [] });
});

describe("set", () => {
  it("writes a value and clamps it to the schema", () => {
    store().set("size", 0.05);
    expect(store().values.size).toBe(0.05);

    store().set("size", 99);
    expect(store().values.size).toBe(0.1);
  });

  it("ignores a key the schema does not have", () => {
    const before = store().values;
    store().set("nonsense", 1);
    expect(store().values).toBe(before);
  });

  it("does not record history on its own", () => {
    store().set("size", 0.05);
    expect(store().past.length).toBe(0);
  });
});

describe("commit", () => {
  it("turns a whole drag into one history entry", () => {
    // What sixty frames of a drag look like to the store.
    for (const value of [0.02, 0.03, 0.04, 0.05]) store().set("size", value);
    store().commit();

    expect(store().past.length).toBe(1);
    expect(store().past[0]!.size).toBe(0.019);
    expect(store().values.size).toBe(0.05);
  });

  it("records nothing when a gesture changed nothing", () => {
    store().set("size", 0.019);
    store().commit();
    expect(store().past.length).toBe(0);
  });

  it("records nothing when called twice", () => {
    store().set("size", 0.05);
    store().commit();
    store().commit();
    expect(store().past.length).toBe(1);
  });

  it("separates two drags", () => {
    store().set("size", 0.05);
    store().commit();
    store().set("size", 0.06);
    store().commit();
    expect(store().past.length).toBe(2);
  });
});

describe("undo and redo", () => {
  it("steps back to where the drag started", () => {
    store().set("size", 0.05);
    store().commit();

    store().undo();
    expect(store().values.size).toBe(0.019);

    store().redo();
    expect(store().values.size).toBe(0.05);
  });

  it("does nothing at either end", () => {
    store().undo();
    expect(store().values.size).toBe(0.019);
    store().redo();
    expect(store().values.size).toBe(0.019);
  });

  it("walks back through several steps in order", () => {
    for (const value of [0.03, 0.05, 0.07]) {
      store().set("size", value);
      store().commit();
    }

    store().undo();
    expect(store().values.size).toBe(0.05);
    store().undo();
    expect(store().values.size).toBe(0.03);
    store().undo();
    expect(store().values.size).toBe(0.019);
  });

  it("drops the redo branch once something new is changed", () => {
    store().set("size", 0.05);
    store().commit();
    store().undo();
    expect(store().future.length).toBe(1);

    store().set("softness", 0.2);
    store().commit();
    expect(store().future.length).toBe(0);
  });

  it("abandons a gesture in progress rather than folding it into the undo", () => {
    store().set("size", 0.05);
    store().commit();
    // A drag begins, then Ctrl+Z lands mid-drag.
    store().set("softness", 0.9);
    store().undo();

    expect(store().values.size).toBe(0.019);
    // Committing now must not resurrect the abandoned gesture's start point.
    store().commit();
    expect(store().past.length).toBe(0);
  });
});

describe("reset", () => {
  it("is one undoable step", () => {
    store().set("size", 0.05);
    store().commit();
    store().set("softness", 0.1);
    store().commit();

    store().reset();
    expect(store().values.size).toBe(0.019);
    expect(store().values.softness).toBe(0.5);

    store().undo();
    expect(store().values.size).toBe(0.05);
    expect(store().values.softness).toBe(0.1);
  });

  it("records nothing when everything is already default", () => {
    store().reset();
    expect(store().past.length).toBe(0);
  });

  it("resets one group without touching the others", () => {
    store().set("size", 0.05);
    store().set("noiseAmplitude", 0.1);
    store().commit();

    store().resetGroup("particles");
    expect(store().values.size).toBe(0.019);
    expect(store().values.noiseAmplitude).toBe(0.1);
  });
});
