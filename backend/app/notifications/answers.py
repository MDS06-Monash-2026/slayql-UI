"""Tell the person who asked when an analyst has dealt with their question."""
from __future__ import annotations

import html
import logging
import threading
from typing import Any, Dict, Optional

from backend.app.accounts.store import account_store
from backend.app.config import settings
from backend.app.notifications.mailer import email_configured, send_email
from backend.app.verification.models import result_preview

logger = logging.getLogger(__name__)

VERDICT = {
    "confirmed": "An analyst checked SlayQL's answer to your question and confirmed it.",
    "corrected": "An analyst checked your question and corrected the answer.",
    "dismissed": "An analyst looked at your question and decided it cannot be answered from this data.",
}


def compose(item: Dict[str, Any], answer: Any, name: str = "") -> Dict[str, str]:
    """Subject, plain text and HTML for one answered question."""
    question = item.get("question") or ""
    verdict = VERDICT.get(item.get("resolution") or "", "An analyst has reviewed your question.")
    preview = result_preview(answer) if answer is not None and not getattr(answer, "error", None) else ""
    note = (item.get("resolution_note") or "").strip()
    reviewer = item.get("reviewed_by") or "the analyst"
    subject = f"Answered: {question[:70]}{'…' if len(question) > 70 else ''}"
    lines = [f"Hi {name}," if name else "Hi,", "", verdict, "", f"Your question: {question}"]
    if preview:
        lines.append(f"Answer: {preview}")
    if note:
        lines.append(f"Note from {reviewer}: {note}")
    url = settings.PUBLIC_APP_URL.strip()
    lines += ["", f"Open SlayQL to see the full result: {url}" if url else "Open SlayQL to see the full result.", "", "SlayQL"]
    body = "".join([
        f"<p>{html.escape(lines[0])}</p>",
        f"<p>{html.escape(verdict)}</p>",
        f"<p style=\"color:#475569\">Your question</p><p style=\"font-size:16px\"><b>{html.escape(question)}</b></p>",
        f"<p style=\"color:#475569\">Answer</p><p style=\"font-size:22px;font-family:monospace\">{html.escape(preview)}</p>" if preview else "",
        f"<p><i>Note from {html.escape(reviewer)}:</i> {html.escape(note)}</p>" if note else "",
        f"<p><a href=\"{html.escape(url)}\">Open SlayQL</a> to see the full result.</p>" if url else "<p>Open SlayQL to see the full result.</p>",
    ])
    return {"subject": subject, "text": "\n".join(lines), "html": body}


def notify_asker(item: Optional[Dict[str, Any]], answer: Any = None) -> bool:
    """Email the asker in the background if notifications are on. Returns whether an email was queued."""
    if not item or not settings.EMAIL_NOTIFICATIONS or not email_configured() or not item.get("owner_id"):
        return False
    profile = account_store.get(item["owner_id"]) or {}
    to = (profile.get("email") or "").strip()
    if not to or to.endswith(".demo"):
        return False  # Shared demo accounts have no real inbox.
    message = compose(item, answer, (profile.get("name") or "").split(" ")[0])

    def send() -> None:
        try:
            send_email(to, message["subject"], message["text"], message["html"])
        except Exception:  # Email must never break resolving a review.
            logger.exception("Could not email the asker of review item %s", item.get("id"))

    threading.Thread(target=send, daemon=True).start()
    return True
