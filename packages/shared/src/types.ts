export type ToolType =
  | "hello_world"
  | "get_project_data"
  | "add_cube"
  | "add_group"
  | "modify_element"
  | "remove_element"
  | "run_expression";

export type ToolCommand = {
  tool: ToolType;
  input: Record<string, any>;
};
