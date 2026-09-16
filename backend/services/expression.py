"""
Declarative expression evaluation for the workflow engine.

Two related capabilities, both fixed-implementation (configurable by data only):

1. ``evaluate_arithmetic`` — a tiny, whitelisted arithmetic evaluator used by
   conditions. Supports numbers, ``$field`` / ``{field}`` references into
   an entity's ``custom_fields``, ``+ - * /``, parentheses, and unary minus.
   No ``eval()``, no arbitrary code — only the operators below are reachable.

2. ``render_template`` — ``{{placeholder}}`` string interpolation used by
   post-transition side-effect actions. Supported placeholders:
     - ``{{field_name}}``   -> current entity ``custom_fields[field_name]``
     - ``{{now}}``          -> current UTC timestamp (ISO 8601)
   Unresolvable placeholders resolve to an empty string (and are reported).

These are the ONLY two ways config can compute values in a workflow; everything
else stays declarative data.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

_OPERATORS = {"+", "-", "*", "/", "(", ")", "u-"}
_PRECEDENCE = {"+": 1, "-": 1, "*": 2, "/": 2, "u-": 3}


class ExpressionError(Exception):
    """Raised when a configured expression cannot be evaluated."""

    def __init__(self, message: str, expression: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.expression = expression


_TOKEN_RE = re.compile(
    r"""
    (?P<num>\d+\.\d+|\d+)
  | (?P<field>\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\})
  | (?P<dollar>\$[A-Za-z_][A-Za-z0-9_]*)
  | (?P<op>[-+*/()])
  | (?P<ws>\s+)
""",
    re.VERBOSE,
)


def _tokenize(expression: str) -> List[Tuple[str, str]]:
    tokens: List[Tuple[str, str]] = []
    pos = 0
    while pos < len(expression):
        m = _TOKEN_RE.match(expression, pos)
        if not m:
            raise ExpressionError(f"Unexpected character '{expression[pos]}' at position {pos}", expression)
        pos = m.end()
        kind = m.lastgroup
        if kind == "ws":
            continue
        tokens.append((kind, m.group().strip()))
    return tokens


def _to_rpn(tokens: List[Tuple[str, str]], expression: str) -> List[Tuple[str, str]]:
    """Shunting-yard -> RPN token list so evaluation needs no recursion."""
    output: List[Tuple[str, str]] = []
    stack: List[Tuple[str, str]] = []

    prev: Optional[Tuple[str, str]] = None
    for tok in tokens:
        kind, value = tok
        if kind in ("num", "field", "dollar"):
            output.append(tok)
        elif value in ("+", "-") and (
            prev is None
            or prev[1] in ("+", "-", "*", "/", "(")
            or (prev[0] == "op" and prev[1] == "(")
        ):
            # Unary minus (and harmless unary plus) -> treat as u-
            stack.append(("op", "u-" if value == "-" else "+"))
        elif value == "(":
            stack.append(tok)
        elif value == ")":
            while stack and stack[-1][1] != "(":
                output.append(stack.pop())
            if not stack:
                raise ExpressionError("Mismatched parentheses", expression)
            stack.pop()
        else:  # binary operator
            while (
                stack
                and stack[-1][1] != "("
                and _PRECEDENCE.get(stack[-1][1], 0) >= _PRECEDENCE.get(value, 0)
            ):
                output.append(stack.pop())
            stack.append(tok)
        prev = tok

    while stack:
        tok = stack.pop()
        if tok[1] == "(":
            raise ExpressionError("Mismatched parentheses", expression)
        output.append(tok)
    return output


def _resolve_field(name: str, fields: Dict[str, Any], expression: Optional[str]) -> float:
    key = name.strip().strip("{}").lstrip("$")
    if key not in fields:
        raise ExpressionError(f"Missing referenced field '{key}'", expression)
    val = fields[key]
    try:
        return float(val)
    except (TypeError, ValueError):
        raise ExpressionError(f"Field '{key}' is not numeric (got {val!r})", expression)


def evaluate_arithmetic(expression: str, fields: Dict[str, Any]) -> float:
    """
    Evaluates a whitelisted arithmetic expression against a fields dict.

    Example: ``"($estlabcost + $estmatcost) / $estlabcost"``

    Raises ExpressionError on malformed expressions or missing/non-numeric
    referenced fields. Never evaluates Python code.
    """
    expression = (expression or "").strip()
    if not expression:
        raise ExpressionError("Empty expression")
    if len(expression) > 512:
        raise ExpressionError("Expression too long (max 512 chars)")

    tokens = _tokenize(expression)
    rpn = _to_rpn(tokens, expression)

    stack: List[float] = []
    for kind, value in rpn:
        if kind == "num":
            stack.append(float(value))
        elif kind in ("field", "dollar"):
            stack.append(_resolve_field(value, fields, expression))
        elif value == "u-":
            if not stack:
                raise ExpressionError("Unary minus has no operand", expression)
            stack.append(-stack.pop())
        else:
            if len(stack) < 2:
                raise ExpressionError(f"Operator '{value}' is missing operands", expression)
            b = stack.pop()
            a = stack.pop()
            if value == "+":
                stack.append(a + b)
            elif value == "-":
                stack.append(a - b)
            elif value == "*":
                stack.append(a * b)
            elif value == "/":
                if b == 0:
                    raise ExpressionError("Division by zero", expression)
                stack.append(a / b)

    if len(stack) != 1:
        raise ExpressionError("Expression did not reduce to a single value", expression)
    return stack[0]


_TEMPLATE_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


def render_template(template: str, fields: Dict[str, Any]) -> Tuple[str, List[str]]:
    """
    Renders a ``{{placeholder}}`` template against a fields dict.

    Returns ``(rendered, unresolved)`` where ``unresolved`` lists any
    placeholders that had no matching field (rendered as empty string).
    """
    unresolved: List[str] = []

    def _sub(m: re.Match) -> str:
        name = m.group(1)
        if name == "now":
            return datetime.now(timezone.utc).isoformat()
        if name in fields and fields[name] is not None:
            return str(fields[name])
        unresolved.append(name)
        return ""

    rendered = _TEMPLATE_RE.sub(_sub, template)
    return rendered, unresolved


def render_template_mapping(
    mapping: Dict[str, Any],
    fields: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Renders every value of a mapping (str values only through the template
    engine; non-str values pass through unchanged). Returns rendered mapping
    plus the flattened list of unresolved placeholders.
    """
    rendered: Dict[str, Any] = {}
    all_unresolved: List[str] = []
    for key, value in mapping.items():
        if isinstance(value, str):
            out, unresolved = render_template(value, fields)
            all_unresolved.extend(unresolved)
            rendered[key] = out
        else:
            rendered[key] = value
    return rendered, all_unresolved