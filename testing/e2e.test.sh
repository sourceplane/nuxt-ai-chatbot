#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, migrates, deploys (dry)
# and serves.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree.
# This proves it WORKS, by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its one pull request merges),
#      install with the lockfile the product ships, render the wrangler
#      fixture and check the committed config IS that render, typecheck,
#      lint, test, build. The landing's own PR runs `plan` alone (an
#      `orun/BASE-*` branch), so THIS is where a product those steps refuse
#      is caught: before the tag, not after a build has merged it;
#   2. the stage lanes' own steps, rendered by `orun plan` in the product and
#      run IN THE TREE THE RUNNER STAGES for each job (testing/lib/stage-job.py),
#      with the dependency layout the pinned composition produces and with the
#      job's secrets in its environment as the platform resolves them (the
#      component's secretEnv, and its optionalSecretEnv as an owner who has
#      connected everything would have it):
#      - web, from a pull request's plan (the verify profile: the deploy
#        profile has no dry run) — `verify-app-structure` (which checks the
#        wrangler config exists BEFORE anything is built), `build-app` (the
#        component's buildCommand: the live wiring render, the build without
#        the optional secrets, then the hand-off of those secrets to the
#        Worker, which a verify lane — no Cloudflare credential — skips),
#        `verify-build-output` and `deploy-dry-run` (`wrangler deploy
#        --dry-run --name <reponame>-web-stage`); the database id and the
#        bucket name in the built config asserted to be the stage documents',
#        not the fixture's, and no built file holding an optional secret;
#      - db-migrate: its install and build, the pull request's `plan` (offline,
#        every checksum verified), then the merge's `apply` — the step a push
#        to main runs — against a stand-in for D1's REST API over real SQLite
#        (testing/lib/d1-api.py), which refuses any account, database or token
#        but the ones the job resolves: the chat's schema created, the
#        session key generated and every migration recorded; then the apply
#        again, which applies nothing;
#   3. serve the built Worker with `wrangler dev` (a local D1 behind DB, a
#      local bucket behind BLOB, and Workers AI — which has no local mode —
#      a deterministic stand-in behind AI, testing/lib/fake-ai): with no
#      schema the Worker has no session key and the component's OWN
#      `smokeCommand` REFUSES the site; after the product's own
#      `db:migrate:local` the smoke passes, verbatim — the check the real
#      deploy ends with — and then every route the chat promises: the page
#      titled with the product's name; what a fresh deployment offers (Workers
#      AI's models, no dictation, no sign-in); CSRF kept; a chat created and
#      answered through the AI binding as a stream, titled by the fast model,
#      persisted in D1 and listed, and a gateway model without its key
#      answered by Workers AI; another visitor shut out of it; uploads
#      refused signed out, and — signed in with a session cookie sealed under
#      the key the database generated — an upload written to R2, served back
#      and deleted; GitHub sign-in refusing quietly while it is not
#      connected; then the owner's secrets handed to the Worker as wrangler
#      dev's .dev.vars (the same tooling/wire/worker-secrets.mjs the deploy
#      runs): the gateway's models, dictation and GitHub sign-in offered, and
#      the sign-in sending the visitor to GitHub with the app's client id.
#
# What it cannot do is the platform's half: create the repository, mint the
# brokered Cloudflare tokens, apply the database, migrate it and deploy for
# real, probe workers.dev — and call a real model. The D1 and R2 roots are
# verified to `terraform validate` and their plans are part of every pull
# request's lanes; the applies need an account. The stand-in proves the app's
# half of a chat (the route, the provider, the stream, the persistence), not
# that a Workers AI model answers: that is only verified live.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, and the network for
# `pnpm install` (or a warm store). Several minutes: three installs and two
# builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"

for bin in orun node pnpm python3 git curl; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done

scratch="$(mktemp -d)"
dev_pid=""
api_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So it is
# started as its own process group (setsid) and the whole group is stopped.
stop_group() {
  kill -TERM -- "-$1" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$1" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$1" 2>/dev/null || true
}
cleanup() {
  [ -z "$dev_pid" ] || stop_group "$dev_pid"
  [ -z "$api_pid" ] || stop_group "$api_pid"
  rm -rf "$scratch"
}
trap cleanup EXIT
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NUXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step: what a pull request in the product
# verifies through its lanes, run here at once on the whole tree.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "git diff --exit-code"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

# A job's steps out of a plan, by component and environment: each step's
# script (named by its id, or by a fixed name for the composition steps this
# file runs), the job's path, its env and the names of its secrets.
extract() { # PLAN COMPONENT ENV OUTDIR
  python3 - "$@" <<'PY'
import json, pathlib, re, sys
plan, comp, env, out = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3], pathlib.Path(sys.argv[4])
out.mkdir(parents=True, exist_ok=True)
job = next(j for j in plan["jobs"] if j["component"] == comp and j["environment"] == env)
for s in job["steps"]:
    run = s.get("run") or ""
    if not run:
        continue
    sid = s["id"]
    if "dist/runner/cli.js apply" in run:
        sid = "migrate-apply"
    elif "dist/runner/cli.js plan" in run:
        sid = "migrate-plan"
    (out / f"{re.sub(r'[^A-Za-z0-9_-]', '_', sid)}.sh").write_text(run)
    if s["id"] in ("install-workspace-dependencies", "install-dependencies"):
        (out / "install.sh").write_text(run)
        (out / "install.wd").write_text(s.get("working-directory") or ".")
        (out / "install.scope").write_text(s.get("scope") or "job")
(out / "path").write_text(job.get("path") or ".")
(out / "env").write_text("".join(f"export {k}={json.dumps(v)}\n" for k, v in (job.get("env") or {}).items()))
(out / "secrets").write_text("\n".join(r["asEnv"] for r in job.get("secretRefs") or []))
PY
}

# A job's private tree, staged as orun stages it. The source checkout carries
# no build output (nothing was built in it), and its dependencies are what the
# pinned composition says: a lane-scoped install ran once in the source tree
# and is linked in, or the job installs its own.
stage_job() { # STEPS-DIR WORK-DIR LOG
  local steps="$1" work="$2" log="$3"
  [ -f "$steps/install.sh" ] || { echo "FAIL: the lane has no install step" >&2; return 1; }
  if [ "$(cat "$steps/install.scope")" = lane ]; then
    (cd "$tree" && bash -e "$steps/install.sh") > "$log" 2>&1 \
      || { echo "FAIL: the lane's install step" >&2; tail -30 "$log" >&2; return 1; }
    python3 "$here/lib/stage-job.py" "$tree" "$work" --shared-deps
    [ -L "$work/node_modules" ] || { echo "FAIL: the staged tree's node_modules is not the lane's symlink" >&2; return 1; }
    echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: lane — node_modules → the source tree's"
  else
    python3 "$here/lib/stage-job.py" "$tree" "$work"
    echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: job — installing inside it"
    (cd "$work/$(cat "$steps/path")/$(cat "$steps/install.wd")" && bash -e "$steps/install.sh") > "$log" 2>&1 \
      || { echo "FAIL: the lane's install step" >&2; tail -30 "$log" >&2; return 1; }
    [ -d "$work/node_modules" ] && [ ! -L "$work/node_modules" ] \
      || { echo "FAIL: the job's install did not land inside its own tree" >&2; return 1; }
  fi
}

# One step, in the runner's per-job environment: the job's env (intent
# environment `env:`), its resolved secrets (exported by the caller) and
# ORUN_ENVIRONMENT; the step runs in the component's directory.
run_step() { # STEPS-DIR WORK-DIR STEP LOG
  local steps="$1" work="$2" step="$3" log="$4"
  [ -f "$steps/$step.sh" ] || { echo "FAIL: the stage lane has no $step step" >&2; return 1; }
  echo "   ▸ $step"
  if ! (cd "$work/$(cat "$steps/path")" && source "$steps/env" && export ORUN_ENVIRONMENT=stage \
        && bash -e "$steps/$step.sh") > "$log" 2>&1; then
    echo "FAIL: the lane's $step step" >&2; tail -40 "$log" >&2; return 1
  fi
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"
s01="$(git -C "$tree" rev-parse HEAD~1)"

# ── 1. the product's one pull request ──────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
git -C "$tree" worktree add -q "$scratch/at-01" "$s01"
checks "$scratch/at-01" "$scratch/checks-01.log"
# The landing's build is done; its tree is not needed again, and the disk is shared.
git -C "$tree" worktree remove --force "$scratch/at-01"

# ── 2. the stage lanes' steps, in each job's own tree ─────────────────────
# A pull request that changes the site and the migration component: the lanes
# `orun plan` gives it. And the merge's plan, for the step only a merge runs.
git -C "$tree" checkout -q -b e2e-pr
echo "<!-- a change to the site's component -->" >> "$tree/apps/web/README.md"
echo "# a change to the migration component" >> "$tree/infra/db-migrate/component.yaml"
git -C "$tree" -c user.email=e2e@example.invalid -c user.name=e2e commit -qam "a pull request"
(cd "$tree" && orun plan --intent intent.yaml --trigger github-pull-request --changed \
   --base main --head HEAD --env stage --output "$scratch/plan.json") > "$scratch/plan.log" 2>&1 \
  || { echo "FAIL: orun plan (pull request)" >&2; tail -15 "$scratch/plan.log" >&2; exit 1; }
(cd "$tree" && orun plan --intent intent.yaml --trigger github-push-main --env stage \
   --output "$scratch/plan-main.json") > "$scratch/plan-main.log" 2>&1 \
  || { echo "FAIL: orun plan (push to main)" >&2; tail -15 "$scratch/plan-main.log" >&2; exit 1; }
extract "$scratch/plan.json" web stage "$scratch/web"
extract "$scratch/plan.json" db-migrate stage "$scratch/mig"
extract "$scratch/plan-main.json" db-migrate stage "$scratch/mig-main"

# What the platform resolves into the jobs before their first step: the
# wiring document the D1 root lease-published (the components' secretEnv),
# with a database id no fixture carries, so the built config and the
# migrated database prove which document they came from.
d1_id="5ca1ab1e-0000-4000-8000-00000000a001"
export WIRING_CLOUDFLARE_D1_STAGE='{"d1_database_id":"'"$d1_id"'","d1_database_name":"stg-'"$repo"'-stage"}'
export WIRING_CLOUDFLARE_D1_PROD='{"d1_database_id":"5ca1ab1e-0000-4000-8000-00000000a003","d1_database_name":"prod-'"$repo"'-prod"}'
# …and the bucket the R2 root lease-published, under a name no fixture carries.
r2_bucket="e2e-$repo-stage-bucket"
export WIRING_CLOUDFLARE_R2_STAGE='{"r2_bucket_name":"'"$r2_bucket"'"}'
export WIRING_CLOUDFLARE_R2_PROD='{"r2_bucket_name":"e2e-'"$repo"'-prod-bucket"}'

echo "── the stage web lane: verify-app-structure, build-app, verify-build-output, deploy-dry-run"
for key in WIRING_CLOUDFLARE_D1_STAGE WIRING_CLOUDFLARE_D1_PROD WIRING_CLOUDFLARE_R2_STAGE WIRING_CLOUDFLARE_R2_PROD; do
  grep -qx "$key" "$scratch/web/secrets" || { echo "FAIL: the stage web lane does not resolve $key" >&2; exit 1; }
done
work="$tree/.orun/runs/e2e/web.stage.verify-deploy/work"
stage_job "$scratch/web" "$work" "$scratch/install-web.log"
[ ! -e "$work/apps/web/.output" ] || { echo "FAIL: the staged tree carries build output" >&2; exit 1; }
# The optional secrets as the platform resolves them for an owner who has set
# them all (optionalSecretEnv), each a canary no build may keep.
canaries=(NUXT_OAUTH_GITHUB_CLIENT_ID=e2e-canary-github-id NUXT_OAUTH_GITHUB_CLIENT_SECRET=e2e-canary-github-secret
          AI_GATEWAY_API_KEY=e2e-canary-gateway-key NUXT_SESSION_PASSWORD=e2e-canary-session-password-0123456789)
for step in verify-app-structure build-app verify-build-output deploy-dry-run; do
  if [ "$step" = build-app ]; then
    (export "${canaries[@]}" && run_step "$scratch/web" "$work" "$step" "$scratch/$step.log") || exit 1
  else
    run_step "$scratch/web" "$work" "$step" "$scratch/$step.log"
  fi
done
for canary in "${canaries[@]}"; do
  if grep -rlF "${canary#*=}" "$work/apps/web/.output" "$work/apps/web/.nuxt" "$work/apps/web/node_modules/.cache" 2>/dev/null | head -1 | grep -q .; then
    echo "FAIL: a built file holds ${canary%%=*} — the build must run without the optional secrets" >&2; exit 1
  fi
done
grep -q "worker-secrets: no Cloudflare credential in this job" "$scratch/build-app.log" \
  || { echo "FAIL: the verify lane's build did not leave the secrets to the deploy lane" >&2; tail -10 "$scratch/build-app.log" >&2; exit 1; }
grep -q "\"$d1_id\"" "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: the lane's build did not render the stage database id from its wiring document" >&2; exit 1; }
grep -q "\"$r2_bucket\"" "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: the lane's build did not render the stage bucket from its wiring document" >&2; exit 1; }
# wrangler's dry run names a D1 binding's database by name, not id.
grep -Eq "env\.DB \(stg-$repo-stage\) +D1 Database" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind DB to the stage database" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
grep -Eq "env\.BLOB \($r2_bucket\) +R2 Bucket" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind BLOB to the stage bucket" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
grep -Eq "env\.AI +AI" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind Workers AI as AI" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
size="$(grep -Eo 'Total Upload: [0-9.]+ KiB / gzip: [0-9.]+ KiB' "$scratch/deploy-dry-run.log" | head -1)"
gz="$(grep -Eo 'gzip: [0-9.]+ KiB' <<<"$size" | grep -Eo '[0-9.]+' || true)"
if [ -n "$gz" ] && python3 -c "import sys;sys.exit(0 if float(sys.argv[1]) <= 3072 else 1)" "$gz"; then :; else
  echo "FAIL: the Worker is ${size:-of unknown size} — over Workers Free's 3 MiB gzipped" >&2; exit 1
fi
echo "   the built config binds DB to the stage document's database ($d1_id), BLOB to its bucket ($r2_bucket)"
echo "   and AI to Workers AI; no built file holds an optional secret; the dry run accepts it — $size (Workers Free)"

echo "── the stage db-migrate lane: install, build, the PR's plan, the merge's apply (a stand-in D1 API)"
for key in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID WIRING_CLOUDFLARE_D1; do
  grep -qx "$key" "$scratch/mig-main/secrets" || { echo "FAIL: the stage db-migrate lane does not resolve $key" >&2; exit 1; }
done
[ -f "$scratch/mig/migrate-plan.sh" ] && [ ! -f "$scratch/mig/migrate-apply.sh" ] \
  || { echo "FAIL: a pull request's db-migrate lane must plan and not apply" >&2; ls "$scratch/mig" >&2; exit 1; }
[ -f "$scratch/mig-main/migrate-apply.sh" ] && [ ! -f "$scratch/mig-main/migrate-plan.sh" ] \
  || { echo "FAIL: the merge's db-migrate lane must apply" >&2; ls "$scratch/mig-main" >&2; exit 1; }
mwork="$tree/.orun/runs/e2e/db-migrate.stage.migrate/work"
stage_job "$scratch/mig" "$mwork" "$scratch/install-mig.log"
run_step "$scratch/mig" "$mwork" build-db-package "$scratch/mig-build.log"
run_step "$scratch/mig" "$mwork" migrate-plan "$scratch/mig-plan.log"
grep -q '"010_chat"' "$scratch/mig-plan.log" && grep -q '"020_app_secrets"' "$scratch/mig-plan.log" \
  || { echo "FAIL: the plan does not list 010_chat and 020_app_secrets as pending" >&2; cat "$scratch/mig-plan.log" >&2; exit 1; }
# The stand-in D1 API: only this account, this database (the stage
# document's id) and this token are answered.
(exec setsid python3 "$here/lib/d1-api.py" "$scratch/d1.sqlite" "$scratch/d1.port" \
   --account e2e-account --database "$d1_id" --token e2e-d1-token) > "$scratch/d1-api.log" 2>&1 < /dev/null &
api_pid=$!
for _ in $(seq 1 50); do [ -s "$scratch/d1.port" ] && break; sleep 0.1; done
[ -s "$scratch/d1.port" ] || { echo "FAIL: the stand-in D1 API did not start" >&2; cat "$scratch/d1-api.log" >&2; exit 1; }
export CLOUDFLARE_API_BASE_URL="http://127.0.0.1:$(cat "$scratch/d1.port")/client/v4"
# The job's own secrets: the D1 token as CLOUDFLARE_API_TOKEN, the account id,
# and this environment's wiring document.
for pass in first again; do
  (export CLOUDFLARE_API_TOKEN=e2e-d1-token CLOUDFLARE_ACCOUNT_ID=e2e-account \
          WIRING_CLOUDFLARE_D1="$WIRING_CLOUDFLARE_D1_STAGE" \
   && run_step "$scratch/mig-main" "$mwork" migrate-apply "$scratch/mig-apply-$pass.log") || exit 1
done
python3 - "$scratch/d1.sqlite" "$scratch/mig-apply-first.log" "$scratch/mig-apply-again.log" <<'PY'
import json, re, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
def result(path):
    text = open(path).read()
    return json.loads(text[text.index("{"):text.rindex("}") + 1])
first, again = result(sys.argv[2]), result(sys.argv[3])
problems = []
ALL = ["000_control_baseline", "010_chat", "020_app_secrets"]
if first["applied"] != ALL:
    problems.append(f"the first apply applied {first['applied']}")
if again["applied"] or again["skipped"] != ALL:
    problems.append(f"the second apply applied {again['applied']} and skipped {again['skipped']} — it must apply nothing")
have = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
for t in ("users", "chats", "messages", "votes"):
    if t not in have:
        problems.append(f"the chat's schema has no {t} table")
secrets = dict(db.execute("SELECT name, value FROM app_secrets"))
if sorted(secrets) != ["session"] or not all(re.fullmatch(r"[0-9a-f]{64}", v) for v in secrets.values()):
    problems.append(f"the generated secrets are {sorted(secrets)}")
ledger = [r[0] for r in db.execute("SELECT id FROM _migrations_applied ORDER BY id")]
if ledger != ALL:
    problems.append(f"the ledger records {ledger}")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
sys.exit(1 if problems else 0)
PY
grep -q 'POST /client/v4/accounts/e2e-account/d1/database/'"$d1_id"'/query' "$scratch/d1-api.log" \
  || { echo "FAIL: the runner did not call the stage database's query endpoint" >&2; exit 1; }
echo "   the stage document's database: the chat's schema created, the session key generated, all three migrations"
echo "   recorded; the second apply applied nothing"
stop_group "$api_pid"; api_pid=""
unset CLOUDFLARE_API_BASE_URL


# ── 3. serve it, and smoke it as the deploy does ───────────────────────────
echo "── wrangler dev over the built Worker: DB on a local D1, BLOB on a local bucket, AI on the stand-in"
[ ! -e "$work/apps/web/.dev.vars" ] || { echo "FAIL: the staged tree carries a .dev.vars" >&2; exit 1; }
# The ONE change to the config the lane built with: the AI binding becomes a
# service binding to the Workers AI stand-in (Workers AI has no local mode),
# with the compatibility flag that lets the AbortSignal the chat passes to its
# model cross that RPC boundary (the real binding takes it natively).
# Everything else is the stage render build-app wrote.
python3 - "$work/apps/web/wrangler.jsonc" "$work/apps/web/wrangler.e2e.jsonc" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
swapped, n = re.subn(r'"ai":\s*\{\s*"binding":\s*"AI"\s*\}',
                     '"services": [{ "binding": "AI", "service": "fake-workers-ai", "entrypoint": "FakeAI" }]', text)
if n != 1:
    sys.exit("FAIL: the built config does not bind Workers AI as `\"ai\": { \"binding\": \"AI\" }`")
swapped, m = re.subn(r'"compatibility_flags":\s*\[', '"compatibility_flags": ["enable_abortsignal_rpc", ', swapped)
if m != 1:
    sys.exit("FAIL: the built config sets no compatibility_flags")
open(sys.argv[2], "w").write(swapped)
PY
cp -r "$here/lib/fake-ai" "$scratch/fake-ai"
start_dev() {
  port=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
  (cd "$work/apps/web" && exec setsid pnpm exec wrangler dev -c wrangler.e2e.jsonc -c "$scratch/fake-ai/wrangler.jsonc" \
     --ip 127.0.0.1 --port "$port" --show-interactive-dev-session=false) > "$scratch/dev.log" 2>&1 < /dev/null &
  dev_pid=$!
  url="http://127.0.0.1:$port"
  for _ in $(seq 1 120); do
    curl -s -o /dev/null "$url/favicon.ico" && break
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }
    sleep 1
  done
  curl -s -o /dev/null "$url/favicon.ico" || { echo "FAIL: wrangler dev never answered" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }
}
start_dev
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"

echo "   ▸ no schema yet: no session key, the chat does not serve, and the deploy's smoke refuses it"
code="$(curl -s -o "$scratch/unmigrated.json" -w '%{http_code}' "$url/api/chats")"
[ "$code" = 503 ] || { echo "FAIL: without the migrations /api/chats answered $code, not 503" >&2; cat "$scratch/unmigrated.json" >&2; exit 1; }
grep -q "020_app_secrets" "$scratch/unmigrated.json" \
  || { echo "FAIL: the refusal does not say why (apply the migrations, 020_app_secrets)" >&2; cat "$scratch/unmigrated.json" >&2; exit 1; }
if DEPLOYED_URL="$url" bash -c "$smoke"; then
  echo "FAIL: the deploy's smoke passed a chat that could not read its database" >&2; exit 1
fi

echo "   ▸ the product's own db:migrate:local, then the component's own smokeCommand, DEPLOYED_URL=$url"
(cd "$work/apps/web" && pnpm run db:migrate:local) > "$scratch/migrate-local.log" 2>&1 \
  || { echo "FAIL: db:migrate:local" >&2; tail -20 "$scratch/migrate-local.log" >&2; exit 1; }
stop_group "$dev_pid"; dev_pid=""
start_dev
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the migrated chat" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }

echo "   ▸ every route the chat promises: a chat answered through the AI binding, an upload to R2 and back"
password="$(cd "$work/apps/web" && pnpm exec wrangler d1 execute DB --local --config wrangler.jsonc --json \
  --command "SELECT value FROM app_secrets WHERE name = 'session'" 2>/dev/null \
  | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['results'][0]['value'])")"
[ "${#password}" = 64 ] || { echo "FAIL: the local D1 holds no generated session key" >&2; exit 1; }
user='{"id":"e2e-user","name":"Ada","email":"ada@example.invalid","avatar":"","username":"ada","provider":"github","providerId":"1"}'
signed_in="$(node "$here/lib/seal-session.mjs" "$work/apps/web" "$password" "$user")"
forged="$(node "$here/lib/seal-session.mjs" "$work/apps/web" "$(printf 'f%.0s' $(seq 1 64))" "$user")"
python3 - "$url" "$values" "$signed_in" "$forged" <<'PY' || { echo "FAIL: the routes; wrangler dev said:" >&2; tail -60 "$scratch/dev.log" >&2; exit 1; }
import base64, html, json, re, sys, time, urllib.error, urllib.request, uuid
base, values, signed_in, forged = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3], sys.argv[4]
name = values["productname"]
problems = []
def bad(m): problems.append(m)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
opener = urllib.request.build_opener(NoRedirect)

class Visitor:
    # A browser of its own: its cookies (kept by hand — the site's cookies are
    # Secure, which a cookie jar drops over http) and its CSRF token.
    def __init__(self, cookie=None):
        self.cookies = {}
        if cookie:
            k, _, v = cookie.partition("=")
            self.cookies[k] = v
        self.csrf = None
    def req(self, path, method="GET", body=None, headers=None, raw=None, timeout=60):
        h = dict(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            h["content-type"] = "application/json"
        if self.cookies:
            h["cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        r = urllib.request.Request(base + path, data=data, method=method, headers=h)
        try:
            resp = opener.open(r, timeout=timeout)
        except urllib.error.HTTPError as e:
            resp = e
        for c in resp.headers.get_all("set-cookie") or []:
            k, _, v = c.split(";", 1)[0].partition("=")
            self.cookies[k.strip()] = v.strip()
        return resp.status, resp.headers, resp.read()
    def page(self, path="/"):
        s, h, body = self.req(path)
        text = body.decode("utf-8", "replace")
        m = re.search(r'<meta name="csrf-token" content="([^"]+)"', text)
        if m:
            self.csrf = m.group(1)
        return s, text
    def post(self, path, body=None, method="POST", **kw):
        return self.req(path, method=method, body=body, headers={"csrf-token": self.csrf or ""}, **kw)

def stream_text(body):
    deltas = [json.loads(l[6:]) for l in body.decode().splitlines() if l.startswith("data: {")]
    return "".join(d.get("delta", "") for d in deltas if d.get("type") == "text-delta"), len(deltas)

def new_chat(v, text):
    cid, mid = str(uuid.uuid4()), str(uuid.uuid4())
    msg = {"id": mid, "role": "user", "parts": [{"type": "text", "text": text}]}
    s, _, body = v.post("/api/chats", {"id": cid, "message": msg})
    if s != 200:
        bad(f"POST /api/chats answered {s} {body[:160]!r}")
    return cid, msg

DEFAULT = "@cf/moonshotai/kimi-k2.6"
CANNED = f"Canned answer from {DEFAULT}: the stand-in for Workers AI streamed this."

# ── a fresh deployment, as its first visitor sees it ─────────────────────────
ada = Visitor()
s, page = ada.page("/")
m = re.search(r"<title>(.*?)</title>", page, re.S)
if s != 200 or not m or html.unescape(m.group(1)) != name:
    bad(f"/ answered {s}, titled {m and html.unescape(m.group(1))!r}, not {name!r}")
# Compared as text: the page's HTML escaping of the name (an apostrophe, an
# ampersand) need not be Python's, so each attribute is decoded first.
og = [html.unescape(c) for c in re.findall(r'<meta\b[^>]*\bproperty="og:title"[^>]*\bcontent="([^"]*)"', page)]
og += [html.unescape(c) for c in re.findall(r'<meta\b[^>]*\bcontent="([^"]*)"[^>]*\bproperty="og:title"', page)]
if og != [name]:
    bad(f"the Open Graph title is {og!r}, not exactly [{name!r}]")
if "Nuxt AI Chatbot" in page:
    bad("/ still carries the baseline's name")
if "GitHub sign-in not connected" not in page:
    bad("/ does not say GitHub sign-in is not connected")
if not ada.csrf:
    bad("/ carries no CSRF token")
s, _, body = ada.req("/no-such-page")
if s != 404:
    bad(f"/no-such-page answered {s}, not 404")
s, _, body = ada.req("/api/capabilities")
caps = json.loads(body) if s == 200 else {}
if [m["value"] for m in caps.get("models", [])] != [DEFAULT, "@cf/zai-org/glm-4.7-flash"]:
    bad(f"a fresh deployment offers {[m.get('value') for m in caps.get('models', [])]} — Workers AI's models only")
if caps.get("dictation") is not False or caps.get("githubSignIn") is not False:
    bad(f"a fresh deployment offers dictation={caps.get('dictation')} githubSignIn={caps.get('githubSignIn')}")

# ── a chat, answered through the AI binding ─────────────────────────────────
s, _, _ = ada.req("/api/chats", method="POST", body={"id": str(uuid.uuid4()), "message": {}})
if s != 403:
    bad(f"a POST without the CSRF token answered {s}, not 403")
cid, msg = new_chat(ada, "Hello there")
s, h, body = ada.post(f"/api/chats/{cid}", {"model": DEFAULT, "messages": [msg], "webSearch": False, "reasoning": False}, timeout=120)
answer, n = stream_text(body)
if s != 200 or "text/event-stream" not in (h.get("content-type") or "") or answer != CANNED or n < 3:
    bad(f"the chat answered {s} {h.get('content-type')} with {answer!r} in {n} events")
time.sleep(1)
s, _, body = ada.req(f"/api/chats/{cid}")
chat = json.loads(body) if s == 200 else {}
if chat.get("title") != "Canned title from glm-4.7-flash":
    bad(f"the chat is titled {chat.get('title')!r} — the title comes from the fast Workers AI model")
roles = [m.get("role") for m in chat.get("messages", [])]
said = "".join(p.get("text", "") for m in chat.get("messages", []) if m.get("role") == "assistant" for p in m.get("parts", []))
if roles != ["user", "assistant"] or CANNED not in said:
    bad(f"the chat persisted {roles} with {said[:80]!r}")
s, _, body = ada.req("/api/chats")
if s != 200 or [c.get("id") for c in json.loads(body)] != [cid]:
    bad(f"/api/chats lists {body[:160]!r}")
cid2, msg2 = new_chat(ada, "And now?")
s, _, body = ada.post(f"/api/chats/{cid2}", {"model": "anthropic/claude-haiku-4.5", "messages": [msg2], "webSearch": True, "reasoning": True}, timeout=120)
answer2, _ = stream_text(body)
if s != 200 or answer2 != CANNED:
    bad(f"a gateway model without its key answered {s} {answer2!r} — not the default Workers AI model")

# ── another visitor cannot see it ───────────────────────────────────────────
bea = Visitor()
bea.page("/")
s, _, body = bea.req(f"/api/chats/{cid}")
if s != 404:
    bad(f"another visitor read the chat: {s}")
s, _, body = bea.req("/api/chats")
if s != 200 or json.loads(body) != []:
    bad(f"another visitor's /api/chats is {body[:120]!r}")

# ── uploads: refused signed out; signed in, into R2 and back ───────────────
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
def multipart(filename, ctype, data):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    return {"content-type": f"multipart/form-data; boundary={b}"}, body
hdrs, form = multipart("pixel.png", "image/png", PNG)
s, _, body = ada.req(f"/api/upload/{cid}", method="PUT", raw=form, headers={**hdrs, "csrf-token": ada.csrf})
if s != 401:
    bad(f"an upload signed out answered {s}, not 401")

who = Visitor(forged)
who.page("/")
s, _, body = who.req("/api/_auth/session")
if s != 200 or json.loads(body or b"{}").get("user"):
    bad(f"a session cookie sealed under another key was accepted: {s} {body[:120]!r}")
me = Visitor(signed_in)
me.page("/")
s, _, body = me.req("/api/_auth/session")
if s != 200 or (json.loads(body).get("user") or {}).get("username") != "ada":
    bad(f"a session cookie sealed under the database's key is not a session: {s} {body[:160]!r}")
mine, mmsg = new_chat(me, "A photo")
s, _, body = me.req(f"/api/chats/{mine}")
if s != 200:
    bad(f"the signed-in user cannot read their chat: {s}")
hdrs, form = multipart("pixel.png", "image/png", PNG)
s, _, body = me.req(f"/api/upload/{mine}", method="PUT", raw=form, headers={**hdrs, "csrf-token": me.csrf})
uploaded = json.loads(body) if s == 200 else []
up = uploaded[0] if uploaded else {}
if s != 200 or not str(up.get("pathname", "")).startswith(f"ada/{mine}/") or up.get("url") != "/api/files/" + up.get("pathname", "").replace(" ", "%20"):
    bad(f"the upload answered {s} {body[:200]!r}")
else:
    s, h, data = me.req(up["url"])
    if s != 200 or not (h.get("content-type") or "").startswith("image/png") or data != PNG:
        bad(f"{up['url']} answered {s} {h.get('content-type')} ({len(data)} bytes) — not the file uploaded to R2")
    part = {"type": "file", "mediaType": "image/png", "url": up["url"]}
    mmsg["parts"].append(part)
    s, _, body = me.post(f"/api/chats/{mine}", {"model": DEFAULT, "messages": [mmsg], "webSearch": False, "reasoning": False}, timeout=120)
    if s != 200 or stream_text(body)[0] != CANNED:
        bad(f"a chat with the stored upload answered {s}")
    s, _, _ = me.req("/api/upload/" + up["pathname"], method="DELETE")
    if s != 204:
        bad(f"deleting the upload answered {s}")
    s, _, _ = me.req(up["url"])
    if s != 404:
        bad(f"the deleted upload still answers {s}")
s, _, body = me.post("/api/transcription/token")
if s != 404:
    bad(f"dictation without the gateway's key answered {s}, not 404")

# ── GitHub sign-in, not connected yet ───────────────────────────────────────
s, h, _ = ada.req("/auth/github")
if s not in (302, 307) or h.get("location") != "/":
    bad(f"/auth/github with no OAuth app answered {s} → {h.get('location')!r}, not back to /")

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
print(f"   {name!r} served; a chat streamed through the AI binding, titled, persisted and listed, a gateway model")
print("   answered by Workers AI, another visitor shut out; an upload refused signed out, and signed in written")
print("   to R2, served back, chatted about and deleted; dictation and GitHub sign-in off until connected")
PY

echo "   ▸ the owner's secrets on the Worker (worker-secrets.mjs --dev-vars, as the deploy sets them): what it offers then"
stop_group "$dev_pid"; dev_pid=""
(cd "$work/apps/web" && AI_GATEWAY_API_KEY=e2e-gateway-key NUXT_OAUTH_GITHUB_CLIENT_ID=e2e-github-client-id \
   NUXT_OAUTH_GITHUB_CLIENT_SECRET=e2e-github-client-secret node ../../tooling/wire/worker-secrets.mjs --dev-vars .dev.vars \
   --secret NUXT_OAUTH_GITHUB_CLIENT_ID --secret NUXT_OAUTH_GITHUB_CLIENT_SECRET --secret AI_GATEWAY_API_KEY \
   --secret NUXT_SESSION_PASSWORD) > "$scratch/dev-vars.log" 2>&1 \
  || { echo "FAIL: worker-secrets.mjs --dev-vars" >&2; cat "$scratch/dev-vars.log" >&2; exit 1; }
grep -q "not set, skipped: NUXT_SESSION_PASSWORD" "$scratch/dev-vars.log" \
  || { echo "FAIL: worker-secrets.mjs did not skip the unset secret by name" >&2; cat "$scratch/dev-vars.log" >&2; exit 1; }
start_dev
python3 - "$url" <<'PY' || { echo "FAIL: the connected chat; wrangler dev said:" >&2; tail -40 "$scratch/dev.log" >&2; exit 1; }
import json, sys, urllib.error, urllib.parse, urllib.request
base = sys.argv[1]
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
opener = urllib.request.build_opener(NoRedirect)
def get(path):
    try:
        r = opener.open(base + path, timeout=60)
    except urllib.error.HTTPError as e:
        r = e
    return r.status, r.headers, r.read()
problems = []
s, _, body = get("/api/capabilities")
caps = json.loads(body) if s == 200 else {}
values = [m["value"] for m in caps.get("models", [])]
if values != ["@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-4.7-flash", "anthropic/claude-haiku-4.5", "google/gemini-3-flash", "openai/gpt-5-nano"]:
    problems.append(f"with the gateway's key the picker offers {values}")
if caps.get("dictation") is not True or caps.get("githubSignIn") is not True:
    problems.append(f"connected, it offers dictation={caps.get('dictation')} githubSignIn={caps.get('githubSignIn')}")
s, h, _ = get("/auth/github")
loc = h.get("location") or ""
q = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)
if s not in (302, 307) or not loc.startswith("https://github.com/login/oauth/authorize") or q.get("client_id") != ["e2e-github-client-id"]:
    problems.append(f"/auth/github answered {s} → {loc[:120]!r}, not GitHub's authorize page for the app's client id")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
if problems:
    sys.exit(1)
print("   the gateway's three models beside Workers AI's, dictation and GitHub sign-in offered; /auth/github")
print("   sends the visitor to GitHub with the OAuth app's client id")
PY
rm -f "$work/apps/web/.dev.vars"

echo "e2e.test.sh: ok"
