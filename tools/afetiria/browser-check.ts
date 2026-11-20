import assert from 'node:assert/strict';

/** Exercise actual Next/React/Firebase SDK with synthetic network responses only. */
export async function runAppBrowserChecks(chromium, origin, launchOptions = {}) {
  const browser = await chromium.launch({...launchOptions, headless: true});
  const base = origin + '/UDM/afetiria-extra/';
  const id = n => `m_00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const member = id(1);
  const first = '2026-11-16 21:30';
  const second = '2026-11-16 22:00';
  let role = 'participant';
  let saves = 0;
  let abortSave = false;
  const testNotifications=[];
  const sharedLinks = [];
  const state: any = {weekId:'2026-11-16', members: Array.from({length:6}, (_,i)=>({id:id(i+1),name:`Demo ${i+1}`,required:false})),
    slots:[{key:first,date:'2026-11-16',time:'21:30',count:6,judgment:'開催可能'}, {key:second,date:'2026-11-16',time:'22:00',count:6,judgment:'開催可能'}],
    answers:Object.fromEntries(Array.from({length:6},(_,i)=>[id(i+1),{[first]:'○',[second]:'○'}])),
    confirmed:null,minParticipants:6,maxParticipants:8};
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const token = `${encode({alg:'none'})}.${encode({sub:'fixture-user',user_id:'fixture-user',aud:'fixture-project',iss:'https://securetoken.google.com/fixture-project',iat:now,exp:now+3600,auth_time:now,firebase:{sign_in_provider:'password'}})}.fixture`;
  try {
    await context.route('https://identitytoolkit.googleapis.com/**', async route => {
      const lookup = route.request().url().includes('accounts:lookup');
      await route.fulfill({json: lookup ? {users:[{localId:'fixture-user',email:'shared@example.invalid',emailVerified:true,providerUserInfo:[]}]} :
        {localId:'fixture-user',email:'shared@example.invalid',idToken:token,refreshToken:'fixture-refresh',expiresIn:'3600',registered:true}});
    });
    await context.route('https://securetoken.googleapis.com/**', route => route.fulfill({json:{id_token:token,access_token:token,refresh_token:'fixture-refresh',expires_in:'3600',user_id:'fixture-user',project_id:'fixture-project'}}));
    await context.route('https://script.google.com/macros/s/UDM_BROWSER_FIXTURE/exec', async route => {
      const request = route.request().postDataJSON();
      let data, error;
      if (request.action === 'af.push.test') {
        assert.equal(role,'admin');testNotifications.push(request.payload);
        data={total:2,accepted:2,failed:0,removed:0};
      }
      if (request.action === 'af.push.status') data={ready:false,enabled:false,deliveryIssue:false};
      if (request.action === 'af.session') data = {role};
      if (request.action === 'af.read') data = state;
      if (request.action === 'af.answers.save') {
        saves++;
        for(const change of request.payload.changes) {
          const current=state.answers[request.payload.memberId][change.slot] || '';
          if(current !== change.before && current !== change.answer) error='CONFLICT';
        }
        if(!error) {
          for(const change of request.payload.changes) state.answers[request.payload.memberId][change.slot]=change.answer;
          data={saved:true,savedCount:request.payload.changes.length,state};
        }
        if(abortSave) {abortSave=false; await route.abort('failed'); return;}
      }
      if (request.action === 'af.members.add') {
        const index=state.members.length+1;
        state.members.push({id:id(index),name:request.payload.name,required:request.payload.required}); state.answers[id(index)]={}; data=state;
      }
      if (request.action === 'af.members.required') {
        state.members.find(m=>m.id===request.payload.memberId).required=request.payload.required; data=state;
      }
      if (request.action === 'af.history') data={items:[],nextOffset:null};
      if (request.action === 'udm.links.share') {
        let link=sharedLinks.find(link=>link.active && link.path===request.payload.path);
        if(!link){link={code:'member01',path:request.payload.path,active:true,updatedAt:new Date().toISOString()};sharedLinks.push(link);}
        data={code:link.code,path:link.path};
      }
      if (request.action === 'udm.links.list') data={links:sharedLinks};
      if (request.action === 'udm.links.create') {
        sharedLinks.push({code:request.payload.code,path:request.payload.path,active:true,updatedAt:new Date().toISOString()}); data={links:sharedLinks};
      }
      if (request.action === 'udm.links.update') {
        Object.assign(sharedLinks.find(link=>link.code===request.payload.code),{path:request.payload.path,active:request.payload.active}); data={links:sharedLinks};
      }
      if (request.action === 'udm.links.resolve') {
        assert.equal(request.idToken,'');
        const link=sharedLinks.find(link=>link.code===request.payload.code && link.active);
        if(link) data={path:link.path}; else error='NOT_FOUND';
      }
      const response = {version:1,requestId:request.requestId,...(error ? {ok:false,error:{code:error}} : {ok:true,data})};
      await route.fulfill({json:response,headers:{'Access-Control-Allow-Origin':'*'}});
    });
    await page.goto(base+'answer/');
    await page.getByRole('heading',{name:'参加メンバー用ログイン'}).waitFor();
    assert.equal(await page.getByText('Demo 1',{exact:true}).count(),0);
    assert.equal(await page.getByRole('link',{name:'装備プランナー',exact:true}).count(),0);
    async function login() {
      await page.getByLabel('共通メールアドレス').fill('shared@example.invalid');
      await page.getByLabel('共通パスワード').fill('synthetic-password');
      await page.getByRole('button',{name:'ログイン',exact:true}).click();
      await page.getByLabel('回答するメンバー').waitFor({timeout:30000});
    }
    await login();
    await page.getByLabel('回答するメンバー').selectOption(member);
    const group = time => page.getByRole('group',{name:`11月16日(月) ${time}の回答`});
    await group('21:30').getByRole('button',{name:'△',exact:true}).click();
    state.answers[id(2)][first]='×';
    await page.getByRole('button',{name:'最新の予定を取得'}).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b=>b.textContent==='最新の予定を取得')?.disabled);
    assert.equal(await group('21:30').getByRole('button',{name:'△',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'回答を保存',exact:true}).click();
    await page.getByText('回答を保存しました。',{exact:true}).waitFor();
    assert.equal(state.answers[member][first],'△'); assert.equal(saves,1);
    await page.reload();
    await page.getByLabel('回答するメンバー').waitFor();
    assert.equal(await page.getByLabel('回答するメンバー').inputValue(),member);
    assert.equal(await group('21:30').getByRole('button',{name:'△',exact:true}).getAttribute('aria-pressed'),'true');
    await group('22:00').getByRole('button',{name:'×',exact:true}).click();
    state.answers[member][second]='△';
    await page.getByRole('button',{name:'最新の予定を取得'}).click();
    await page.getByText('同じ日時の回答が更新されています。変更を破棄して最新の回答を確認してください。').waitFor();
    assert.equal(await page.getByRole('button',{name:'回答を保存',exact:true}).isDisabled(),true);
    assert.equal(await group('22:00').getByRole('button',{name:'×',exact:true}).getAttribute('aria-pressed'),'true');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'変更を破棄',exact:true}).click();
    assert.equal(await group('22:00').getByRole('button',{name:'△',exact:true}).getAttribute('aria-pressed'),'true');
    await group('22:00').getByRole('button',{name:'○',exact:true}).click();
    abortSave=true;
    await page.getByRole('button',{name:'回答を保存',exact:true}).click();
    await page.getByText('保存結果を確認できません。入力内容は残っています。再送する前に最新の予定を取得してください。').waitFor();
    assert.equal(saves,2); assert.equal(await page.getByRole('button',{name:'回答を保存',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'最新の予定を取得'}).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b=>b.textContent==='最新の予定を取得')?.disabled);
    assert.equal(saves,2);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button',{name:'変更を破棄',exact:true}).click();
    await page.goto(base+'admin/');
    await page.getByText('管理者アカウントでログインしてください。',{exact:true}).waitFor();
    await page.goto(base+'answer/');
    await page.getByRole('button',{name:'共有リンクを発行',exact:true}).click();
    await page.getByRole('link',{name:origin+'/UDM/s/?c=member01',exact:true}).waitFor();
    await page.getByRole('status').filter({hasText:'共有リンクをコピーしました。'}).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()),origin+'/UDM/s/?c=member01');
    await page.getByRole('button',{name:'共有リンクを発行',exact:true}).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b=>b.textContent==='発行中…'));
    assert.equal(sharedLinks.length,1); assert.equal(role,'participant');
    await page.getByRole('link',{name:'開催状況',exact:true}).click();
    await page.getByRole('button',{name:'共有リンクを発行',exact:true}).waitFor();
    await page.getByRole('heading',{name:'開催通知',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'通知を有効にする',exact:true}).isDisabled(),true);
    await page.getByRole('link',{name:'開催履歴',exact:true}).click();
    await page.getByRole('button',{name:'共有リンクを発行',exact:true}).waitFor();
    await page.getByRole('button',{name:'ログアウト',exact:true}).click();

    await page.getByRole('heading',{name:'参加メンバー用ログイン'}).waitFor();
    role='admin'; await page.goto(base+'answer/'); await login();
    await page.getByRole('link',{name:'管理',exact:true}).click();
    await page.getByLabel('メンバー名',{exact:true}).fill('Demo new');
    await page.getByRole('button',{name:'追加',exact:true}).click();
    await page.getByText('Demo new',{exact:true}).waitFor();
    assert.equal(state.members.length,7);
    await page.getByLabel('通知タイトル',{exact:true}).fill('通知テスト');
    await page.getByLabel('通知本文',{exact:true}).fill('任意の本文\n2行目');
    await page.getByRole('button',{name:'全端末へテスト通知を送信',exact:true}).click();
    await page.getByRole('status').filter({hasText:'送信結果：受付 2件'}).waitFor();
    assert.deepEqual(testNotifications,[{title:'通知テスト',body:'任意の本文\n2行目'}]);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    await page.goto(origin+'/UDM/admin/links/');
    await page.getByLabel('短縮コード（空欄なら自動発行）').fill('answer01');
    await page.getByRole('button',{name:'発行',exact:true}).click();
    await page.getByRole('heading',{name:'answer01',exact:true}).waitFor();
    assert.equal(sharedLinks.length,2);
    const resolver=await context.newPage();
    await resolver.goto(origin+'/UDM/s/?c=answer01');
    await resolver.waitForURL(base+'answer/');
    await page.getByRole('article').filter({has:page.getByRole('heading',{name:'answer01',exact:true})}).getByRole('button',{name:'無効にする',exact:true}).click();
    await page.getByText('無効',{exact:true}).waitFor();
    await resolver.goto(origin+'/UDM/s/?c=answer01');
    await resolver.getByText('この共有URLは見つからないか、無効になっています。',{exact:true}).waitFor();
    await page.getByLabel('転送先',{exact:true}).last().fill('/UDM/afetiria-extra/history/');
    await page.getByRole('button',{name:'転送先を変更',exact:true}).last().click();
    await page.getByRole('button',{name:'有効にする',exact:true}).click();
    await resolver.goto(origin+'/UDM/s/?c=answer01');
    await resolver.waitForURL(base+'history/');
    await resolver.getByText('開催履歴はまだありません。',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    return {checks:['auth gate','independent navigation','answer save','persistent auth and member selection','draft survives refresh',
      'conflict preserves draft','unknown save requires read without automatic retry','participant admin denial','admin adds member','admin broadcasts custom test notification','mobile width',
      'participant creates shared alias','shared link displayed and automatically copied','notification setup and unconfigured state','admin creates shared alias','public alias resolution','disabled alias rejection','alias destination update'],saves};
  } finally {await browser.close();}
}
