/* Tab navigation and cross-page save state for MCP Bridge.
   Keeps the original renderer, IPC handlers, and Team Peers features intact. */
(() => {
  'use strict';

  const labels = {
    overview:   { kicker:'CONTROL CENTER', title:'Workspace overview', subtitle:'Everything connected to your ChatGPT workspace, at a glance.' },
    connections:{ kicker:'SECURE TUNNELS', title:'Connections', subtitle:'Manage your Local, Web, and Meta Manager MCP tunnels independently.' },
    folders:    { kicker:'ACCESS MANAGEMENT', title:'Local folders', subtitle:'Choose which folders and mounted drives your Local MCP connection can reach.' },
    browser:    { kicker:'CHROME INTEGRATION', title:'Browser', subtitle:'Control how ChatGPT interacts with your Chrome session.' },
    peers:      { kicker:'PRIVATE TEAM NETWORK', title:'Team peers', subtitle:'Connect trusted computers, exchange messages and share screens through Tailscale.' },
    activity:   { kicker:'RUNTIME INSIGHTS', title:'Activity & diagnostics', subtitle:'Review recent events, investigate problems and prepare sanitized support reports.' },
    settings:   { kicker:'CONFIGURATION', title:'Settings', subtitle:'Secure credentials, permissions, startup behavior and app updates.' }
  };

  const $ = id => document.getElementById(id);
  const buttons = Array.from(document.querySelectorAll('.sidebar .nav-item'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  const settings = $('settings');
  const folders = $('folders');
  let currentTab = 'overview';
  let changed = false;

  function showSaveState(dirty) {
    changed = Boolean(dirty);
    const dot = $('settingsDirtyDot');
    if (dot) dot.hidden = !changed;
    const save = $('topSave');
    if (save) {
      save.hidden = !changed;
      save.textContent = changed ? 'Save changes' : 'Saved';
      save.setAttribute('aria-label', 'Save pending MCP Bridge configuration changes');
    }
    const folder = $('saveFolders');
    if (folder) folder.textContent = changed ? 'Save folder changes' : 'Save current settings';
  }
  window.markBridgeUnsaved = () => showSaveState(true);
  window.bridgeMarkSaved = () => showSaveState(false);

  function syncOrientation() {
    const nav = document.querySelector('.sidebar nav');
    if (nav) nav.setAttribute('aria-orientation', window.innerWidth <= 760 ? 'horizontal' : 'vertical');
  }

  function changeTab(name, push = true, focusPanel = false) {
    if (!Object.hasOwn(labels, name)) name = 'overview';
    const prior = currentTab;
    currentTab = name;
    for (const button of buttons) {
      const on = button.dataset.target === name;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
    }
    for (const panel of panels) {
      panel.hidden = panel.id !== 'panel-' + name;
    }
    $('activeModule').textContent = name === 'peers' ? 'Team peers' : labels[name].title;
    $('pageKicker').textContent = labels[name].kicker;
    $('pageTitle').textContent = labels[name].title;
    $('pageSubtitle').textContent = labels[name].subtitle;
    const container = document.querySelector('main.content');
    if (container) container.scrollTop = 0;

    if (push && location.hash !== '#' + name) {
      history.pushState({ tab: name }, '', '#' + name);
    }
    if (focusPanel) {
      const button = $('tab-' + name);
      button?.focus({ preventScroll: true });
      if (window.innerWidth <= 760) button?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
    }
    if (prior !== name) document.dispatchEvent(new CustomEvent('bridge:tabchange', { detail: { from: prior, to: name } }));
  }

  for (const button of buttons) {
    button.addEventListener('click', () => changeTab(button.dataset.target));
    button.addEventListener('keydown', event => {
      const horizontal = window.innerWidth <= 760;
      const forward = horizontal ? 'ArrowRight' : 'ArrowDown';
      const back = horizontal ? 'ArrowLeft' : 'ArrowUp';
      let index = buttons.indexOf(button);
      if (event.key === forward) index = (index + 1) % buttons.length;
      else if (event.key === back) index = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = buttons.length - 1;
      else return;
      event.preventDefault();
      changeTab(buttons[index].dataset.target, true, true);
    });
  }
  document.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => changeTab(btn.dataset.go, true, true));
  });
  function updateState(state) {
    if (!state) return;
    const active = [state.localRunning, state.browserRunning, state.metaRunning].filter(Boolean).length;
    $('liveServiceStatus').textContent = active + ' / 3 tunnels';
    $('topConnection').classList.toggle('offline', active === 0);
    $('overviewLocalStatus').textContent = state.localRunning ? 'Running' : 'Stopped';
    $('overviewWebStatus').textContent = state.browserRunning ? 'Running' : 'Stopped';
    $('overviewMetaStatus').textContent = state.metaRunning ? 'Running' : 'Stopped';
    $('topVersion').textContent = 'v' + (state.appVersion || '0.2.16');
    $('sidebarVersion').textContent = 'MCP Bridge · v' + (state.appVersion || '0.2.16');
  }

  settings?.addEventListener('change', window.markBridgeUnsaved);
  settings?.addEventListener('input', event => {
    if (event.target.matches('input, select, textarea')) window.markBridgeUnsaved();
  });
  folders?.addEventListener('change', window.markBridgeUnsaved);
  folders?.addEventListener('input', event => {
    if (event.target.matches('input, select, textarea')) window.markBridgeUnsaved();
  });

  $('topSave')?.addEventListener('click', () => {
    changeTab('settings', true);
    $('save')?.click();
  });
  $('saveFolders')?.addEventListener('click', () => {
    $('save')?.click();
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      $('save')?.click();
    }
    if (event.altKey && /^[1-7]$/.test(event.key)) {
      event.preventDefault();
      const choice = buttons[Number(event.key) - 1];
      if (choice) changeTab(choice.dataset.target, true, true);
    }
  });

  window.addEventListener('resize', syncOrientation, { passive:true });
  window.addEventListener('popstate', () => changeTab(location.hash.replace(/^#/, ''), false));
  window.addEventListener('hashchange', () => changeTab(location.hash.replace(/^#/, ''), false));

  syncOrientation();
  showSaveState(false);
  changeTab(location.hash.replace(/^#/, '') || 'overview', false);
  window.bridge.onState(updateState);
  window.bridge.getState().then(updateState).catch(() => {
    $('liveServiceStatus').textContent = 'Status unavailable';
    $('topConnection').classList.add('offline');
  });
})();