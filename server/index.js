'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { Game } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MIN_PLAYERS = 2;          // для настоящей игры поставьте 4
const MAX_PLAYERS = 7;
const BOT_DELAY = 15000;        // через сколько мс автопилот ходит за отключившегося
const TTL = 10 * 60 * 1000;     // сколько хранить отключившегося игрока и пустую комнату
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const sessions = new Map();     // токен браузера -> сессия игрока
const byPid = new Map();        // публичный id игрока -> сессия
const rooms = new Map();        // код -> комната {code, members, game, timer, idleSince}

app.use(express.static(path.join(__dirname, '../public')));

// ---------- рассылка ----------
const online = pid => { const s = byPid.get(pid); return !!(s && s.connected); };
const emitTo = (pid, ev, data) => { const s = byPid.get(pid); if (s && s.sid) io.to(s.sid).emit(ev, data); };
const hostOf = r => (r.members.find(m => online(m.id)) || r.members[0] || {}).id;

function roomInfo(r) {
    return {
        code: r.code, host: hostOf(r), inGame: !!r.game, min: MIN_PLAYERS, max: MAX_PLAYERS,
        members: r.members.map(m => ({ id: m.id, name: m.name, online: online(m.id) }))
    };
}
function sendTo(r, pid) {
    emitTo(pid, 'room', roomInfo(r));
    if (r.game && r.game.byId(pid)) emitTo(pid, 'state', r.game.viewFor(pid));
}
const sendRoom = r => r.members.forEach(m => sendTo(r, m.id));
const sendStates = r => r.game && r.game.players.forEach(p => emitTo(p.id, 'state', r.game.viewFor(p.id)));

function removeMember(r, pid) {
    r.members = r.members.filter(m => m.id !== pid);
    const s = byPid.get(pid); if (s) s.room = null;
    if (!r.members.length) { clearTimeout(r.timer); rooms.delete(r.code); } else sendRoom(r);
}

// ---------- автопилот за отключившегося игрока ----------
function autoStep(g) {
    const pd = g.pending;
    if (pd) return pd.type === 'store' ? g.pickStore(pd.cur, pd.cards[0].id) : g.respond(pd.cur, null);
    const p = g.cur;
    return g.phase === 'discard' ? g.discardCard(p.id, p.hand[0].id) : g.endTurn(p.id);
}
function schedule(r) {
    clearTimeout(r.timer);
    const g = r.game;
    if (!g || g.winner) return;
    if (online(g.pending ? g.pending.cur : g.cur.id)) return;
    r.timer = setTimeout(() => {
        if (r.game !== g || g.winner) return;
        try { autoStep(g); } catch (e) { console.error(e); }
        sendStates(r);
        schedule(r);
    }, BOT_DELAY);
}

// ---------- соединения ----------
io.on('connection', socket => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return socket.disconnect(true);

    const me = () => sessions.get(token);
    const err = m => socket.emit('errorMsg', m);

    const s0 = me();
    if (s0) {
        s0.sid = socket.id; s0.connected = true;
        socket.emit('session', { pid: s0.pid, name: s0.name });
        const r = rooms.get(s0.room);
        if (r) { sendRoom(r); schedule(r); } else s0.room = null;
    } else socket.emit('noSession');

    socket.on('setName', name => {
        name = String(name || '').trim().slice(0, 16);
        if (!name) return err('Введите имя');
        let s = me();
        if (!s) {
            s = { token, pid: crypto.randomBytes(6).toString('hex'), name, sid: socket.id, connected: true, room: null, lastSeen: Date.now() };
            sessions.set(token, s); byPid.set(s.pid, s);
        } else if (!s.room) s.name = name;
        socket.emit('session', { pid: s.pid, name: s.name });
    });

    socket.on('createRoom', () => {
        const s = me(); if (!s || s.room) return;
        let code;
        do { code = Array.from({ length: 4 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); } while (rooms.has(code));
        const r = { code, members: [{ id: s.pid, name: s.name }], game: null, timer: null, idleSince: null };
        rooms.set(code, r); s.room = code;
        sendRoom(r);
    });

    socket.on('joinRoom', code => {
        const s = me(); if (!s || s.room) return;
        const r = rooms.get(String(code || '').trim().toUpperCase());
        if (!r) return err('Комната не найдена');
        if (r.game) return err('В этой комнате уже идёт партия');
        if (r.members.length >= MAX_PLAYERS) return err('В комнате нет мест');
        r.members.push({ id: s.pid, name: s.name }); s.room = r.code;
        sendRoom(r);
    });

    socket.on('leaveRoom', () => {
        const s = me(), r = s && rooms.get(s.room);
        if (!r || (r.game && !r.game.winner)) return;
        removeMember(r, s.pid);
        socket.emit('left');
    });

    socket.on('requestStartGame', () => {
        const s = me(), r = s && rooms.get(s.room);
        if (!r || r.game || hostOf(r) !== s.pid) return;
        const list = r.members.filter(m => online(m.id));
        if (list.length < MIN_PLAYERS) return err(`Нужно минимум ${MIN_PLAYERS} игрока онлайн`);
        r.members.filter(m => !online(m.id)).forEach(m => { const x = byPid.get(m.id); if (x) x.room = null; });
        r.members = list;
        r.game = new Game(list);
        sendRoom(r); schedule(r);
    });

    socket.on('backToLobby', () => {
        const s = me(), r = s && rooms.get(s.room);
        if (!r || !r.game || !r.game.winner) return;
        r.game = null; clearTimeout(r.timer);
        sendRoom(r);
    });

    // Игровые действия
    const act = fn => data => {
        const s = me(), r = s && rooms.get(s.room);
        if (!r || !r.game) return;
        try {
            const res = fn(r.game, s.pid, data && typeof data === 'object' ? data : {});
            if (res && !res.ok) err(res.err);
        } catch (e) { console.error(e); err('Ошибка сервера'); }
        sendStates(r); schedule(r);
    };
    socket.on('playCard',    act((g, id, d) => g.play(id, d.cardId, d.targetId, d.pick)));
    socket.on('respond',     act((g, id, d) => g.respond(id, d.cardId || null)));
    socket.on('pickStore',   act((g, id, d) => g.pickStore(id, d.cardId)));
    socket.on('endTurn',     act((g, id) => g.endTurn(id)));
    socket.on('discardCard', act((g, id, d) => g.discardCard(id, d.cardId)));

    socket.on('disconnect', () => {
        const s = me();
        if (!s || s.sid !== socket.id) return;   // уже переподключился с другой вкладки
        s.connected = false; s.lastSeen = Date.now();
        const r = rooms.get(s.room);
        if (r) { sendRoom(r); schedule(r); }
    });
});

// Уборка: пустые комнаты и давно ушедшие игроки
setInterval(() => {
    const now = Date.now();
    rooms.forEach(r => {
        if (!r.game) r.members
            .filter(m => { const s = byPid.get(m.id); return !s || (!s.connected && now - s.lastSeen > TTL); })
            .forEach(m => removeMember(r, m.id));
        if (!rooms.has(r.code)) return;
        if (r.members.some(m => online(m.id))) r.idleSince = null;
        else if (!r.idleSince) r.idleSince = now;
        else if (now - r.idleSince > TTL) {
            clearTimeout(r.timer);
            r.members.forEach(m => { const s = byPid.get(m.id); if (s) s.room = null; });
            rooms.delete(r.code);
        }
    });
    sessions.forEach((s, t) => {
        if (!s.connected && !s.room && now - s.lastSeen > TTL) { sessions.delete(t); byPid.delete(s.pid); }
    });
}, 60000).unref();

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));
