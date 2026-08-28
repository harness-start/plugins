type Named = { name?: string; value?: string | number; type?: string };
type RuleNode = {
  type?: string;
  declaration?: { type?: string; id?: Named };
  key?: Named;
  callee?: { type?: string; name?: string; property?: Named };
};
type RuleContext = { report(descriptor: { node: unknown; messageId: string }): void };

const rule = {
  meta: { type: "problem" as const, schema: [] as const, messages: { owner: "A poster layer may not own stacking, rendering, I/O, network, or runtime hooks.", export: "A poster layer must export exactly one buildLayer function." } },
  create(context: RuleContext) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node: RuleNode) {
        if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id?.name === "buildLayer") exports += 1;
      },
      Property(node: RuleNode) { if ((node.key?.name ?? node.key?.value) === "zIndex") context.report({ node, messageId: "owner" }); },
      CallExpression(node: RuleNode) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (name !== undefined && ["fetch", "setTimeout", "setInterval", "useState", "useEffect", "useLayoutEffect"].includes(name)) context.report({ node, messageId: "owner" });
      },
      "Program:exit"(node: RuleNode) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};

export default rule;
