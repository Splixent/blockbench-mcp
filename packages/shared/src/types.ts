export type ToolType = "hello_world";

export type ToolCommand = {
  tool: ToolType;
  input: Record<string, any>;
};
