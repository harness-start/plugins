const jsxName = (node) => node?.name?.name ?? node?.name;

export default {
  meta: { type: "problem", schema: [], messages: { vector: "Logo master modules must remain self-contained native SVG vectors.", export: "A logo master module must export exactly one component." } },
  create(context) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node) { if (node.declaration?.type === "FunctionDeclaration") exports += 1; },
      JSXOpeningElement(node) { if (["image", "text", "foreignObject", "script", "style", "iframe"].includes(jsxName(node))) context.report({ node, messageId: "vector" }); },
      CallExpression(node) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (["fetch", "useState", "useEffect", "setTimeout", "setInterval", "random"].includes(name)) context.report({ node, messageId: "vector" });
      },
      "Program:exit"(node) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};
