type Named = { name?: string; type?: string; property?: { name?: string } };
type RuleNode = {
  type?: string;
  declaration?: { type?: string; id?: { name?: string } };
  callee?: Named;
};
type RuleContext = { report(descriptor: { node: unknown; messageId: string }): void };

const nameOf = (callee: Named | undefined): string | undefined => callee?.type === "Identifier" ? callee.name : callee?.property?.name;

const rule = {
  meta: { type: "problem" as const, schema: [] as const, messages: { owner: "A slide module may only export renderSlide and may not create decks, slides, files, or network effects.", export: "A slide module must export exactly one renderSlide function." } },
  create(context: RuleContext) {
    let exports = 0;
    return {
      ExportNamedDeclaration(node: RuleNode) {
        if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id?.name === "renderSlide") exports += 1;
      },
      CallExpression(node: RuleNode) {
        const name = nameOf(node.callee);
        if (name !== undefined && ["addSlide", "writeFile", "writeFileSync", "createWriteStream", "fetch", "setTimeout", "setInterval"].includes(name)) context.report({ node, messageId: "owner" });
      },
      NewExpression(node: RuleNode) {
        const name = nameOf(node.callee);
        if (name !== undefined && ["pptxgen", "PptxGenJS"].includes(name)) context.report({ node, messageId: "owner" });
      },
      "Program:exit"(node: RuleNode) { if (exports !== 1) context.report({ node, messageId: "export" }); },
    };
  },
};

export default rule;
