// PROBE: Verify Foundry v14's Roll.safeEval accepts bare math fn names.
// Catches regressions of the Math.* rewrite bug (Roll.safeEval rejects Math.*).

const cases = [
  { expr: "floor(7/2)",                expected: 3 },
  { expr: "ceil(7/2)",                 expected: 4 },
  { expr: "round(2.7)",                expected: 3 },
  { expr: "min(2, 5)",                 expected: 2 },
  { expr: "max(2, 5)",                 expected: 5 },
  { expr: "floor(10/3) + ceil(10/4)",  expected: 6 },
  { expr: "max(1, floor(7/2))",        expected: 3 },
  { expr: "1 + floor(7/2)",            expected: 4 },
];

const results = cases.map(c => {
  try {
    const r = Roll.safeEval(c.expr);
    return { expr: c.expr, result: r, expected: c.expected, pass: r === c.expected };
  } catch (e) {
    return { expr: c.expr, error: e.message, pass: false };
  }
});

// Also probe what's in the sandbox: Math.floor should FAIL, bare floor should PASS.
let mathProxyTest;
try {
  Roll.safeEval("Math.floor(7/2)");
  mathProxyTest = { mathFloorWorks: true, note: "v14 contract changed — review verify.sh grep wall" };
} catch {
  mathProxyTest = { mathFloorWorks: false, note: "Expected: Math.* is NOT in MATH_PROXY sandbox" };
}

return {
  allPass: results.every(r => r.pass),
  results,
  mathProxyTest,
};
