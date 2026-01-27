const express = require('express');
const http = require('http');
const { Server } =require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

function shuffle(array){
    return array.sort(() => Math.random - 0.5);
}
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

    socket.on('requestStartGame', () =>{
        if(players.length<2){ 
            console.log('Недостаточно игроков для старта')   
            return;
        }

        let rolesPool = [];
        if(players.length === 2) rolesPool = ['Sheriff', 'Outlaw'];
        if(players.length === 3) rolesPool = ['Sheriff', 'Outlaw', 'Renegade'];
        if(players.length === 4) rolesPool = ['Sheriff', 'Outlaw', 'Outlaw', 'Renegade'];
        if(players.length === 5) rolesPool = ['Sheriff', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy'];
        if(players.length === 6) rolesPool = ['Sheriff', 'Outlaw', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy'];
        if(players.length === 7) rolesPool = ['Sheriff', 'Outlaw', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy', 'Deputy'];

        
        const shuffledRoles = shuffle([...rolesPool]);

        players.forEach((player, index) =>{
            player.role =shuffledRoles[index];
            player.hp = (player.role == 'Sheriff')?5:4;

            io.to(player.id).emit('gameStarted', {
                role: player.role,
                hp: player.hp
            });
        });
        console.log('Игра началась! Роли распределены.')
    });
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});