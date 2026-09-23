import type { Meta, StoryObj } from "@storybook/react-vite";

import { Kbd } from "./kbd";

const meta = {
  title: "Content/Kbd",
  component: Kbd,
  args: { children: "Ctrl" },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Combination: Story = {
  render: () => (
    <span className="flex items-center gap-1 text-xs-plus text-muted-foreground">
      <Kbd>Ctrl</Kbd>
      <span>+</span>
      <Kbd>Shift</Kbd>
      <span>+</span>
      <Kbd>Z</Kbd>
      <span className="ml-2">Redo</span>
    </span>
  ),
};

export const Wide: Story = {
  render: () => (
    <span className="flex items-center gap-1">
      <Kbd>Space</Kbd>
      <Kbd>1</Kbd>
      <Kbd>Esc</Kbd>
    </span>
  ),
};
