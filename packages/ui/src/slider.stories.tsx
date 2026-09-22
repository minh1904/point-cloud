import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import { Slider } from "./slider";

const meta = {
  title: "Controls/Slider",
  component: Slider,
  args: {
    label: "Size",
    defaultValue: 0.4,
    min: 0,
    max: 1,
    step: 0.01,
    onValueChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Formats: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <Slider label="Opacity" defaultValue={0.75} format={{ style: "percent" }} />
      <Slider label="Speed" defaultValue={1.5} max={3} step={0.1} format={{ maximumFractionDigits: 1 }} />
      <Slider label="Count" defaultValue={60000} min={1000} max={200000} step={1000} />
      <Slider label="A very long parameter name" defaultValue={0.3} />
    </div>
  ),
};

export const Controlled: Story = {
  render: function ControlledSlider() {
    const [value, setValue] = useState(0.5);
    return (
      <div className="flex flex-col gap-2">
        <Slider label="Amplitude" value={value} onValueChange={setValue} />
        <p className="px-1 font-mono text-2xs text-muted-foreground">value = {value.toFixed(2)}</p>
      </div>
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
