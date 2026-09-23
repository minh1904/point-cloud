import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "./button";
import { Panel } from "./panel";
import { Slider } from "./slider";

const meta = {
  title: "Layout/Panel",
  component: Panel,
  args: {
    title: "Particles",
    children: null,
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithControls: Story = {
  render: (args) => (
    <Panel {...args}>
      <Slider label="Size" defaultValue={0.025} max={0.1} step={0.001} />
      <Slider label="Softness" defaultValue={0.5} />
      <Slider label="Drift" defaultValue={0.06} max={0.3} step={0.005} />
      <Slider label="Speed" defaultValue={1} max={3} step={0.1} />
      <Button variant="outline" className="mt-1">
        Reset
      </Button>
    </Panel>
  ),
};

// The panel holds no state, so the collapsed flag lives with the consumer —
// which is what lets one button collapse a whole stack of them at once.
function CollapsibleDemo() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Panel
      title="Particles"
      collapsible
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
    >
      <Slider label="Size" defaultValue={0.025} max={0.1} step={0.001} />
      <Slider label="Softness" defaultValue={0.5} />
    </Panel>
  );
}

export const Collapsible: Story = {
  render: () => <CollapsibleDemo />,
};

// Over a busy background, the translucent surface and blur keep text legible.
export const OverContent: Story = {
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="relative h-96 bg-[radial-gradient(circle,var(--color-primary)_1px,transparent_1px)] bg-[size:12px_12px] p-6">
      <Panel {...args}>
        <Slider label="Size" defaultValue={0.4} />
        <Slider label="Softness" defaultValue={0.5} />
      </Panel>
    </div>
  ),
};
