'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Game } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MIN_PLAYERS = 2; // для настоящей игры поставьте 4
const MAX_PLAYERS = 7;

let lobby = [];   // [{id, name}] — игроки до начала партии
let game = null;

app.use(express.static(path.join(__dirname, '../public')));

const lobbyInfo = () => ({ players: lobby, inGame: !!game, min: MIN_PLAYERS, max: MAX_PLAYERS });
const sendStates = () => game && game.players.forEach(p => io.to(p.id).emit('state', game.viewFor(p.id)));

io.on('connection', socket => {
    socket.emit('lobby', lobbyInfo());

    socket.on('joinGame', name => {
        name = String(name || '').trim().slice(0, 16);
        if (!name) return socket.emit('errorMsg', 'Введите имя');
        if (game) return socket.emit('errorMsg', 'Игра уже идёт');
        if (lobby.length >= MAX_PLAYERS) return socket.emit('errorMsg', 'В салуне нет мест');
        if (lobby.some(p => p.id === socket.id)) return;
        lobby.push({ id: socket.id, name });
        io.emit('lobby', lobbyInfo());
    });

    socket.on('requestStartGame', () => {
        if (game || !lobby.length || lobby[0].id !== socket.id) return;
        if (lobby.length < MIN_PLAYERS) return socket.emit('errorMsg', `Нужно минимум ${MIN_PLAYERS} игрока`);
        game = new Game(lobby);
        lobby = [];
        io.emit('lobby', lobbyInfo());
        sendStates();
    });

    socket.on('backToLobby', () => {
        if (!game || !game.winner) return;
        lobby = game.players.filter(p => io.sockets.sockets.has(p.id)).map(p => ({ id: p.id, name: p.name }));
        game = null;
        lobby.forEach(p => io.to(p.id).emit('toLobby'));
        io.emit('lobby', lobbyInfo());
    });

    // Обёртка для игровых действий: защита от кривых данных и ошибок
    const act = fn => data => {
        if (!game) return;
        try {
            const r = fn(data && typeof data === 'object' ? data : {});
            if (r && !r.ok) socket.emit('errorMsg', r.err);
        } catch (e) {
            console.error(e);
            socket.emit('errorMsg', 'Ошибка сервера');
        }
        sendStates();
    };
    socket.on('playCard',    act(d => game.play(socket.id, d.cardId, d.targetId, d.pick)));
    socket.on('respond',     act(d => game.respond(socket.id, d.cardId || null)));
    socket.on('pickStore',   act(d => game.pickStore(socket.id, d.cardId)));
    socket.on('endTurn',     act(() => game.endTurn(socket.id)));
    socket.on('discardCard', act(d => game.discardCard(socket.id, d.cardId)));

    socket.on('disconnect', () => {
        lobby = lobby.filter(p => p.id !== socket.id);
        if (game && game.byId(socket.id)) {
            // Игрок вышел посреди партии — партия прерывается, остальные возвращаются в лобби
            lobby = game.players.filter(p => p.id !== socket.id && io.sockets.sockets.has(p.id)).map(p => ({ id: p.id, name: p.name }));
            game = null;
            lobby.forEach(p => { io.to(p.id).emit('toLobby'); io.to(p.id).emit('errorMsg', 'Игрок вышел — партия прервана'); });
        }
        io.emit('lobby', lobbyInfo());
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));
