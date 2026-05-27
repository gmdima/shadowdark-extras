// PROBE: Verify requirement evaluator (new Function scoped) handles strings + booleans.
// Mirrors the call site at scripts/shadowdark-extras.mjs evaluateSourceRequirement.

const cases = [
  { req: 'charClass === "wizard"',                              ctx: { charClass: "wizard", level: 5 },                     expected: true  },
  { req: 'charClass === "wizard"',                              ctx: { charClass: "fighter", level: 5 },                    expected: false },
  { req: "level >= 5",                                          ctx: { charClass: "wizard", level: 5 },                     expected: true  },
  { req: 'charClass === "wizard" && level >= 3',                ctx: { charClass: "wizard", level: 3 },                     expected: true  },
  { req: 'charClass === "priest" || charClass === "wizard"',    ctx: { charClass: "priest", level: 1 },                     expected: true  },
  { req: 'background.includes("noble")',                        ctx: { background: "lost-noble", charClass: "fighter" },    expected: true  },
  { req: 'ancestry === "elf" && level >= 5',                    ctx: { ancestry: "elf", level: 5 },                         expected: true  },
  { req: "Math.floor(level / 2) >= 2",                          ctx: { level: 5 },                                          expected: true  },
];

const results = cases.map(c => {
  try {
    const fn = new Function(...Object.keys(c.ctx), `return ${c.req};`);
    const result = Boolean(fn(...Object.values(c.ctx)));
    return { req: c.req, result, expected: c.expected, pass: result === c.expected };
  } catch (e) {
    return { req: c.req, error: e.message, pass: false };
  }
});

return { allPass: results.every(r => r.pass), results };
