type NamedNode = {
  name?: { name?: string } | string;
  source?: { value?: unknown };
  specifiers?: Array<{
    type: string;
    imported?: { name?: string };
  }>;
  callee?: {
    name?: string;
    property?: { name?: string };
  };
};

type RuleContext = {
  report: (descriptor: { node: unknown; messageId: string }) => void;
};

const jsxName = (node: NamedNode) => typeof node.name === "object" && node.name !== null ? node.name.name : node.name;
const FORBIDDEN_REMOTION_IMPORTS = new Set(["Audio", "Composition", "Sequence", "Series", "TransitionSeries"]);

function report(context: RuleContext, node: unknown) {
  context.report({ node, messageId: "owner" });
}

export default {
  meta: { type: "problem", schema: [], messages: { owner: "A visual unit may not own audio, composition, global scheduling, I/O, network, or wall-clock randomness." } },
  create(context: RuleContext) {
    return {
      ImportDeclaration(node: NamedNode) {
        const source = node.source?.value;
        if (source === "@remotion/renderer" || /^node:(?:fs|child_process)$/u.test(typeof source === "string" ? source : "")) report(context, node);
        if (source === "remotion" && node.specifiers?.some((specifier) => specifier.type === "ImportNamespaceSpecifier" || FORBIDDEN_REMOTION_IMPORTS.has(specifier.imported?.name ?? ""))) report(context, node);
      },
      ImportExpression(node: NamedNode) {
        const source = node.source?.value;
        if (typeof source === "string" && ["@remotion/renderer", "node:fs", "node:child_process"].includes(source)) report(context, node);
      },
      JSXOpeningElement(node: NamedNode) {
        const name = jsxName(node);
        if (typeof name === "string" && FORBIDDEN_REMOTION_IMPORTS.has(name)) report(context, node);
      },
      CallExpression(node: NamedNode) {
        const name = node.callee?.name ?? node.callee?.property?.name;
        if (typeof name === "string" && ["fetch", "setTimeout", "setInterval", "random"].includes(name)) report(context, node);
      },
      NewExpression(node: NamedNode) {
        const name = node.callee?.name;
        if (typeof name === "string" && ["XMLHttpRequest", "WebSocket"].includes(name)) report(context, node);
      },
    };
  },
};
