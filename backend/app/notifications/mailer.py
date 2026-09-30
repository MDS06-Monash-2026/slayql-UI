"""Outgoing email over SMTP (Gmail with an App Password by default)."""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

from backend.app.config import settings

logger = logging.getLogger(__name__)


class EmailNotConfigured(RuntimeError):
    pass


def _credentials() -> tuple[str, str]:
    user = (settings.SMTP_USER or settings.EMAIL or "").strip()
    password = (settings.SMTP_PASSWORD or settings.APP_PASS or "").replace(" ", "")
    return user, password


def email_configured() -> bool:
    user, password = _credentials()
    return bool(user and password)


def send_email(to: str, subject: str, text: str, html: Optional[str] = None) -> None:
    """Send one message. Raises EmailNotConfigured without credentials, and SMTP errors as they come."""
    user, password = _credentials()
    if not (user and password):
        raise EmailNotConfigured("Email is not set up: add SMTP_USER and SMTP_PASSWORD (or EMAIL and APP_PASS).")
    message = EmailMessage()
    message["From"] = formataddr((settings.SMTP_FROM_NAME, user))
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(message)
    logger.info("Sent email %r to %s", subject, to)
