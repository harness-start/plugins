type Named = { name?: string };
type RuleNode = {
  type?: string;
  declaration?: { type?: string };
  callee?: { name?: string; property?: Named };
};
type RuleContext = { report(descriptor: { node: unknown; messageId: string }): void };

const rule = {
  meta: { type: "problem" as const, schema: [] as const, messages: { static: "Publication units must be static React without client runtime, I/O, network, or nondeterminism.", export: "A publication unit must export exactly one component." } },
  create(context: RuleContext) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node: RuleNode) { if (node.declaration?.type === "FunctionDeclaration") exports += 1; },
      CallExpression(node: RuleNode) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (name !== undefined && ["useState", "useEffect", "useLayoutEffect", "useReducer", "hydrateRoot", "createRoot", "createPortal", "fetch", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "static" });
      },
      "Program:exit"(node: RuleNode) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};

export default rule;
