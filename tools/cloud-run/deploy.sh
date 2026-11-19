#!/usr/bin/env bash
set -euo pipefail
# All configuration enters through environment variables, never shell evaluation.
python3 - <<'PY'
import os,re,sys,urllib.parse
patterns={'GOOGLE_CLOUD_PROJECT':r'[a-z][a-z0-9-]{4,28}[a-z0-9]', 'UDM_FIREBASE_PROJECT_ID':r'[a-z][a-z0-9-]{4,28}[a-z0-9]', 'UDM_BFF_REGION':r'[a-z]+-[a-z]+[0-9]', 'UDM_BFF_SHARED_SECRET':r'[a-f0-9]{64}', 'GITHUB_SHA':r'[a-f0-9]{40}'}
for name,pattern in patterns.items():
 if not re.fullmatch(pattern,os.environ.get(name,'')):sys.exit('Missing or invalid setting: '+name)
project=os.environ['GOOGLE_CLOUD_PROJECT']
if not re.fullmatch(r'[a-z][a-z0-9-]*@'+re.escape(project)+r'\.iam\.gserviceaccount\.com',os.environ.get('UDM_BFF_RUNTIME_SERVICE_ACCOUNT','')):sys.exit('Invalid runtime service account')
u=urllib.parse.urlsplit(os.environ.get('AF_EXEC_URL',''))
if u.scheme!='https' or u.netloc!='script.google.com' or not re.fullmatch(r'/macros/s/[A-Za-z0-9_-]+/exec',u.path) or u.query or u.fragment:sys.exit('Invalid AF_EXEC_URL')
for origin in os.environ.get('UDM_ALLOWED_ORIGINS','').split(','):
 u=urllib.parse.urlsplit(origin)
 if u.scheme!='https' or not u.netloc or u.username or u.path or u.query or u.fragment:sys.exit('Invalid UDM_ALLOWED_ORIGINS')
PY
UDM_DEPLOY_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
UDM_IMAGE="${UDM_BFF_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/udm-bff/bff:${GITHUB_SHA}"
UDM_DEPLOY_TEMP=$(mktemp -d)
trap 'rm -rf -- "$UDM_DEPLOY_TEMP"' EXIT
chmod 700 "$UDM_DEPLOY_TEMP"
python3 - "$UDM_DEPLOY_TEMP/env.json" <<'PY'
import json,os,sys
with open(sys.argv[1],'w',opener=lambda path,flags:os.open(path,flags,0o600)) as out:
 json.dump({name:os.environ[name] for name in ['UDM_FIREBASE_PROJECT_ID','UDM_ALLOWED_ORIGINS','AF_EXEC_URL']},out)
PY
gcloud auth configure-docker "${UDM_BFF_REGION}-docker.pkg.dev" --quiet
docker build --tag "$UDM_IMAGE" "$UDM_DEPLOY_ROOT/apps/bff"
docker push "$UDM_IMAGE"
UDM_SECRET_VERSION=$(printf '%s' "$UDM_BFF_SHARED_SECRET" | gcloud secrets versions add udm-bff-shared-secret --project "$GOOGLE_CLOUD_PROJECT" --data-file=- --format='value(name)' --quiet)
unset UDM_BFF_SHARED_SECRET
UDM_SECRET_VERSION=${UDM_SECRET_VERSION##*/}
[[ "$UDM_SECRET_VERSION" =~ ^[0-9]+$ ]] || { echo 'Secret version was not confirmed.' >&2; exit 1; }
gcloud run deploy udm-bff \
 --project "$GOOGLE_CLOUD_PROJECT" --region "$UDM_BFF_REGION" --image "$UDM_IMAGE" \
 --service-account "$UDM_BFF_RUNTIME_SERVICE_ACCOUNT" --env-vars-file "$UDM_DEPLOY_TEMP/env.json" \
 --set-secrets "UDM_BFF_SHARED_SECRET=udm-bff-shared-secret:${UDM_SECRET_VERSION}" \
 --allow-unauthenticated --ingress all --min 0 --max 1 --max-instances 1 \
 --cpu 1 --memory 256Mi --concurrency 40 --timeout 60 --cpu-throttling --no-cpu-boost --port 8080 --quiet
# Retain the two latest secret versions so one previous revision can be restored.
gcloud secrets versions list udm-bff-shared-secret --project "$GOOGLE_CLOUD_PROJECT" --filter='state=ENABLED' --format='value(name)' > "$UDM_DEPLOY_TEMP/versions"
python3 - "$UDM_DEPLOY_TEMP/versions" > "$UDM_DEPLOY_TEMP/old-versions" <<'PY'
import sys
versions=sorted((int(line.strip().split('/')[-1]) for line in open(sys.argv[1]) if line.strip()),reverse=True)
for version in versions[2:]:print(version)
PY
while IFS= read -r UDM_OLD_VERSION; do
 gcloud secrets versions disable "$UDM_OLD_VERSION" --secret udm-bff-shared-secret --project "$GOOGLE_CLOUD_PROJECT" --quiet
done < "$UDM_DEPLOY_TEMP/old-versions"
gcloud run services describe udm-bff --project "$GOOGLE_CLOUD_PROJECT" --region "$UDM_BFF_REGION" --format='value(status.url)'
