const initialDeck = [
    { name: 'Bang!', type: 'attack', icon: '🔫' },
    { name: 'Bang!', type: 'attack', icon: '🔫' },
    { name: 'Bang!', type: 'attack', icon: '🔫' },
    { name: 'Mised!', type: 'defense', icon: '🛡️' },
    { name: 'Mised!', type: 'defense', icon: '🛡️' },
    { name: 'Beer', type: 'heal', icon: '🍺' },
    // Позже добавим еще 20-30 карт
];

function createDeck() {
    let deck = [];
    // Для теста создадим по 10 копий каждой карты
    for (let i = 0; i < 10; i++) {
        deck.push(...initialDeck);
    }
    return deck;
}

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}

module.exports = { createDeck, shuffle };