import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { FileDrop } from "./file-drop";
import { Panel } from "./panel";

const meta = {
  title: "Inputs/FileDrop",
  component: FileDrop,
  args: {
    label: "Choose a photo",
    accept: "image/*",
    onFile: () => {},
  },
} satisfies Meta<typeof FileDrop>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

function InPanelDemo() {
  const [name, setName] = useState<string | null>(null);

  return (
    <Panel title="Photo" className="w-56">
      <FileDrop label="Choose a photo" accept="image/*" onFile={(file) => setName(file.name)}>
        <span className="font-medium text-foreground">Drop a photo</span>
        <span className="text-2xs">or click to browse</span>
      </FileDrop>
      <p className="px-1 text-2xs text-muted-foreground">{name ?? "nothing chosen yet"}</p>
    </Panel>
  );
}

// The shape P6.1 actually uses: a narrow panel, custom prompt, live result.
export const InPanel: Story = {
  render: () => <InPanelDemo />,
};
