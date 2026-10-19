const socket = io();
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = null;        // последнее состояние игры
let sel = null;      // выбранная карта, которой нужна цель
let pickFor = null;  // {card, target} для «Паники» и «Красотки»
let inGame = false;

const show = id => ['login', 'lobby', 'game'].forEach(s => { $(s).hidden = s !== id; });
function toast(m) {
    const t = $('toast'); t.textContent = m; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
function btn(text, fn) { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; return b; }

// ---------- лобби ----------
const join = () => { const n = $('username').value.trim(); if (n) socket.emit('joinGame', n); };
$('join-btn').onclick = join;
$('username').onkeydown = e => { if (e.key === 'Enter') join(); };
$('start-btn').onclick = () => socket.emit('requestStartGame');
$('again-btn').onclick = () => socket.emit('backToLobby');
$('end-btn').onclick = () => socket.emit('endTurn');
$('take-btn').onclick = () => socket.emit('respond', { cardId: null });

socket.on('errorMsg', toast);
socket.on('toLobby', () => { inGame = false; S = null; sel = null; pickFor = null; });
socket.on('lobby', d => {
    if (inGame) return;
    if (d.players.some(p => p.id === socket.id)) {
        show('lobby');
        $('player-list').innerHTML = d.players.map(p => `<li>🤠 ${esc(p.name)}</li>`).join('');
        const host = d.players[0].id === socket.id;
        $('start-btn').hidden = !(host && d.players.length >= d.min);
        $('lobby-hint').textContent = d.players.length < d.min
            ? `Ждём игроков: нужно минимум ${d.min}`
            : host ? 'Можно начинать' : 'Ждём, пока хозяин салуна начнёт игру';
    } else {
        show('login');
        $('login-note').textContent = d.inGame ? 'Партия уже идёт — дождитесь её конца' : '';
    }
});

// ---------- игра ----------
socket.on('state', s => {
    inGame = true; S = s;
    if (sel && (s.turn !== socket.id || s.pending || !s.me.hand.some(c => c.id === sel.id))) sel = null;
    if (!s.me.hand.length || s.turn !== socket.id) pickFor = null;
    show('game'); render();
});

function validTarget(p) {
    if (!sel || !p.alive || p.id === socket.id) return false;
    if (sel.key === 'BANG') return p.dist <= S.range;
    if (sel.key === 'PANIC') return p.dist <= 1;
    if (sel.key === 'PRISON') return p.role !== 'Шериф';
    return true;
}

function onSeat(id) {
    const p = S.players.find(x => x.id === id);
    if (!sel || !validTarget(p)) return;
    if (sel.key === 'PANIC' || sel.key === 'CAT_BALOU') { pickFor = { card: sel, target: p }; return render(); }
    socket.emit('playCard', { cardId: sel.id, targetId: id });
    sel = null;
}

function doPick(pick) {
    socket.emit('playCard', { cardId: pickFor.card.id, targetId: pickFor.target.id, pick });
    pickFor = null; sel = null;
}

function onCard(c) {
    if (S.winner) return;
    const pd = S.pending;
    if (pd) { if (pd.cur === socket.id && pd.need === c.key) socket.emit('respond', { cardId: c.id }); return; }
    if (S.turn !== socket.id) return;
    if (S.phase === 'discard') return socket.emit('discardCard', { cardId: c.id });
    if (c.target) { sel = sel && sel.id === c.id ? null : c; pickFor = null; return render(); }
    socket.emit('playCard', { cardId: c.id });
}

const nameOf = id => (S.players.find(p => p.id === id) || {}).name || '?';

function promptText() {
    const s = S, pd = s.pending, myId = socket.id;
    if (s.winner) return `🏆 Победа: ${s.winner}`;
    if (pd) {
        const mine = pd.cur === myId;
        if (pd.type === 'store') return mine ? 'Выберите карту из магазина' : `Из магазина выбирает ${nameOf(pd.cur)}`;
        if (!mine) return `Ждём ответа: ${nameOf(pd.cur)}`;
        if (pd.type === 'bang') return `${nameOf(pd.from)} стреляет в вас! Сыграйте «Мимо!» или примите урон`;
        if (pd.type === 'gatling') return 'Гатлинг! Сыграйте «Мимо!» или примите урон';
        if (pd.type === 'indians') return 'Индейцы! Сбросьте «Бэнг!» или примите урон';
        return 'Дуэль! Сбросьте «Бэнг!» или примите урон';
    }
    if (s.turn !== myId) return `Ходит ${nameOf(s.turn)}`;
    if (s.phase === 'discard') return 'Сбросьте лишние карты: в руке не больше, чем здоровья';
    if (pickFor) return `Что взять у ${pickFor.target.name}?`;
    if (sel) return `Выберите цель для «${sel.name}»`;
    return 'Ваш ход — играйте карты';
}

function cardHTML(c, extra = '') {
    return `<div class="ic">${c.icon}</div><div class="nm">${esc(c.name)}</div><div class="sr">${esc(c.rank)}${c.suit}</div>`;
}

function render() {
    const s = S, myId = socket.id, myTurn = s.turn === myId && !s.pending && s.phase === 'play';

    $('players').innerHTML = s.players.map(p => `
        <div class="seat ${p.alive ? '' : 'dead'} ${p.id === s.turn ? 'turn' : ''} ${p.id === myId ? 'me' : ''} ${sel && validTarget(p) ? 'target' : ''}" data-id="${esc(p.id)}" ${sel && validTarget(p) ? 'tabindex="0"' : ''}>
            <div class="nm">${esc(p.name)}${p.id === myId ? ' (вы)' : ''}</div>
            <div class="role">${p.role ? esc(p.role) : '❓ скрыто'}</div>
            <div>${'❤️'.repeat(p.hp)}${'🖤'.repeat(Math.max(0, p.maxHp - p.hp))}</div>
            <div>🃏 ${p.handCount}${p.dist ? ` · 📏 ${p.dist}` : ''}</div>
            <div class="tbl">${p.table.map(c => `<span title="${esc(c.name)}">${c.icon}</span>`).join('')}</div>
        </div>`).join('');
    document.querySelectorAll('.seat').forEach(el => {
        el.onclick = () => onSeat(el.dataset.id);
        el.onkeydown = e => { if (e.key === 'Enter') onSeat(el.dataset.id); };
    });

    $('prompt').textContent = promptText();
    $('end-btn').hidden = !myTurn;
    $('take-btn').hidden = !(s.pending && s.pending.cur === myId && s.pending.type !== 'store');
    $('again-btn').hidden = !s.winner;

    const store = $('store');
    store.hidden = !(s.pending && s.pending.type === 'store');
    store.innerHTML = '';
    if (!store.hidden) s.pending.cards.forEach(c => {
        const b = document.createElement('button');
        b.className = 'card small ' + c.type;
        b.innerHTML = cardHTML(c);
        b.onclick = () => { if (s.pending.cur === myId) socket.emit('pickStore', { cardId: c.id }); };
        store.appendChild(b);
    });

    const pick = $('pick');
    pick.hidden = !pickFor;
    pick.innerHTML = '';
    if (pickFor) {
        const t = S.players.find(p => p.id === pickFor.target.id);
        if (t.handCount) pick.appendChild(btn(`🃏 Случайная из руки (${t.handCount})`, () => doPick('hand')));
        t.table.forEach(c => pick.appendChild(btn(`${c.icon} ${c.name}`, () => doPick(c.id))));
        pick.appendChild(btn('Отмена', () => { pickFor = null; sel = null; render(); }));
    }

    const hand = $('hand');
    hand.innerHTML = '';
    s.me.hand.forEach(c => {
        const b = document.createElement('button');
        b.className = `card ${c.type} ${sel && sel.id === c.id ? 'sel' : ''}`;
        b.innerHTML = cardHTML(c);
        b.onclick = () => onCard(c);
        hand.appendChild(b);
    });

    $('log').innerHTML = s.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('');
}
