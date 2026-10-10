export type CalcEnv = Record<string, number>;

/**
 * Answers what one name stands for, by that name folded to lower case.
 *
 * A formula names a handful of fields out of a sheet that may hold hundreds, so it is asked
 * rather than handed the lot: nothing the formula does not name is ever looked at, which is
 * what keeps a field that reads one other field from costing what the whole sheet costs.
 */
export type CalcLookup = (name: string) => number;

/**
 * Works out a calculating field's formula: numbers, field names, `+ - * / **`, parentheses and the functions
 * floor, ceil, round, abs, min and max.
 *
 * A name with spaces or symbols is written in square brackets. Names are matched without regard to case.
 * A formula that does not parse, or names a field with no number, gives NaN rather than throwing.
 */
export function evalCalcFormula(formula: string, env: CalcEnv | CalcLookup): number {
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens, typeof env === 'function' ? env : foldCase(env));
    const result = parser.parseExpr();
    if (parser.pos !== tokens.length) return NaN;
    return result;
  } catch {
    return NaN;
  }
}

type Token =
  | { type: 'NUM'; value: number }
  | { type: 'ID'; value: string }
  | { type: 'OP'; value: string }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    const numMatch = src.slice(i).match(/^[0-9]+(?:\.[0-9]+)?/);
    if (numMatch) {
      tokens.push({ type: 'NUM', value: parseFloat(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }

    if (ch === '[') {
      let value = '';
      let j = i + 1;
      let closed = false;
      while (j < src.length) {
        const current = src[j];
        if (current === '\\' && j + 1 < src.length) {
          value += current + src[j + 1];
          j += 2;
          continue;
        }
        if (current === ']') {
          closed = true;
          break;
        }
        value += current;
        j++;
      }
      if (!closed) throw new Error('missing ]');
      tokens.push({ type: 'ID', value: value.trim() });
      i = j + 1;
      continue;
    }

    const idMatch = src.slice(i).match(/^[\w\u3000-\u9FFF\uFF00-\uFFEF\u30A0-\u30FF\u3040-\u309F]+/);
    if (idMatch) {
      tokens.push({ type: 'ID', value: idMatch[0] });
      i += idMatch[0].length;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA' });
      i++;
      continue;
    }

    if (src.slice(i, i + 2) === '**') {
      tokens.push({ type: 'OP', value: '**' });
      i += 2;
      continue;
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }

    i++;
  }
  return tokens;
}

/**
 * The environment keyed by lower-cased name, so a formula naming a field finds it in one
 * step. Names are matched without regard to case, and a sheet can hold hundreds of them,
 * so working that out per name read would cost more than the sum it is there to work out.
 */
function foldCase(env: CalcEnv): CalcLookup {
  const folded = new Map<string, number>();
  for (const key of Object.keys(env)) {
    const lower = key.toLowerCase();
    // The first spelling wins, which is the one the old search would have reached first.
    if (!folded.has(lower)) folded.set(lower, env[key]);
  }
  return (name) => {
    const value = folded.get(name);
    return value !== undefined ? value : NaN;
  };
}

const FUNCTIONS = new Set(['floor', 'ceil', 'round', 'abs', 'min', 'max']);

class Parser {
  pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly env: CalcLookup
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  consume(): Token {
    return this.tokens[this.pos++];
  }

  /** expression = addSub */
  parseExpr(): number {
    return this.parseAddSub();
  }

  /** addSub = mulDiv (('+' | '-') mulDiv)* */
  parseAddSub(): number {
    let left = this.parseMulDiv();
    while (true) {
      const tok = this.peek();
      if (tok?.type !== 'OP' || (tok.value !== '+' && tok.value !== '-')) break;
      this.consume();
      const right = this.parseMulDiv();
      left = tok.value === '+' ? left + right : left - right;
    }
    return left;
  }

  /** mulDiv = power (('*' | '/') power)* */
  parseMulDiv(): number {
    let left = this.parsePower();
    while (true) {
      const tok = this.peek();
      if (tok?.type !== 'OP' || (tok.value !== '*' && tok.value !== '/')) break;
      this.consume();
      const right = this.parsePower();
      left = tok.value === '*' ? left * right : left / right;
    }
    return left;
  }

  /** power = unary ('**' unary)* (right-associative) */
  parsePower(): number {
    const base = this.parseUnary();
    const tok = this.peek();
    if (tok?.type === 'OP' && tok.value === '**') {
      this.consume();
      const exp = this.parsePower();
      return base ** exp;
    }
    return base;
  }

  /** unary = '-' unary | primary */
  parseUnary(): number {
    const tok = this.peek();
    if (tok?.type === 'OP' && tok.value === '-') {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  /** primary = NUM | func '(' args ')' | ID | '(' expr ')' */
  parsePrimary(): number {
    const tok = this.peek();
    if (!tok) throw new Error('unexpected end');

    if (tok.type === 'NUM') {
      this.consume();
      return tok.value;
    }

    if (tok.type === 'LPAREN') {
      this.consume();
      const val = this.parseExpr();
      if (this.peek()?.type !== 'RPAREN') throw new Error('missing )');
      this.consume();
      return val;
    }

    if (tok.type === 'ID') {
      this.consume();
      const name = tok.value.toLowerCase();

      if (FUNCTIONS.has(name) && this.peek()?.type === 'LPAREN') {
        this.consume();
        const args: number[] = [];
        while (this.peek()?.type !== 'RPAREN') {
          args.push(this.parseExpr());
          if (this.peek()?.type === 'COMMA') this.consume();
        }
        if (this.peek()?.type !== 'RPAREN') throw new Error('missing )');
        this.consume();
        switch (name) {
          case 'floor':
            return Math.floor(args[0] ?? 0);
          case 'ceil':
            return Math.ceil(args[0] ?? 0);
          case 'round':
            return Math.round(args[0] ?? 0);
          case 'abs':
            return Math.abs(args[0] ?? 0);
          case 'min':
            return args.length ? Math.min(...args) : 0;
          case 'max':
            return args.length ? Math.max(...args) : 0;
          default:
            return NaN;
        }
      }

      return this.env(name);
    }

    throw new Error(`unexpected token: ${JSON.stringify(tok)}`);
  }
}
