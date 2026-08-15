const forbidden = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\(\))/u;

type RuleContext = {
  sourceCode: { text: string };
  report: (descriptor: { node: unknown; messageId: string }) => void;
};

export default {
  meta: { type: "problem", schema: [], messages: { forbidden: "Composition and instrument modules may not own network, wall-clock, randomness, transport, or offline rendering." } },
  create(context: RuleContext) {
    return {
      Program(node: unknown) {
        if (forbidden.test(context.sourceCode.text)) context.report({ node, messageId: "forbidden" });
      },
    };
  },
};
