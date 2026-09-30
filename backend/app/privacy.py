"""Privacy mode: mask personal-data columns before values reach AI providers."""
from __future__ import annotations

import re
from typing import Any, Dict, List

from backend.app.config import settings

# Column names that usually hold personal data, including Malaysian identifiers.
PERSONAL_COLUMN = re.compile(
    r"(^|_)(full_?name|first_?name|last_?name|name|email|e_?mail|phone|mobile|tel|contact|address|street|"
    r"postcode|zip|ic|ic_?no|mykad|nric|passport|ssn|dob|birth|date_of_birth)($|_)",
    re.I,
)
MASK = "[masked]"


def is_personal(column: str) -> bool:
    return bool(PERSONAL_COLUMN.search(column or ""))


def enabled() -> bool:
    return bool(settings.PRIVACY_MODE)


def mask_grounding(values: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not enabled():
        return values
    return [{**item, "value": MASK} if is_personal(str(item.get("column", ""))) else item for item in values]


def mask_rows(columns: List[str], rows: List[List[Any]]) -> List[List[Any]]:
    if not enabled():
        return rows
    personal = {index for index, name in enumerate(columns) if is_personal(name)}
    if not personal:
        return rows
    return [[MASK if index in personal else value for index, value in enumerate(row)] for row in rows]


def disclosure(*, grounding: List[Dict[str, Any]], answer_columns: List[str], answer_rows: int, answer_sent: bool,
               profiled: bool = False) -> Dict[str, Any]:
    """Plain record of what a run sent to AI providers, for the evidence panel."""
    masked_values = sum(1 for item in grounding if item.get("value") == MASK)
    masked_columns = [name for name in answer_columns if enabled() and is_personal(name)]
    sent = ["the question", "the relevant table structure"]
    if grounding:
        sent.append(f"{len(grounding)} matching database values" + (f" ({masked_values} masked)" if masked_values else ""))
    if profiled:
        sent.append("the values of status and code columns, with counts, and date ranges (no personal columns)")
    if answer_sent and answer_rows:
        rows = min(answer_rows, 25)
        sent.append(f"{rows} result rows for the written answer" + (f" (masked: {', '.join(masked_columns)})" if masked_columns else ""))
    return {"privacy_mode": enabled(), "sent": sent}
