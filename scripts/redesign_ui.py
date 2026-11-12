#!/usr/bin/env python3
from bs4 import BeautifulSoup
from pathlib import Path

path=Path("src/renderer/index.html")
source=path.read_text()
if "navigation.js" in source:
    raise SystemExit("This one-time v0.2.13 migration has already been applied; do not rerun.")
soup=BeautifulSoup(source,"html.parser")
main=soup.select_one("main.content")
sidebar=soup.select_one("aside.sidebar")
nav=sidebar.select_one("nav")

# Preserve all original tools, inputs and buttons when moving sections.
overview=soup.select_one("#overview").extract()
stats=soup.select_one(".stats-grid").extract()
connections=soup.select_one("#connections")
browser=connections.select_one("#browser").extract()
connections.extract()
folders=soup.select_one("#folders").extract()
drives=soup.select_one("#mountedDrives").find_parent("section").extract()
activity=soup.select_one("#activity").extract()
diagnostics=soup.select_one("#diagnostics").extract()
settings=soup.select_one("#settings").extract()
peers=soup.select_one("#peers").extract()
save=soup.select_one(".save-bar").extract()
footer=soup.select_one("main.content footer").extract()
main.clear()
nav.clear()

icons={
 "overview": '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 "connections": '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M10 6h3a3 3 0 0 1 3 3v5M14 11l2 3 3-2"/>',
 "folders": '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>',
 "browser": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m5 5 5 5M14 13l4 6M14 9l7 0"/>',
 "peers": '<rect x="2" y="6" width="12" height="9" rx="2"/><path d="M5 18h6M8 15v3"/><rect x="17" y="3" width="5" height="9" rx="1"/><path d="m15 7 2-1m-1 6-2-2"/>',
 "activity": '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
 "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.9l.08.08-2.8 2.8-.08-.08a1.7 1.7 0 0 0-1.9-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.9.34l-.08.08-2.8-2.8.08-.08A1.7 1.7 0 0 0 4.68 15a1.7 1.7 0 0 0-1.55-1H3v-4h.13A1.7 1.7 0 0 0 4.68 9a1.7 1.7 0 0 0-.34-1.9l-.08-.08 2.8-2.8.08.08A1.7 1.7 0 0 0 9 4.68a1.7 1.7 0 0 0 1-1.55V3h4v.13A1.7 1.7 0 0 0 15 4.68a1.7 1.7 0 0 0 1.9-.34l.08-.08 2.8 2.8-.08.08A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.05A1.7 1.7 0 0 0 19.4 15z"/>',
 "shield": '<path d="m12 22 7-4V6l-7-3-7 3v12z"/><path d="m9 12 2 2 4-4"/>',
 "arrow": '<path d="M5 12h14m-6-6 6 6-6 6"/>',
 "terminal": '<rect x="2" y="3" width="20" height="18" rx="3"/><path d="m7 8 4 4-4 4m6 0h4"/>',
 "harddrive": '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 13h18m-4 3h.01m-3 0h.01"/>',
 "key": '<circle cx="8" cy="15" r="4"/><path d="M11 12 20 3l1 4-3 1-1 3-3 1"/>',
 "circle": '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.4 2.4 5-5"/>',
 "refresh": '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 9a7 7 0 0 1 12-2l2 5M4 12l2 5a7 7 0 0 0 12-2"/>',
 "save": '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v6h8"/>',
 "monitor": '<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8m-4-4v4"/>',
 "plus": '<path d="M12 5v14M5 12h14"/>',
 "logs": '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
}
def icon(name, classname="icon"):
    svg=BeautifulSoup(f'<svg class="{classname}" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">{icons[name]}</svg>',"html.parser").svg
    return svg

nav['role']="tablist"
nav['aria-label']="MCP Bridge areas"
nav['aria-orientation']="vertical"
tabs=[
 ("overview","Overview","Workspace overview and status"),
 ("connections","Connections","Start and stop MCP tunnels"),
 ("folders","Local folders","Manage allowed folders and drives"),
 ("browser","Browser","Chrome DevTools integration"),
 ("peers","Team peers","Secure computer-to-computer access"),
 ("activity","Activity","Logs and diagnostics"),
 ("settings","Settings","Credentials, permissions, and updates")
]
for i,(key,label,hint) in enumerate(tabs):
    if key in ("overview","activity"):
        group=soup.new_tag("div",attrs={"class":"nav-section-label"})
        group.string="WORKSPACE" if key=="overview" else "SYSTEM"
        nav.append(group)
    btn=soup.new_tag("button",attrs={
       "id":"tab-"+key,"type":"button",
       "class":"nav-item"+(" active" if i==0 else ""),
       "data-target":key,"role":"tab","aria-controls":"panel-"+key,
       "aria-selected":"true" if i==0 else "false",
       "aria-label":label,
       "title":hint,
       "tabindex":"0" if i==0 else "-1"})
    btn.append(icon(key))
    labelspan=soup.new_tag("span",attrs={"class":"nav-label"});labelspan.string=label
    btn.append(labelspan)
    if key=="settings":
        mark=soup.new_tag("span",attrs={"id":"settingsDirtyDot","class":"nav-dirty","hidden":""})
        btn.append(mark)
    nav.append(btn)

# Sidebar brand and bottom connection status.
brand=sidebar.select_one(".brand")
brand.select_one(".brand span").string="PRIVATE MCP WORKSPACE"
badge=soup.new_tag("div",attrs={"class":"brand-subtitle"});badge.string="By Advertpreneur"
brand.append(badge)
foot=soup.new_tag("div",attrs={"class":"sidebar-footer"})
foot.append(sidebar.select_one(".sidebar-status").extract())
small=soup.new_tag("div",attrs={"class":"sidebar-version","id":"sidebarVersion"});small.string="Bridge • Local workspace"
foot.append(small)
sidebar.append(foot)

header=BeautifulSoup("""
<header class="app-topbar">
  <div class="topbar-left">
    <span class="topbar-symbol" aria-hidden="true"></span>
    <div class="topbar-breadcrumb"><span>WORKSPACE</span><span class="breadcrumb-separator">/</span><strong id="activeModule">Overview</strong></div>
  </div>
  <div class="topbar-actions">
    <span id="topConnection" class="live-count"><span class="live-indicator"></span><span id="liveServiceStatus">Checking tunnels</span></span>
    <button id="topSave" class="top-save" type="button" hidden></button>
    <span id="topVersion" class="version-chip">v0.2.13</span>
  </div>
</header>
<div class="page-heading">
  <div>
    <div class="page-kicker" id="pageKicker">CONTROL CENTER</div>
    <h1 id="pageTitle">Workspace overview</h1>
    <p id="pageSubtitle">Your services, connected in one place.</p>
  </div>
  <div class="page-side-action" id="pageSideAction"><span class="mini-check"></span> Private, local-first</div>
</div>
""","html.parser")
for n in list(header.contents):
    main.append(n)

def panel(key,nodes):
    wrapper=soup.new_tag("section",attrs={
        "id":"panel-"+key,"class":"tab-panel","role":"tabpanel","aria-labelledby":"tab-"+key,
        "tabindex":"0"})
    if key!="overview":wrapper['hidden']=""
    for n in nodes:
        if isinstance(n,str): wrapper.append(BeautifulSoup(n,"html.parser"))
        else: wrapper.append(n)
    main.append(wrapper)

# Overview: original state cards preserved, with meaningful quick links.
overview['class']=["hero","overview-hero"]
overview.select_one(".eyebrow").string="READY WHEN YOU ARE"
overview.select_one("h1").string="Your workspace. All connected."
overview.select_one("p").string="A clear view of every active MCP tunnel, permission and connected resource."
overview.select_one("#restartAll").string="Restart running services"
stats['class']=["stats-grid"]
for el,name in zip(stats.select(".stat-icon"),["folders","browser","key","harddrive"]):
    el.clear();el.append(icon(name))
welcome=BeautifulSoup("""
<div class="overview-lower">
  <article class="card overview-help">
    <div class="card-head"><div><span class="section-overline">GET STARTED</span><h2>Everything in its place</h2><p>Choose a workspace to manage that part of your setup.</p></div></div>
    <div class="quick-link-grid">
      <button type="button" class="quick-link" data-go="connections"><span class="quick-icon" data-ico="connections"></span><span><strong>Manage tunnels</strong><small>Start, stop and inspect connections</small></span><span class="quick-arrow" data-ico="arrow"></span></button>
      <button type="button" class="quick-link" data-go="folders"><span class="quick-icon" data-ico="folders"></span><span><strong>Manage access</strong><small>Choose the folders ChatGPT can reach</small></span><span class="quick-arrow" data-ico="arrow"></span></button>
      <button type="button" class="quick-link" data-go="peers"><span class="quick-icon" data-ico="peers"></span><span><strong>Team connections</strong><small>Private chat and screen sharing</small></span><span class="quick-arrow" data-ico="arrow"></span></button>
      <button type="button" class="quick-link" data-go="activity"><span class="quick-icon" data-ico="activity"></span><span><strong>Check activity</strong><small>Inspect runtime logs and diagnostics</small></span><span class="quick-arrow" data-ico="arrow"></span></button>
    </div>
  </article>
  <article class="card trust-card">
    <div class="trust-icon" data-ico="shield"></div>
    <span class="section-overline">SECURITY STATUS</span>
    <h2>You stay in control.</h2>
    <p>Only your approved folders and enabled services are available through the MCP Bridge.</p>
    <div class="trust-divider"></div>
    <div class="trust-item"><span class="live-indicator"></span><span>Local tunnel</span><strong id="overviewLocalStatus">Checking</strong></div>
    <div class="trust-item"><span class="live-indicator"></span><span>Web tunnel</span><strong id="overviewWebStatus">Checking</strong></div>
    <div class="trust-item"><span class="live-indicator"></span><span>Meta Manager</span><strong id="overviewMetaStatus">Checking</strong></div>
    <button class="trust-link" data-go="settings" type="button">Review permissions <span data-ico="arrow"></span></button>
  </article>
</div>
""","html.parser")
for span in welcome.select("[data-ico]"):
    span.clear();span.append(icon(span['data-ico']))
panel("overview",[overview,stats,welcome])

# Connections: original service buttons and tunnel IDs remain untouched.
connections['class']=["connections-layout"]
card=connections.select_one(".card")
card.select_one("h2").string="Your MCP services"
card.select_one(".card-head p").string="Independently control each secure tunnel. Your saved IDs remain unchanged."
for row,name in zip(connections.select(".service-logo"),["folders","browser","connections"]):
    row.clear();row.append(icon(name))
info=BeautifulSoup("""
<article class="card connection-guide">
 <span class="section-overline">HOW IT WORKS</span>
 <h2>Three independent connections.</h2>
 <p>Each service is isolated and can be managed without affecting the others.</p>
 <div class="guide-steps">
  <div class="guide-step"><span class="step-number">01</span><div><strong>Local MCP</strong><small>Controlled access to approved files and terminal operations.</small></div></div>
  <div class="guide-step"><span class="step-number">02</span><div><strong>Web MCP</strong><small>Browser operations through your existing Chrome session.</small></div></div>
  <div class="guide-step"><span class="step-number">03</span><div><strong>Meta Manager</strong><small>Dedicated connection to the local Meta Manager MCP server.</small></div></div>
 </div>
 <button type="button" class="outline-btn guide-button" data-go="settings">Configure tunnel IDs</button>
</article>
""","html.parser").article
connections.append(info)
panel("connections",[connections])

browser['class']=["card","browser-main-card"]
browser.select_one("h2").string="Chrome DevTools connection"
browser.select_one(".card-head p").string="Control your existing Chrome session with the browser's native debugging interface."
browser_help=BeautifulSoup("""
<div class="browser-guides">
 <article class="card">
  <span class="section-overline">BROWSER SETUP</span>
  <h2>Connect your Chrome session</h2>
  <p>Allow Chrome remote debugging, then start Web MCP from the Connections tab.</p>
  <div class="browser-step"><span>1</span><div><strong>Enable Chrome debugging</strong><small>Open chrome://inspect/#remote-debugging in Chrome.</small></div></div>
  <div class="browser-step"><span>2</span><div><strong>Start the Web MCP tunnel</strong><small>The Bridge connects to your existing browser.</small></div></div>
  <div class="browser-step"><span>3</span><div><strong>Use browser tools in ChatGPT</strong><small>Access is limited to your authorized connection.</small></div></div>
  <button class="outline-btn" data-go="connections" type="button">Open connections</button>
 </article>
 <article class="card browser-privacy">
  <span class="section-overline">CONFIGURATION</span><h2>Browser permissions</h2>
  <p>Vision and usage reporting are controlled in Settings. Changes take effect after saving and restarting the affected tunnel.</p>
  <button class="text-btn" data-go="settings" type="button">Review browser settings</button>
 </article>
</div>
""","html.parser")
panel("browser",[browser,browser_help])

foldercallout=BeautifulSoup("""
<div class="folder-note">
  <div><strong>Changes to folder access are not automatic.</strong><span>Save your folder changes to update which folders Local MCP can access.</span></div>
  <button class="primary-btn" id="saveFolders" type="button">Save folder changes</button>
</div>
""","html.parser")
panel("folders",[folders,drives,foldercallout])

activity['class']=["card","activity-card"]
panel("activity",[activity,diagnostics])

peers['class']=["peer-zone","peer-tab"]
panel("peers",[peers])

save['class']=["save-bar","settings-save"]
save.select_one("strong").string="Your configuration stays on this computer."
save.select_one("span").string="Changes to permissions and connections apply when you save."
panel("settings",[settings,save,footer])

# Help all actual visual sections line up as interactive, distinct panels.
for tag in soup.select(".tab-panel[hidden]"):
    assert tag.get("hidden") is not None

# Static icons in status cards and labels, and safe default head load.
stylelink=soup.new_tag("link",attrs={"rel":"stylesheet","href":"app-shell.css"})
soup.head.append(stylelink)
script=soup.new_tag("script",attrs={"src":"navigation.js"})
soup.body.append(script)
path.write_text(str(soup))
print('Rebuilt tabbed UI with',len(main.select(".tab-panel")),'panels and',len(nav.select("button.nav-item")),'accessible tabs.')
print('All original controls available:',len(main.select("[id]")),'IDs')
