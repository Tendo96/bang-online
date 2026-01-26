const express = require('express');
const http = require('http');
const { Server } =require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

let players = [];

io.on('connection', (socket) => {
    console.log('Новое соединение:', socket.id);

    socket.on('joinGame', (username) => {
        const newPlayer ={
            id: socket.id,
            name: username,
            ready: false,
            role: null
        };
        players.push(newPlayer);

        io.emit('updatePlayerList', players);
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('updatePlayerList', players);
        
        console.log('Игрок ушел');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log('Сервер запущен на http://localhost:${PORT}');
});