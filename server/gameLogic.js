'use strict';
// Роли по числу игроков (2 — тестовый режим)
const rolesPool = {
    2: ['Шериф', 'Бандит'],
    3: ['Шериф', 'Бандит', 'Ренегат'],
    4: ['Шериф', 'Ренегат', 'Бандит', 'Бандит'],
    5: ['Шериф', 'Помощник', 'Бандит', 'Бандит', 'Ренегат'],
    6: ['Шериф', 'Помощник', 'Бандит', 'Бандит', 'Бандит', 'Ренегат'],
    7: ['Шериф', 'Помощник', 'Помощник', 'Бандит', 'Бандит', 'Бандит', 'Ренегат']
};

// target: кого нужно выбрать — 'range' (в дальности оружия), 'dist1' (расстояние 1), 'any' (любой другой игрок)
const cardTypes = {
    BANG:          { name: 'Бэнг!',       type: 'brown', icon: '🔫', target: 'range' },
    MISSED:        { name: 'Мимо!',       type: 'brown', icon: '🛡️' },
    BEER:          { name: 'Пиво',        type: 'brown', icon: '🍺' },
    CAT_BALOU:     { name: 'Красотка',    type: 'brown', icon: '💃', target: 'any' },
    PANIC:         { name: 'Паника!',     type: 'brown', icon: '🖐️', target: 'dist1' },
    DUEL:          { name: 'Дуэль',       type: 'brown', icon: '⚔️', target: 'any' },
    STAGECOACH:    { name: 'Дилижанс',    type: 'brown', icon: '🐴' },
    INDIANS:       { name: 'Индейцы!',    type: 'brown', icon: '🪶' },
    GENERAL_STORE: { name: 'Магазин',     type: 'brown', icon: '🛒' },
    WELLS_FARGO:   { name: 'Уэллс Фарго', type: 'brown', icon: '📦' },
    GATLING:       { name: 'Гатлинг',     type: 'brown', icon: '💥' },
    SALOON:        { name: 'Салун',       type: 'brown', icon: '🍷' },

    MUSTANG:  { name: 'Мустанг', type: 'blue', icon: '🐎' },
    SCOPE:    { name: 'Прицел',  type: 'blue', icon: '🔭' },
    BARREL:   { name: 'Бочка',   type: 'blue', icon: '🛢️' },
    PRISON:   { name: 'Тюрьма',  type: 'blue', icon: '🔒', target: 'any' },
    DYNAMITE: { name: 'Динамит', type: 'blue', icon: '🧨' },

    VOLCANIC:   { name: 'Волканик',  type: 'blue', action: 'weapon', range: 1, icon: '🌋' },
    SCHOFIELD:  { name: 'Скофилд',   type: 'blue', action: 'weapon', range: 2, icon: '🗡️' },
    REMINGTON:  { name: 'Ремингтон', type: 'blue', action: 'weapon', range: 3, icon: '🎯' },
    CARBINE:    { name: 'Карабин',   type: 'blue', action: 'weapon', range: 4, icon: '🏹' },
    WINCHESTER: { name: 'Винчестер', type: 'blue', action: 'weapon', range: 5, icon: '🦅' }
};

// Классическая колода — ровно 80 карт
const deckList = [
    ['BANG', 25], ['MISSED', 12], ['BEER', 6], ['CAT_BALOU', 4], ['PANIC', 4], ['DUEL', 3],
    ['STAGECOACH', 2], ['INDIANS', 2], ['GENERAL_STORE', 2], ['WELLS_FARGO', 1], ['GATLING', 1], ['SALOON', 1],
    ['MUSTANG', 2], ['SCOPE', 1], ['BARREL', 2], ['PRISON', 3], ['DYNAMITE', 1],
    ['VOLCANIC', 2], ['SCHOFIELD', 3], ['REMINGTON', 1], ['CARBINE', 1], ['WINCHESTER', 1]
];

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Фишер-Йетс — равномерное перемешивание
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function createDeck() {
    const deck = [];
    let n = 0;
    for (const [key, count] of deckList) {
        for (let i = 0; i < count; i++) {
            deck.push({ id: 'c' + n++, key, ...cardTypes[key], suit: pick(SUITS), rank: pick(RANKS) });
        }
    }
    return shuffle(deck);
}

// Динамит взрывается на пиках 2–9
const isExplosion = c => c.suit === '♠' && ['2', '3', '4', '5', '6', '7', '8', '9'].includes(c.rank);

module.exports = { rolesPool, cardTypes, createDeck, shuffle, isExplosion };
