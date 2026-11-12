#!/usr/bin/env python3
"""Isolated Chrome/CDP UI smoke test; never connects to production tunnels."""
import asyncio, json, os, pathlib, socket, subprocess, tempfile, time, urllib.request, base64
from PIL import Image
import websockets

BASE=pathlib.Path(__file__).resolve().parent.parent
URL=(BASE/'src/renderer/index.html').resolve().as_uri()
OUT=BASE/'tests/screenshots'
OUT.mkdir(exist_ok=True)
PORT_SOCK=socket.socket()
PORT_SOCK.bind(('127.0.0.1',0))
PORT=PORT_SOCK.getsockname()[1]
PORT_SOCK.close()
userdir=tempfile.mkdtemp(prefix='mcp-bridge-ui-chrome-')
chrome=subprocess.Popen([
    'google-chrome','--headless=new','--no-first-run','--no-default-browser-check',
    '--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-extensions','--disable-background-networking',
    '--remote-allow-origins=*',f'--remote-debugging-port={PORT}',
    '--user-data-dir='+userdir,'about:blank'
],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)

BOOTSTRAP=r"""
(() => {
window.__actions=[];
const settings={
 localTunnelId:'tunnel_'+ 'a'.repeat(32),browserTunnelId:'tunnel_'+ 'b'.repeat(32),
 metaTunnelId:'tunnel_'+ 'c'.repeat(32),rememberApiKey:true,
 roots:[{name:'Documents',path:'/home/user/Documents',mode:'read-write'},{name:'Downloads',path:'/home/user/Downloads',mode:'read-only'}],
 enableWrite:true,enableShell:true,fullShell:false,browserVision:true,browserUsageStatistics:false,
 startAtLogin:true,startLocalOnLaunch:true,startBrowserOnLaunch:true,
 startMetaOnLaunch:true,automaticUpdateChecks:true
};
const state={settings,hasApiKey:true,localRunning:true,browserRunning:true,metaRunning:true,logs:['[local] Connected','[web] Ready','[meta] Connected'],platform:'linux',appVersion:'0.2.13',tunnelClientPath:'/usr/bin/tunnel-client',
 update:{status:'up-to-date',currentVersion:'0.2.13',latestVersion:'0.2.13',message:'You are up to date.'}};
const noop=async()=>({ok:true});
window.__peerState={name:'Haseeb PC',tailscaleIp:'100.71.95.57',port:44176,running:true,
 peers:[{id:'trusted-test',name:'Trusted test PC',ip:'100.90.90.90'}],sharingScreen:false,
 controlAllowed:false,controlMode:'off',controlPeerId:null,controlPeerName:null,controlExpiresAt:null};
window.bridge={
 getState:async()=>state,
 onState:fn=>{},onLog:fn=>{},onUpdateState:fn=>{},onPeerUpdate:fn=>{},
 saveSettings:async item=>{window.__actions.push('save');return {ok:true}},
 chooseFolder:async()=>({path:'/home/user/Other',writable:true}),
 listMountedDrives:async()=>[],
 inspectFolder:async()=>({path:'/home/user/Other',writable:true}),
 startLocal:noop,stopLocal:noop,startBrowser:noop,stopBrowser:noop,startMeta:noop,stopMeta:noop,restartAll:noop,
 checkForUpdates:async()=>state.update,downloadUpdate:noop,installUpdate:noop,
 previewDiagnostics:async()=> 'No issues.',copyDiagnostics:noop,reportDiagnostics:noop,
 openExternal:noop,
 peerList:async()=>window.__peerState,
 peerInvite:noop,peerAdd:noop,peerRemove:noop,peerRekey:noop,peerStatus:async()=>({name:'Trusted test PC',screenSize:{width:3072,height:1728},sharingScreen:true,controlAllowed:true,controlMode:'until-revoked'}),peerMessages:async()=>[],
 peerSend:noop,peerScreen:async(_id,large)=>{window.__actions.push('screen:'+large);return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9uwAAAABJRU5ErkJggg==';},peerCommand:noop,peerInput:noop,
 peerShare:async enabled=>{window.__peerState.sharingScreen=enabled},
 peerGrant:async (duration,id)=>{window.__actions.push('grant:'+duration);Object.assign(window.__peerState,{controlAllowed:true,controlMode:duration==='until-revoked'?'until-revoked':'timed',controlPeerId:id,controlPeerName:'Trusted test PC',controlExpiresAt:duration==='until-revoked'?null:new Date(Date.now()+Number(duration)*60000).toISOString()});},
 peerRevoke:async()=>{window.__actions.push('revoke');Object.assign(window.__peerState,{controlAllowed:false,controlMode:'off',controlPeerId:null,controlPeerName:null,controlExpiresAt:null});}
};
})();
"""

class Client:
    def __init__(self,ws):self.ws=ws;self.id=0;self.errors=[]
    async def call(self,method,params=None):
        self.id+=1;target=self.id
        await self.ws.send(json.dumps({'id':target,'method':method,'params':params or {}}))
        while True:
            raw=json.loads(await self.ws.recv())
            if raw.get('method')=='Runtime.exceptionThrown':
                self.errors.append(str(raw.get('params',{}).get('exceptionDetails',{}).get('text','exception')))
            if raw.get('id')==target:
                if 'error' in raw:raise RuntimeError(str(raw['error']))
                return raw.get('result',{})
    async def eval(self,expression):
        result=await self.call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
        if result.get('exceptionDetails'):raise RuntimeError(str(result['exceptionDetails']))
        return result.get('result',{}).get('value',None)

async def main():
    endpoint=None
    for i in range(100):
        try:
            items=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/list',timeout=1))
            page=next((x for x in items if x.get('type')=='page'),None)
            if page:endpoint=page['webSocketDebuggerUrl'];break
        except Exception:await asyncio.sleep(.15)
    if not endpoint:raise RuntimeError('Chrome DevTools connection failed')

    async with websockets.connect(endpoint,origin='http://localhost',max_size=8*1024*1024) as ws:
        client=Client(ws)
        await client.call('Page.enable')
        await client.call('Runtime.enable')
        await client.call('Page.addScriptToEvaluateOnNewDocument',{'source':BOOTSTRAP})
        await client.call('Page.navigate',{'url':URL})
        await asyncio.sleep(1)
        basic=await client.eval("({ready:!!document.querySelector('#tab-overview'),active:document.querySelector('.nav-item.active')?.dataset.target,head:document.title,errors:window.__actions.length})")
        print('BOOT',json.dumps(basic))
        assert basic['active']=='overview'

        for width,height in [(1440,900),(1152,768),(900,700),(700,800),(390,844)]:
            await client.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False})
            await asyncio.sleep(.25)
            for tab in ['overview','connections','folders','browser','peers','activity','settings']:
                await client.eval(f"document.querySelector('#tab-{tab}').click();")
                details=await client.eval("""(() => {
                  const active=[...document.querySelectorAll('.tab-panel')].filter(x=>!x.hidden);
                  const main=document.querySelector('.content');
                  const regions=[...document.querySelectorAll('.tab-panel:not([hidden]) .card')];
                  return {active:active.length,name:active[0]?.id,
                    bodyOverflow:document.documentElement.scrollWidth>innerWidth+2,
                    mainOverflow:main.scrollWidth>main.clientWidth+2,
                    navOverflow:document.querySelector('.sidebar nav').scrollWidth>document.querySelector('.sidebar nav').clientWidth+3,
                    cardCount:regions.length, visibleMain:main.getBoundingClientRect().width>0,
                    heading:document.querySelector('#pageTitle')?.textContent};
                })()""")
                assert details['active']==1 and details['name']=='panel-'+tab,(width,tab,details)
                assert not details['bodyOverflow'] and not details['mainOverflow'],(width,tab,details)
                assert details['visibleMain'],(width,tab,'Main not visible')
                if tab in ('overview','peers'):
                    print('LAYOUT',width,tab,json.dumps(details))
            if width in (1152,390):
                for tabname in ('connections','peers','settings'):
                    await client.eval(f"document.querySelector('#tab-{tabname}').click();")
                    shot_tab=await client.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
                    from io import BytesIO
                    img_tab=Image.open(BytesIO(base64.b64decode(shot_tab['data']))).convert('RGB')
                    img_tab.thumbnail((1000,800))
                    img_tab.save(OUT/f'{tabname}-{width}.jpg',quality=72,optimize=True)
            await client.eval("document.querySelector('#tab-overview').click();")
            shot=await client.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
            raw=base64.b64decode(shot['data'])
            png=OUT/f'overview-{width}.png';png.write_bytes(raw)
            img=Image.open(png).convert('RGB')
            img.thumbnail((1100,800))
            img.save(OUT/f'overview-{width}.jpg',quality=76,optimize=True)
        await client.call('Emulation.setDeviceMetricsOverride',{'width':1152,'height':768,'deviceScaleFactor':1,'mobile':False})
        await client.eval("document.querySelector('#tab-overview').click();document.querySelector('#tab-overview').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));")
        assert await client.eval("document.querySelector('.nav-item.active').dataset.target") == 'connections'
        await client.eval("document.querySelector('#tab-overview').click();document.querySelector('.quick-link[data-go=folders]').click();")
        assert await client.eval("document.querySelector('.nav-item.active').dataset.target") == 'folders'
        print('NAVIGATION keyboard + quick links passed')
        await client.eval("document.querySelector('#tab-settings').click();document.querySelector('#enableWrite').click();")
        dirty=await client.eval("({visible:!document.querySelector('#topSave').hidden,dot:!document.querySelector('#settingsDirtyDot').hidden})")
        print('SAVE DIRTY',dirty)
        assert dirty['visible'] and dirty['dot']
        await client.eval("document.querySelector('#tab-overview').click();document.querySelector('#topSave').click();")
        await asyncio.sleep(.1)
        saved=await client.eval("({name:document.querySelector('.nav-item.active')?.dataset.target,dirty:!document.querySelector('#topSave').hidden,actions:window.__actions, handler:typeof document.getElementById('save').onclick, message:document.getElementById('message').textContent, save:document.getElementById('save').outerHTML.slice(0,250)})")
        print('SAVE RESULT',saved)
        assert saved['name']=='settings' and not saved['dirty'] and 'save' in saved['actions']
        await client.eval("document.querySelector('#tab-connections').click();")
        await client.call('Page.captureScreenshot',{'format':'png'})
        # Persistent control must grant only the selected peer, show the global banner, and revoke across tabs.
        await client.eval("window.confirm=()=>true; document.querySelector('#tab-peers').click(); document.querySelector('#peerGrantDuration').value='until-revoked'; document.querySelector('#peerGrantControl').click();")
        await asyncio.sleep(.25)
        approved=await client.eval("({mode:window.__peerState.controlMode,id:window.__peerState.controlPeerId,visible:!document.querySelector('#peerAccessBanner').hidden,txt:document.querySelector('#peerAccessBannerText').textContent})")
        print('PERSISTENT CONTROL UI',approved)
        assert approved['mode']=='until-revoked' and approved['id']=='trusted-test' and approved['visible'],approved
        await client.eval("document.querySelector('#tab-overview').click(); document.querySelector('#peerAccessRevokeTop').click();")
        await asyncio.sleep(.25)
        revoked=await client.eval("({mode:window.__peerState.controlMode,hidden:document.querySelector('#peerAccessBanner').hidden,actions:window.__actions})")
        print('REVOKE FROM GLOBAL BANNER',revoked)
        assert revoked['mode']=='off' and revoked['hidden'] and 'revoke' in revoked['actions'],revoked
        # One click opens the preview as a near-full-screen modal at desktop and mobile widths.
        for width,height in [(1152,768),(390,844)]:
            await client.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False})
            await client.eval("document.querySelector('#tab-peers').click();document.querySelector('#peerSelect').value='trusted-test';document.querySelector('#peerSelect').dispatchEvent(new Event('change',{bubbles:true}));")
            await asyncio.sleep(.15)
            await client.eval("document.querySelector('#peerScreenExpand').click();")
            await asyncio.sleep(.25)
            result=await client.eval("""(() => {const el=document.querySelector('#peerScreenPane'),r=el.getBoundingClientRect();return {
              expanded:el.classList.contains('expanded'),modal:el.getAttribute('aria-modal'),
              parentIsBody:el.parentNode===document.body,width:r.width,height:r.height,
              highResolution:window.__actions.includes('screen:true'),bodyOverflow:document.documentElement.scrollWidth>innerWidth+2,
              view:document.querySelector('#peerScreenToggle').textContent};})()""")
            print('EXPANDED REMOTE PREVIEW',width,height,result)
            assert result['expanded'] and result['modal']=='true' and result['parentIsBody'], result
            assert result['width']>width*.85 and result['height']>height*.8 and not result['bodyOverflow'],result
            assert result['highResolution'] and result['view']=='Stop viewing',result
            await client.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));")
            restored=await client.eval("""(() => {const el=document.querySelector('#peerScreenPane');return {
              collapsed:!el.classList.contains('expanded'),backInWorkspace:el.parentElement.classList.contains('peer-workspace-grid'),
              expandedAria:document.querySelector('#peerScreenExpand').getAttribute('aria-expanded'),
              backdropHidden:document.querySelector('.peer-screen-backdrop').hidden};})()""")
            print('RESTORED PREVIEW',width,restored)
            assert restored['collapsed'] and restored['backInWorkspace'] and restored['expandedAria']=='false' and restored['backdropHidden'],restored
            await client.eval("document.querySelector('#tab-overview').click();")
        print('CDP runtime exceptions:',client.errors)
        assert not client.errors,client.errors
        print('ALL VIEWPORT + TAB TESTS PASSED')

try:
    asyncio.run(main())
finally:
    chrome.terminate()
    try:chrome.wait(timeout=8)
    except subprocess.TimeoutExpired:chrome.kill()
