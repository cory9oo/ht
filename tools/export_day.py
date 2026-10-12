#!/usr/bin/env python3
r"""export_day.py - export HT day data to JSON files for the BEV ledger (job 852).

Runs in GitHub Actions where HT_EXPORT_DB_URL is a repo secret. For each day not yet
exported, queries Supabase for counts and the rating, writes one JSON per day to --out-dir:

  YYYY-MM-DD.json  ->  {"date": "...", "tasks_completed": N, "habits_pct": F, "rating": R,
                         "exported_at": "ISO"}

NO journal text (brain_dump, prayer, why) is exported — the export branch is public; those
columns are Cory's journal and never leave his database (R47.3).

    python tools/export_day.py --out-dir /tmp/ht-export        # new days only
    python tools/export_day.py --out-dir /tmp/ht-export --all  # re-export all days
"""
import argparse
import datetime
import json
import os
import sys

SECRET_NAME = "HT_EXPORT_DB_URL"


def _connect(url):
    try:
        import psycopg
        return psycopg.connect(url, sslmode="require", connect_timeout=10)
    except ImportError:
        import psycopg2
        return psycopg2.connect(url, sslmode="require", connect_timeout=10)


def _existing_days(out_dir):
    if not os.path.isdir(out_dir):
        return set()
    return {
        os.path.splitext(f)[0]
        for f in os.listdir(out_dir)
        if len(f) == 15 and f.endswith(".json")   # YYYY-MM-DD.json = 15 chars
    }


def export_days(conn, out_dir, skip=None):
    """Export all days except those in `skip`. -> count of files written."""
    os.makedirs(out_dir, exist_ok=True)
    skip = skip or set()

    cur = conn.cursor()
    cur.execute("SELECT date::text, tasks, rating FROM public.day_private ORDER BY date")
    priv = {row[0]: {"tasks": row[1], "rating": row[2]} for row in cur.fetchall()}

    cur.execute("SELECT date::text, pct FROM public.days ORDER BY date")
    days = {row[0]: {"pct": row[1]} for row in cur.fetchall()}
    cur.close()

    all_dates = sorted(set(priv) | set(days))
    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    written = 0

    for day in all_dates:
        if day in skip:
            continue
        p = priv.get(day, {})
        d = days.get(day, {})

        tasks_text = (p.get("tasks") or "").strip()
        tasks_completed = sum(
            1 for ln in tasks_text.splitlines() if ln.strip().lstrip("-* ").strip()
        )

        pct = d.get("pct")
        habits_pct = round(float(pct), 1) if pct is not None else None

        rating = p.get("rating")
        rating_int = int(rating) if rating is not None else None

        rec = {
            "date": day,
            "habits_pct": habits_pct,
            "rating": rating_int,
            "tasks_completed": tasks_completed,
            "exported_at": now,
        }

        fp = os.path.join(out_dir, "%s.json" % day)
        with open(fp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(rec, f, sort_keys=True)
            f.write("\n")
        written += 1

    return written


def main(argv=None):
    ap = argparse.ArgumentParser(description="Export HT day data to JSON (job 852).")
    ap.add_argument("--out-dir", required=True, help="directory to write day JSON files")
    ap.add_argument("--all", action="store_true", help="re-export all days (ignore existing files)")
    a = ap.parse_args(argv)

    url = os.environ.get(SECRET_NAME, "").strip()
    if not url:
        sys.stderr.write(
            "::error::%s secret is unset. One click to fix: "
            "Settings → Secrets and variables → Actions → "
            "New repository secret → Name: %s, Value: the postgres "
            "connection string for a read-only role on Cory's Supabase instance.\n"
            % (SECRET_NAME, SECRET_NAME)
        )
        return 1

    try:
        conn = _connect(url)
    except Exception as e:                              # noqa: BLE001
        sys.stderr.write("::error::cannot connect to Supabase (%s)\n" % type(e).__name__)
        return 1

    skip = set() if a.all else _existing_days(a.out_dir)
    try:
        n = export_days(conn, a.out_dir, skip=skip)
    except Exception as e:                              # noqa: BLE001
        sys.stderr.write("::error::export failed (%s)\n" % type(e).__name__)
        return 1
    finally:
        try:
            conn.close()
        except Exception:                               # noqa: BLE001
            pass

    sys.stdout.write("exported %d day file(s) to %s\n" % (n, a.out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
