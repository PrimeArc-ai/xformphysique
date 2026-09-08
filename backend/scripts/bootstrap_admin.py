"""One-time operator bootstrap. Run from backend after the admin migration.

Never promotes an existing client/coach or resets an existing password.
Credentials are generated into a new, mode-0600, gitignored local file.
"""
import argparse
import json
import os
import secrets
from pathlib import Path

from app.core.config import get_settings
from app.core.supabase import SupabaseAdminGateway


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Credential file already exists; no account was changed.")
    gateway = SupabaseAdminGateway(get_settings())
    gateway.request("GET", "/rest/v1/admin_coach_events", params={"select": "id", "limit": 0})
    password = f"Xf!9{secrets.token_urlsafe(18)}"
    # Reserve the private output before account creation to prevent accidental overwrite.
    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w") as output:
        account = gateway.request("POST", "/auth/v1/admin/users", json={
            "email": args.email, "password": password, "email_confirm": True,
            "app_metadata": {"xform_role": "admin"}, "user_metadata": {"full_name": args.name},
        }).json()
        json.dump({"email": args.email, "password": password, "id": account["id"], "portal": "Admin"}, output, indent=2)
        output.write("\n")
    profile = gateway.request("GET", "/rest/v1/profiles", params={"id": f"eq.{account['id']}", "select": "role"}).json()
    if not profile or profile[0]["role"] != "admin":
        raise SystemExit("Account created but role provisioning failed. Check the migration; credentials saved privately.")
    print(f"Admin created. Credentials saved privately at {args.output.resolve()}")


if __name__ == "__main__":
    main()
