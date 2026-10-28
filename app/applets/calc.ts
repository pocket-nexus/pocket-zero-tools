// The calculator's parser, apart from its screen so a test reads it.

/** Evaluate `+ - * /`, parentheses, decimals and unary minus; null when the
 *  text is not an expression. */
export function evaluate(text: string): number | null {
  const tokens = text.match(/\d+\.?\d*|\.\d+|[-+*/()]/g);
  if (!tokens || tokens.join("") !== text.replace(/\s+/g, "")) return null;
  let at = 0;
  const peek = () => tokens[at];
  const next = () => tokens[at++];
  const primary = (): number | null => {
    const token = next();
    if (token === undefined) return null;
    if (token === "(") {
      const value = expression();
      if (next() !== ")") return null;
      return value;
    }
    if (token === "-") {
      const value = primary();
      return value === null ? null : -value;
    }
    if (token === "+") return primary();
    const number = Number(token);
    return Number.isFinite(number) ? number : null;
  };
  const term = (): number | null => {
    let value = primary();
    while (value !== null && (peek() === "*" || peek() === "/")) {
      const op = next();
      const rhs = primary();
      if (rhs === null) return null;
      value = op === "*" ? value * rhs : rhs === 0 ? null : value / rhs;
    }
    return value;
  };
  const expression = (): number | null => {
    let value = term();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = next();
      const rhs = term();
      if (rhs === null) return null;
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  };
  const value = expression();
  return at === tokens.length && value !== null && Number.isFinite(value) ? value : null;
}

