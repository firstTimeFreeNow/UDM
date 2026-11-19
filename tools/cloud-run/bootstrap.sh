#!/usr/bin/env bash
set -euo pipefail
# Run once as the project owner from Google Cloud Shell. Does not attach billing.
UDM_SETUP_PROJECT=${1:?Usage: bootstrap.sh PROJECT_ID [OWNER/REPOSITORY] [REGION]}
UDM_SETUP_REPOSITORY=${2:-firstTimeFreeNow/UDM}
UDM_SETUP_REGION=${3:-us-central1}
export UDM_SETUP_PROJECT UDM_SETUP_REPOSITORY UDM_SETUP_REGION
python3 - <<'PY'
import os,re,sys
for key,pattern in {'UDM_SETUP_PROJECT':r'[a-z][a-z0-9-]{4,28}[a-z0-9]','UDM_SETUP_REPOSITORY':r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+','UDM_SETUP_REGION':r'[a-z]+-[a-z]+[0-9]'}.items():
 if not re.fullmatch(pattern,os.environ[key]):sys.exit('Invalid '+key)
PY
UDM_BILLING_ENABLED=$(gcloud billing projects describe "$UDM_SETUP_PROJECT" --format='value(billingEnabled)' --quiet)
[[ "$UDM_BILLING_ENABLED" == 'True' ]] || { echo 'Link a Cloud Billing account to this project before running setup.' >&2; exit 1; }
UDM_SETUP_TEMP=$(mktemp -d)
trap 'rm -rf -- "$UDM_SETUP_TEMP"' EXIT
UDM_PROJECT_NUMBER=$(gcloud projects describe "$UDM_SETUP_PROJECT" --format='value(projectNumber)')
UDM_REPOSITORY_ID=$(python3 - <<'PY'
import json,os,urllib.request
repo=os.environ['UDM_SETUP_REPOSITORY']
r=json.load(urllib.request.urlopen(urllib.request.Request('https://api.github.com/repos/'+repo,headers={'Accept':'application/vnd.github+json'}),timeout=20))
assert r['full_name'].lower()==repo.lower()
print(int(r['id']))
PY
)
[[ "$UDM_PROJECT_NUMBER" =~ ^[0-9]+$ && "$UDM_REPOSITORY_ID" =~ ^[0-9]+$ ]] || exit 1
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com --project "$UDM_SETUP_PROJECT" --quiet
UDM_DEPLOY_ACCOUNT="udm-bff-deployer@${UDM_SETUP_PROJECT}.iam.gserviceaccount.com"
UDM_RUNTIME_ACCOUNT="udm-bff-runtime@${UDM_SETUP_PROJECT}.iam.gserviceaccount.com"
for UDM_ACCOUNT_NAME in udm-bff-deployer udm-bff-runtime; do
 if ! gcloud iam service-accounts describe "${UDM_ACCOUNT_NAME}@${UDM_SETUP_PROJECT}.iam.gserviceaccount.com" --project "$UDM_SETUP_PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$UDM_ACCOUNT_NAME" --project "$UDM_SETUP_PROJECT" --display-name "$UDM_ACCOUNT_NAME" --quiet
 fi
done
for UDM_ROLE in roles/run.admin roles/serviceusage.serviceUsageConsumer; do
 gcloud projects add-iam-policy-binding "$UDM_SETUP_PROJECT" --member "serviceAccount:${UDM_DEPLOY_ACCOUNT}" --role "$UDM_ROLE" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$UDM_RUNTIME_ACCOUNT" --project "$UDM_SETUP_PROJECT" --member "serviceAccount:${UDM_DEPLOY_ACCOUNT}" --role roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
if ! gcloud artifacts repositories describe udm-bff --project "$UDM_SETUP_PROJECT" --location "$UDM_SETUP_REGION" >/dev/null 2>&1; then
 gcloud artifacts repositories create udm-bff --project "$UDM_SETUP_PROJECT" --location "$UDM_SETUP_REGION" --repository-format docker --description 'Go BFF runtime images' --quiet
fi
gcloud artifacts repositories add-iam-policy-binding udm-bff --project "$UDM_SETUP_PROJECT" --location "$UDM_SETUP_REGION" --member "serviceAccount:${UDM_DEPLOY_ACCOUNT}" --role roles/artifactregistry.writer --condition=None --quiet >/dev/null
cat > "$UDM_SETUP_TEMP/cleanup.json" <<'JSON'
[
 {"name":"delete-old-images","action":{"type":"Delete"},"condition":{"tagState":"any","olderThan":"604800s"}},
 {"name":"keep-three-recent-images","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":3}}
]
JSON
gcloud artifacts repositories set-cleanup-policies udm-bff --project "$UDM_SETUP_PROJECT" --location "$UDM_SETUP_REGION" --policy "$UDM_SETUP_TEMP/cleanup.json" --no-dry-run --quiet
if ! gcloud secrets describe udm-bff-shared-secret --project "$UDM_SETUP_PROJECT" >/dev/null 2>&1; then
 gcloud secrets create udm-bff-shared-secret --project "$UDM_SETUP_PROJECT" --replication-policy automatic --quiet
fi
gcloud secrets add-iam-policy-binding udm-bff-shared-secret --project "$UDM_SETUP_PROJECT" --member "serviceAccount:${UDM_RUNTIME_ACCOUNT}" --role roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
gcloud secrets add-iam-policy-binding udm-bff-shared-secret --project "$UDM_SETUP_PROJECT" --member "serviceAccount:${UDM_DEPLOY_ACCOUNT}" --role roles/secretmanager.secretVersionManager --condition=None --quiet >/dev/null
if ! gcloud iam workload-identity-pools describe udm-github --project "$UDM_SETUP_PROJECT" --location global >/dev/null 2>&1; then
 gcloud iam workload-identity-pools create udm-github --project "$UDM_SETUP_PROJECT" --location global --display-name 'UDM GitHub Actions' --quiet
fi
UDM_PROVIDER="projects/${UDM_PROJECT_NUMBER}/locations/global/workloadIdentityPools/udm-github/providers/github"
UDM_CONDITION="assertion.repository_id == '${UDM_REPOSITORY_ID}' && assertion.ref == 'refs/heads/main'"
if gcloud iam workload-identity-pools providers describe github --project "$UDM_SETUP_PROJECT" --location global --workload-identity-pool udm-github --format=json > "$UDM_SETUP_TEMP/provider.json" 2>/dev/null; then
 export UDM_CONDITION
 python3 - "$UDM_SETUP_TEMP/provider.json" <<'PY'
import json,os,sys
p=json.load(open(sys.argv[1]))
if p.get('attributeCondition')!=os.environ['UDM_CONDITION'] or p.get('oidc',{}).get('issuerUri')!='https://token.actions.githubusercontent.com' or p.get('attributeMapping',{}).get('attribute.repository_id')!='assertion.repository_id':sys.exit('Existing federation provider differs. Review its configuration before proceeding.')
PY
else
 gcloud iam workload-identity-pools providers create-oidc github --project "$UDM_SETUP_PROJECT" --location global --workload-identity-pool udm-github --issuer-uri https://token.actions.githubusercontent.com --attribute-mapping 'google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' --attribute-condition "$UDM_CONDITION" --quiet
fi
gcloud iam service-accounts add-iam-policy-binding "$UDM_DEPLOY_ACCOUNT" --project "$UDM_SETUP_PROJECT" --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/projects/${UDM_PROJECT_NUMBER}/locations/global/workloadIdentityPools/udm-github/attribute.repository_id/${UDM_REPOSITORY_ID}" --condition=None --quiet >/dev/null
printf '\nGitHub Repository variables:\nGCP_WORKLOAD_IDENTITY_PROVIDER=%s\nGCP_DEPLOY_SERVICE_ACCOUNT=%s\nUDM_BFF_RUNTIME_SERVICE_ACCOUNT=%s\nUDM_BFF_REGION=%s\n' "$UDM_PROVIDER" "$UDM_DEPLOY_ACCOUNT" "$UDM_RUNTIME_ACCOUNT" "$UDM_SETUP_REGION"
printf '\nLeave UDM_BFF_ENABLED=false until the Go workflow is on main and setup is complete.\n'
