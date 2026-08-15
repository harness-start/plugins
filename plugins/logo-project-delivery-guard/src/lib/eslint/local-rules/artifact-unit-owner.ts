type Named = { name?: string; value?: string | number; type?: string };

type RuleNode = {
  type?: string;
  name?: string | Named;
  declaration?: { type?: string; id?: Named };
  callee?: { type?: string; name?: string; property?: Named };
};

type RuleContext = {
  report(descriptor: { node: unknown; messageId: string }): void;
};

const jsxName = (node: RuleNode): string | Named | undefined => {
  const name = node.name;
  if (name && typeof name === "object") return name.name;
  return name;
};

const rule = {
  meta: { type: "problem" as const, schema: [] as const, messages: { vector: "Logo master modules must remain self-contained native SVG vectors.", export: "A logo master module must export exactly one component." } },
  create(context: RuleContext) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node: RuleNode) { if (node.declaration?.type === "FunctionDeclaration") exports += 1; },
      JSXOpeningElement(node: RuleNode) { if (["image", "text", "foreignObject", "script", "style", "iframe"].includes(String(jsxName(node)))) context.report({ node, messageId: "vector" }); },
      CallExpression(node: RuleNode) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (name !== undefined && ["fetch", "useState", "useEffect", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "vector" });
      },
      "Program:exit"(node: RuleNode) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};

export default rule;
