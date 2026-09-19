"""Validate and upload existing backend settings without printing secret values."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = "4a269f17a7c54e86f05aa8b207d1d6a5"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--origin", help="Public HTTPS app origin, without a trailing path")
parser.add_argument("--check", action="store_true", help="Validate only; do not upload")
args = parser.parse_args()
backend = dotenv_values(ROOT / "backend/.env")
frontend = dotenv_values(ROOT / ".env.local")
required = ["XFORM_SUPABASE_URL", "XFORM_SUPABASE_PUBLISHABLE_KEY", "XFORM_R2_ACCOUNT_ID",
            "XFORM_R2_ACCESS_KEY_ID", "XFORM_R2_SECRET_ACCESS_KEY", "XFORM_R2_BUCKET_NAME"]
missing = [key for key in required if not backend.get(key)]
if missing:
    parser.error("Missing backend settings: " + ", ".join(missing))
if not (backend.get("XFORM_SUPABASE_SECRET_KEY") or backend.get("XFORM_SUPABASE_SERVICE_ROLE_KEY")):
    parser.error("A Supabase server key is required for client invitations")
if backend["XFORM_R2_ACCOUNT_ID"] != ACCOUNT:
    parser.error("R2 account does not match the deployment account")
endpoint = backend.get("XFORM_R2_ENDPOINT_URL")
if endpoint and endpoint.rstrip("/") != f"https://{ACCOUNT}.r2.cloudflarestorage.com":
    parser.error("R2 endpoint does not match the deployment account")
for name in ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]:
    if frontend.get("VITE_" + name) != backend.get("XFORM_" + name):
        parser.error("Frontend/backend mismatch: " + name)
if args.check:
    print("Validated matching Supabase settings and target-account R2 settings; no secrets uploaded.")
    raise SystemExit(0)
origin = urlparse(args.origin or "")
if origin.scheme != "https" or not origin.netloc or origin.path not in ("", "/") or origin.query or origin.fragment or origin.username:
    parser.error("--origin must be the deployed app's HTTPS origin")
public_origin = f"https://{origin.netloc}"
# Exclude local-only settings and the production mode managed by Wrangler vars.
excluded = {"XFORM_ENVIRONMENT", "XFORM_DATABASE_URL", "XFORM_STORAGE_DIR", "XFORM_DEMO_CLIENT_ID"}
values = {key: value for key, value in backend.items()
          if key.startswith("XFORM_") and key not in excluded and value}
values["XFORM_CORS_ORIGINS"] = public_origin
values["XFORM_CLIENT_INVITE_REDIRECT_URL"] = public_origin + "/"
subprocess.run(["pnpm", "exec", "wrangler", "secret", "bulk"], cwd=ROOT,
               input=json.dumps(values), text=True, check=True)
print("Cloudflare runtime settings synchronized. Add the app origin to Supabase Auth redirect URLs.")
