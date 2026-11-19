import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
FAKE='''#!PYTHON
import json,os,sys
from pathlib import Path
args=sys.argv[1:]
entry={'command':Path(sys.argv[0]).name,'args':args}
if args[:3]==['secrets','versions','add']:
 entry['stdinLength']=len(sys.stdin.read())
if args[:2]==['run','deploy']:
 p=Path(args[args.index('--env-vars-file')+1]);entry['envFile']=str(p);entry['envMode']=p.stat().st_mode&0o777;entry['env']=json.loads(p.read_text())
with open(os.environ['MOCK_LOG'],'a') as f:f.write(json.dumps(entry)+'\\n')
if args[:2]==['run','deploy'] and os.environ.get('FAIL_DEPLOY')=='1':sys.exit(9)
if args[:3]==['secrets','versions','add']:print('projects/fixture-project/secrets/udm-bff-shared-secret/versions/7')
if args[:3]==['secrets','versions','list']:print('7\\n6\\n5\\n4')
if args[:3]==['run','services','describe']:print('https://udm-bff.fixture.run.app')
'''.replace('PYTHON',sys.executable)

class DeploymentTest(unittest.TestCase):
 def invoke(self,changes=None):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp);log=base/'calls'
   for name in ['docker','gcloud']:
    p=base/name;p.write_text(FAKE);p.chmod(0o700)
   env={**os.environ,'PATH':str(base)+os.pathsep+os.environ['PATH'],'MOCK_LOG':str(log),'GOOGLE_CLOUD_PROJECT':'fixture-project','UDM_FIREBASE_PROJECT_ID':'fixture-project','UDM_BFF_REGION':'asia-northeast1','UDM_BFF_RUNTIME_SERVICE_ACCOUNT':'runtime@fixture-project.iam.gserviceaccount.com','UDM_BFF_SHARED_SECRET':'b'*64,'UDM_ALLOWED_ORIGINS':'https://site.example','AF_EXEC_URL':'https://script.google.com/macros/s/fixture/exec','GITHUB_SHA':'a'*40,**(changes or {})}
   result=subprocess.run(['bash',str(ROOT/'tools/cloud-run/deploy.sh')],cwd=base,env=env,text=True,capture_output=True)
   calls=[json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
   return result,calls
 def test_invalid_config_stops_before_cloud_calls(self):
  for changes in [{'UDM_BFF_SHARED_SECRET':'short'},{'AF_EXEC_URL':'https://other.invalid/exec'},{'GITHUB_SHA':'main;echo bad'},{'UDM_BFF_RUNTIME_SERVICE_ACCOUNT':'other@other-project.iam.gserviceaccount.com'}]:
   with self.subTest(changes=changes):
    result,calls=self.invoke(changes);self.assertNotEqual(result.returncode,0);self.assertEqual(calls,[])
 def test_deploy_pins_secret_restricts_instances_and_cleans_temp_config(self):
  result,calls=self.invoke();self.assertEqual(result.returncode,0,result.stderr)
  deploy=next(c for c in calls if c['args'][:2]==['run','deploy'])
  self.assertEqual(deploy['envMode'],0o600);self.assertFalse(Path(deploy['envFile']).exists())
  self.assertNotIn('UDM_BFF_SHARED_SECRET',deploy['env']);self.assertIn('UDM_BFF_SHARED_SECRET=udm-bff-shared-secret:7',deploy['args'])
  for flag,value in [('--min','0'),('--max','1'),('--max-instances','1')]:self.assertEqual(deploy['args'][deploy['args'].index(flag)+1],value)
  self.assertEqual([c['args'][3] for c in calls if c['args'][:3]==['secrets','versions','disable']],['5','4'])
  self.assertEqual(next(c['stdinLength'] for c in calls if 'stdinLength' in c),64)
  self.assertNotIn('b'*64,result.stdout+result.stderr+json.dumps(calls))
 def test_uncertain_deploy_is_not_retried_and_temp_config_is_removed(self):
  result,calls=self.invoke({'FAIL_DEPLOY':'1'});self.assertEqual(result.returncode,9)
  deploys=[c for c in calls if c['args'][:2]==['run','deploy']];self.assertEqual(len(deploys),1)
  self.assertFalse(Path(deploys[0]['envFile']).exists());self.assertFalse(any(c['args'][:3]==['secrets','versions','disable'] for c in calls))

if __name__=='__main__':unittest.main()
