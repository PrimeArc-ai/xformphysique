"""Additive SQLite demo upgrades. Never drop tables or rewrite historical answers."""
from sqlalchemy import inspect, text


def upgrade_local_schema(engine):
    if engine.dialect.name != "sqlite":
        return
    additions = {
        "check_ins": {"questionnaire_version": "INTEGER NOT NULL DEFAULT 1", "ratings": "JSON NOT NULL DEFAULT '{}'",
                      "challenges": "TEXT NOT NULL DEFAULT ''", "additional_comments": "TEXT NOT NULL DEFAULT ''"},
        "progress_photos": {"deleted_at": "DATETIME"},
        "meals": {"coach_instructions": "TEXT NOT NULL DEFAULT ''", "preparation": "TEXT NOT NULL DEFAULT ''"},
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table, columns in additions.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {definition}'))
