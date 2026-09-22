import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Button } from "./button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: {
    children: "Export",
    onClick: fn(),
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "ghost-muted", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["xxs", "xs", "sm", "default", "lg", "xl"],
    },
    radius: {
      control: "inline-radio",
      options: ["default", "md", "xl", "full"],
    },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const variants = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "ghost-muted",
  "destructive",
  "link",
] as const;

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

const sizes = ["xxs", "xs", "sm", "default", "lg", "xl"] as const;

export const Sizes: Story = {
  args: { variant: "outline" },
  render: (args) => (
    <div className="flex items-end gap-2">
      {sizes.map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant} disabled>
          {variant}
        </Button>
      ))}
    </div>
  ),
};
