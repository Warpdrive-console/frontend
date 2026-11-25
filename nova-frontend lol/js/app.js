'use strict';

function paintWifi() {
  const st = warp.peek('system.wifi.connection_status') || 'off',
    s = warp.peek('system.wifi.strength') || 0;
  setIcon($('#s-wifi'), st === 'off' ? 'status/wifi-off' : wifiIcon(st === 'connected' ? s : 0));
  $('#s-wifi').style.opacity = st === 'connecting' ? 0.5 : 1;
}

warp.watch('system.wifi.connection_status', paintWifi);
warp.watch('system.wifi.strength', paintWifi);

warp.watch('system.bluetooth.connection_status', st =>
  setIcon(
    $('#s-bt'),
    st === 'connected' ? 'status/bluetooth-connected' : st === 'on' ? 'status/bluetooth' : null,
  ),
);

function paintBattery() {
  const l = warp.peek('system.battery.level') ?? 1,
    c = warp.peek('system.battery.charging'),
    present = warp.peek('system.battery.present') !== false;
  setIcon(
    $('#s-bat'),
    !present ? null : c ? 'status/battery-charging' : `status/battery-${Math.round(l * 5) * 20}`,
  );
  $('#s-bat').classList.toggle('low', l < 0.15 && !c);
  $('#s-pct').textContent = present ? pct(l) : '';
}

['system.battery.level', 'system.battery.charging', 'system.battery.present'].forEach(p =>
  warp.watch(p, paintBattery),
);

warp.watch('input.gamepads', pads =>
  setIcon($('#s-pad'), (pads || []).some(p => !p.builtin) ? 'status/gamepad' : null),
);

let offCell = null;

warp.watch('system.network.type', t => {
  if (t === 'cellular' && !offCell)
    offCell = warp.watch('system.network.cellular', c =>
      setIcon($('#s-cell'), c ? barsIcon(c.strength) : null),
    );
  if (t !== 'cellular') {
    offCell?.();
    offCell = null;
    setIcon($('#s-cell'), null);
  }
});

let h24 = false;

warp.watch('system.time.format24', v => {
  h24 = !!v;
  tick();
});

function tick() {
  const t = new Date()
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !h24 })
    .replace(/\s?[AP]M$/i, '');
  $('#clock').textContent = t;
  $('#q-clock').textContent = t;
}

tick();
setInterval(tick, 5000);

function paintMe() {
  const st = Rotur.s.get();
  $('#me-avatar').src = Rotur.signedIn() ? avatarUrl(st.username, 96) : 'assets/avatar.svg';
  $('#me-name').textContent = Rotur.signedIn() ? Rotur.displayName() : 'Guest';
  $('#me-sub').textContent = !Rotur.signedIn()
    ? 'Sign in'
    : st.connected
      ? `${Rotur.onlineCount()} friends online`
      : 'Connecting…';
  const req = st.requests.length;
  $('[data-go="friends"]').querySelector('.count')?.remove();
  if (req) $('[data-go="friends"]').append(h('span', { class: 'count' }, req));
}

$('#me-avatar').onerror = e => {
  e.target.src = 'assets/avatar.svg';
};

Rotur.s.on(paintMe);
$('#me').onclick = () => go('friends');

Chats.s.on(() => {
  const n = Chats.totalUnread();
  $('#dock-unread').hidden = !n;
  $('#dock-unread').textContent = n;
});

let games = [],
  firstGames = true;

const initials = n =>
  n
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function renderGames(list) {
  games = list || [];
  const row = $('#games'),
    had = document.activeElement?.dataset.game,
    running = warp.peek('library.running');
  row.replaceChildren(
    ...games.map(g =>
      h(
        'button',
        {
          class: 'tile',
          'data-nav': true,
          'data-game': g.id,
          style: { backgroundImage: `url("${g.icon || 'assets/cover.svg'}")` },
          onclick: () => {
            Sound.play('select');
            running === g.id ? call('library.resume') : call('library.launch', { id: g.id });
          },
          onnavfocus: () => title(g),
        },
        g.icon ? null : h('span', { class: 'initials' }, initials(g.name)),
        running === g.id ? h('span', { class: 'badge' }, 'Running') : null,
      ),
    ),
    h(
      'button',
      {
        class: 'tile add',
        'data-nav': true,
        onclick: addGame,
        onnavfocus: () => setTitle('Add a game', 'Install a web game from a .zip'),
      },
      icon('add'),
    ),
  );
  const again = had && $(`[data-game="${CSS.escape(had)}"]`, row);
  if (again) focus(again, true);
  else if (firstGames && screen === 'home' && !layers.length && row.firstChild) focus(row.firstChild, true);
  else if (screen === 'home' && !layers.length && !current()) enter();
  firstGames = false;
}

warp.watch('library.games', renderGames);
warp.on('library.running', () => renderGames(games));

function setTitle(t, s) {
  $('#now-title').textContent = t;
  $('#now-sub').textContent = s;
}

function title(g) {
  const running = warp.peek('library.running') === g.id;
  setTitle(
    g.name,
    running
      ? 'Running · press A to return'
      : [
          g.last_played ? `Played ${ago(g.last_played)}` : 'Not played yet',
          g.play_time ? `${dur(g.play_time)} total` : null,
        ]
          .filter(Boolean)
          .join(' · '),
  );
}

async function addGame() {
  try {
    const g = await warp.call('library.install');
    if (g) note({ title: 'Game installed', text: g.name, iconName: 'game' });
  } catch (e) {
    fail(e);
  }
}

async function gameOptions(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;
  const r = await dialog({
    title: g.name,
    text: `Installed ${ago(g.installed)}${g.play_time ? ` · ${dur(g.play_time)} played` : ''}`,
    actions: [['Delete', false, true], ['Rename'], ['Close', true]],
  });
  if (r === 'Rename') {
    const name = await askText({ title: 'Rename', value: g.name });
    if (name) call('library.rename', { id, name });
  }
  if (
    r === 'Delete' &&
    (await dialog({
      title: `Delete ${g.name}?`,
      text: 'Its files and save data are removed.',
      actions: [['Keep it'], ['Delete', true, true]],
    })) === 'Delete'
  )
    call('library.remove', { id });
}

for (const b of $$('#dock .round')) {
  b.addEventListener('navfocus', () => {
    $('#dock-label').textContent = b.dataset.label;
  });
  b.addEventListener('blur', () => {
    $('#dock-label').textContent = '';
  });
  b.onclick = () => {
    Sound.play('select');
    b.dataset.go === 'power' ? powerMenu() : go(b.dataset.go);
  };
}

async function powerMenu() {
  const r = await dialog({
    title: 'Power options',
    actions: [['Restart'], ['Power off', false, true], ['Sleep', true]],
  });
  if (r === 'Sleep') call('system.power.sleep');
  if (r === 'Restart') powerAsk('reboot', 'Restart');
  if (r === 'Power off') powerAsk('shutdown', 'Power off');
}

Screens.home = {
  prompts: el =>
    el?.dataset.game
      ? [
          ['x', 'Options'],
          ['select', 'Quick menu'],
          ['a', warp.peek('library.running') === el.dataset.game ? 'Resume' : 'Start'],
        ]
      : el?.id === 'me'
        ? [
            ['select', 'Quick menu'],
            ['a', 'Profile'],
          ]
        : [
            ['select', 'Quick menu'],
            ['a', 'OK'],
          ],
};

warp.watch('apps.list', apps => {
  $('#app-grid').replaceChildren(
    ...(apps || []).map(a =>
      h(
        'button',
        {
          class: 'app',
          'data-nav': true,
          title: a.name,
          onclick: () => {
            Sound.play('select');
            call('apps.launch', { package: a.package });
          },
        },
        h('img', { src: a.icon, alt: '', loading: 'lazy' }),
        h('span', {}, a.name),
      ),
    ),
  );
});

Screens.apps = {
  prompts: () => [
    ['b', 'Home'],
    ['a', 'Open'],
  ],
};

let unbindQuick = null;

function openQuick() {
  const id = warp.peek('library.running'),
    g = games.find(x => x.id === id);
  $('#game-strip').hidden = !id;
  if (g) {
    $('#gs-title').textContent = g.name;
    $('#gs-time').textContent = g.play_time ? `${dur(g.play_time)} played` : 'Just started';
    $('#gs-art').style.backgroundImage = `url("${g.icon || 'assets/cover.svg'}")`;
  }
  if ($('#quick').hidden) {
    unbindQuick = bind($('#quick'));
    memory.delete($('#quick'));
    openLayer($('#quick'));
  }
}

function closeQuick() {
  if (!$('#quick').hidden) {
    unbindQuick?.();
    unbindQuick = null;
    closeLayer($('#quick'));
  }
}

function toggleQuick() {
  if (layers.at(-1) === $('#dialog')) return;
  if ($('#quick').hidden) {
    Sound.play('select');
    openQuick();
  } else if (warp.peek('library.running') && !warp.peek('library.in_front')) call('library.resume');
  else {
    Sound.play('back');
    closeQuick();
  }
}

$('#quick').addEventListener('click', e => {
  if (e.target === $('#quick')) toggleQuick();
});

warp.watch('library.in_front', inFront => {
  if (inFront) closeQuick();
  else if (warp.peek('library.running')) openQuick();
});

$('#gs-resume').onclick = () => call('library.resume');
$('#gs-quit').onclick = () => warp.call('library.close').then(closeQuick, fail);

$('#q-shot').onclick = async () => {
  closeQuick();
  await sleep(350);
  warp
    .call('system.display.screenshot')
    .then(p => note({ title: 'Screenshot saved', text: p.split('/').pop(), iconName: 'camera' }), fail);
};

warp.on('input.button', e => {
  if (!e.pressed) return;
  const el = current();

  if (kbOpen() && !['up', 'down', 'left', 'right', 'a', 'b'].includes(e.button)) return;
  switch (e.button) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      if (el?.dataset.slider && (e.button === 'left' || e.button === 'right'))
        return setSlider(el, (el._v ?? 0) + (e.button === 'right' ? 0.05 : -0.05));
      return move(e.button);
    case 'a':
      if (!e.repeat || el?.hasAttribute('data-repeat')) (el || document.activeElement)?.click?.();
      return;
    case 'b':
      if (!e.repeat) back();
      return;
    case 'x':
      if (el?.dataset.game) gameOptions(el.dataset.game);
      return;
    case 'select':
    case 'guide':
      return toggleQuick();
    case 'l1':
    case 'r1':
      if (!layers.length) Screens[screen]?.shoulder?.(e.button === 'l1' ? -1 : 1);
      return;
    case 'l2':
    case 'r2':
      return pageScroll(e.button === 'l2' ? -1 : 1);
    case 'start':
      if (!layers.length) go(screen === 'settings' ? 'home' : 'settings');
      return;
  }
});

function back() {
  const top = layers.at(-1);
  if (top === $('#dialog')) {
    Sound.play('back');
    return dialogClose(null);
  }
  if (top === $('#quick')) return toggleQuick();
  if (Screens[screen]?.back?.()) {
    Sound.play('back');
    return;
  }
  if (screen !== 'home') {
    Sound.play('back');
    go('home');
  }
}

document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-nav]');
  if (el && navItems().includes(el)) focus(el, true);
});

paintIcons();
applyPrefs();
paintMe();
Rotur.connect();
go('home');
window.__booted = true;
Sound.load().then(() => Sound.play('startup'));
