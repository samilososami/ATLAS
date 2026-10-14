"""Persistent, revocable browser sessions. No plaintext passwords or chat storage."""
from __future__ import annotations
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from pathlib import Path

COOKIE = "__Host-atlas_portal"
TTL = 30 * 86400

def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"

def verify_password(password: str, encoded: str) -> bool:
    if not isinstance(password, str) or not 1 <= len(password) <= 256:
        return False
    kind, salt, _ = encoded.split("$")
    return kind == "scrypt" and hmac.compare_digest(password_hash(password, salt), encoded)

class Auth:
    def __init__(self, directory: Path, config: dict, clock=time.time):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(directory, 0o700)
        self.clock, self.config = clock, config
        self.db = sqlite3.connect(directory / "access.sqlite")
        os.chmod(directory / "access.sqlite", 0o600)
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires REAL);
          CREATE TABLE IF NOT EXISTS attempts (bucket TEXT, at REAL);
          CREATE INDEX IF NOT EXISTS attempts_bucket ON attempts(bucket,at);
        """)

    def digest(self, value: str) -> str:
        return hmac.new(bytes.fromhex(self.config["session_key"]), value.encode(), hashlib.sha256).hexdigest()

    def session(self, token: str) -> str | None:
        if len(token) > 200:
            return None
        sid = self.digest(token)
        row = self.db.execute("SELECT expires FROM sessions WHERE id=?", (sid,)).fetchone()
        return sid if row and row[0] > self.clock() else None

    def issue(self) -> str:
        token = secrets.token_urlsafe(40)
        now = self.clock()
        with self.db:
            self.db.execute("DELETE FROM sessions WHERE expires <= ?", (now,))
            self.db.execute("INSERT INTO sessions VALUES (?,?)", (self.digest(token), now + TTL))
        return token

    def revoke(self, token: str):
        with self.db:
            self.db.execute("DELETE FROM sessions WHERE id=?", (self.digest(token),))

    def csrf(self, token: str) -> str:
        return self.digest("csrf:" + token)

    def attempt(self, client: str) -> bool:
        """Global ceiling cannot be bypassed by forging forwarded IP headers."""
        now, bucket = self.clock(), self.digest("ip:" + client)
        with self.db:
            self.db.execute("DELETE FROM attempts WHERE at<?", (now - 900,))
            total = self.db.execute("SELECT count(*) FROM attempts").fetchone()[0]
            count = self.db.execute("SELECT count(*) FROM attempts WHERE bucket=?", (bucket,)).fetchone()[0]
            if total >= 30 or count >= 5:
                return False
            self.db.execute("INSERT INTO attempts VALUES (?,?)", (bucket, now))
        return True
