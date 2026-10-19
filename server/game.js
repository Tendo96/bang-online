'use strict';
const { rolesPool, createDeck, shuffle, isExplosion } = require('./gameLogic');
const { CHARACTERS, CHAR } = require('./characters');

const ok = { ok: true };
const fail = err => ({ ok: false, err });

class Game {
    constructor(list) {
        this.deck = createDeck();
        this.discard = [];
        this.logLines = [];
        this.pending = null;   // ожидание ответа: bang | gatling | indians | duel | store
        this.phase = 'play';   // play | discard | over
        this.winner = null;
        this.bangUsed = false;

        const roles = shuffle([...rolesPool[list.length]]);
        const chars = shuffle([...CHARACTERS]);
        this.players = list.map((p, i) => {
            const maxHp = chars[i].hp + (roles[i] === 'Шериф' ? 1 : 0);
            return { id: p.id, name: p.name, role: roles[i], char: chars[i].key, hp: maxHp, maxHp, hand: [], table: [], alive: true };
        });
        this.players.forEach(p => p.hand.push(...this.draw(p.hp)));
        this.turn = this.players.findIndex(p => p.role === 'Шериф');
        this.startTurn();
    }

    // ---------- вспомогательные ----------
    get cur() { return this.players[this.turn]; }
    byId(id) { return this.players.find(p => p.id === id); }
    alive() { return this.players.filter(p => p.alive); }
    say(t) { this.logLines.push(t); if (this.logLines.length > 40) this.logLines.shift(); }
    has(p, key) { return p.table.some(c => c.key === key); }
    drop(c) { this.discard.push(c); }

    draw(n) {
        const out = [];
        while (n-- > 0) {
            if (!this.deck.length) { this.deck = shuffle(this.discard); this.discard = []; }
            if (!this.deck.length) break;
            out.push(this.deck.pop());
        }
        return out;
    }

    // «Вскрыть» верхнюю карту колоды (draw!)
    flip() {
        const c = this.draw(1)[0];
        if (!c) return { rank: '?', suit: '' };
        this.discard.push(c);
        return c;
    }

    others(p) {
        const n = this.players.length, i = this.players.indexOf(p), out = [];
        for (let k = 1; k < n; k++) { const q = this.players[(i + k) % n]; if (q.alive) out.push(q); }
        return out;
    }
    nextAlive(p) { return this.others(p)[0] || p; }

    range(p) { const w = p.table.find(c => c.action === 'weapon'); return w ? w.range : 1; }

    dist(a, b) {
        const al = this.alive(), i = al.indexOf(a), j = al.indexOf(b);
        const d = Math.abs(i - j);
        let r = Math.min(d, al.length - d);
        if (this.has(b, 'MUSTANG')) r++;
        if (b.char === 'PAUL') r++;
        if (this.has(a, 'SCOPE')) r--;
        if (a.char === 'ROSE') r--;
        return Math.max(1, r);
    }

    // Сколько «промахов» дала бочка (и встроенная бочка Журдонне); останавливается, когда набрано need
    tryBarrel(t, need = 1) {
        const tries = (this.has(t, 'BARREL') ? 1 : 0) + (t.char === 'JOURDONNAIS' ? 1 : 0);
        let hits = 0;
        for (let i = 0; i < tries && hits < need; i++) {
            const f = this.flip(), hit = f.suit === '♥';
            this.say(`${t.name} проверяет бочку: ${f.rank}${f.suit} — ${hit ? 'выстрел мимо!' : 'не повезло'}`);
            if (hit) hits++;
        }
        return hits;
    }

    // Сьюзи Лафайетт берёт карту, как только рука опустела
    suzy() {
        this.alive().forEach(p => {
            if (p.char === 'SUZY' && !p.hand.length) {
                p.hand.push(...this.draw(1));
                this.say(`${p.name} берёт карту — рука опустела`);
            }
        });
    }

    // ---------- ход ----------
    startTurn() {
        const p = this.cur;
        this.bangUsed = false;
        this.phase = 'play';
        this.say(`— Ход игрока ${p.name} —`);

        const dyn = p.table.find(c => c.key === 'DYNAMITE');
        if (dyn) {
            const f = this.flip();
            p.table.splice(p.table.indexOf(dyn), 1);
            this.say(`${p.name} проверяет динамит: ${f.rank}${f.suit}`);
            if (isExplosion(f)) {
                this.drop(dyn);
                this.say('💥 Динамит взорвался! −3 ❤️');
                this.damage(p, 3, null);
                if (this.winner) return;
                if (!p.alive) return this.nextTurn();
            } else {
                this.nextAlive(p).table.push(dyn);
                this.say('Динамит переходит к следующему игроку');
            }
        }

        const prison = p.table.find(c => c.key === 'PRISON');
        if (prison) {
            p.table.splice(p.table.indexOf(prison), 1);
            this.drop(prison);
            const f = this.flip();
            if (f.suit === '♥') this.say(`${p.name} выходит из тюрьмы (${f.rank}${f.suit})`);
            else { this.say(`${p.name} остаётся в тюрьме (${f.rank}${f.suit}) и пропускает ход`); return this.nextTurn(); }
        }

        const cards = this.draw(2);
        p.hand.push(...cards);
        if (p.char === 'BLACKJACK' && cards[1]) {
            this.say(`${p.name} показывает вторую карту: ${cards[1].rank}${cards[1].suit}`);
            if (cards[1].suit === '♥' || cards[1].suit === '♦') p.hand.push(...this.draw(1));
        }
    }

    nextTurn() {
        if (this.winner) return;
        this.turn = this.players.indexOf(this.nextAlive(this.cur));
        this.startTurn();
    }

    afterResolve() {
        if (this.winner) return;
        if (!this.cur.alive) this.nextTurn();
    }

    // ---------- урон и смерть ----------
    damage(p, n, src) {
        p.hp -= n;
        // Автоматически пьём пиво, если оно спасает от смерти (пока в игре больше двух)
        while (p.hp <= 0 && this.alive().length > 2) {
            const b = p.hand.find(c => c.key === 'BEER');
            if (!b) break;
            p.hand.splice(p.hand.indexOf(b), 1);
            this.drop(b);
            p.hp++;
            this.say(`${p.name} выпивает пиво и остаётся в игре 🍺`);
        }
        if (p.hp <= 0) this.kill(p, src);
        else {
            if (p.char === 'BART') {
                p.hand.push(...this.draw(n));
                this.say(`${p.name} берёт ${n} карт за полученный урон`);
            }
            if (p.char === 'GRINGO' && src && src !== p) {
                for (let i = 0; i < n && src.hand.length; i++) {
                    p.hand.push(src.hand.splice(Math.floor(Math.random() * src.hand.length), 1)[0]);
                    this.say(`${p.name} забирает карту у ${src.name}`);
                }
            }
        }
        this.suzy();
    }

    kill(p, src) {
        p.alive = false;
        p.hp = 0;
        this.say(`💀 ${p.name} выбывает. Роль: ${p.role}`);
        const sam = this.alive().find(x => x.char === 'SAM');
        if (sam) {
            sam.hand.push(...p.hand, ...p.table);
            this.say(`${sam.name} забирает все карты выбывшего`);
        } else this.discard.push(...p.hand, ...p.table);
        p.hand = []; p.table = [];
        if (src && src !== p && src.alive) {
            if (p.role === 'Бандит') {
                src.hand.push(...this.draw(3));
                this.say(`${src.name} берёт 3 карты за бандита`);
            } else if (p.role === 'Помощник' && src.role === 'Шериф') {
                this.discard.push(...src.hand, ...src.table);
                src.hand = []; src.table = [];
                this.say('Шериф убил помощника и сбрасывает все карты');
            }
        }
        this.checkWin();
    }

    checkWin() {
        const al = this.alive();
        const sheriff = this.players.find(p => p.role === 'Шериф');
        if (!sheriff.alive) this.winner = (al.length === 1 && al[0].role === 'Ренегат') ? 'Ренегат' : 'Бандиты';
        else if (!al.some(p => p.role === 'Бандит' || p.role === 'Ренегат')) this.winner = 'Шериф и Помощники';
        if (this.winner) {
            this.pending = null;
            this.phase = 'over';
            this.say(`🏆 Победа: ${this.winner}`);
        }
    }

    // ---------- розыгрыш карт ----------
    play(pid, cardId, targetId, pickId) {
        if (this.winner) return fail('Игра окончена');
        if (this.pending) return fail('Сначала нужно завершить текущее действие');
        const p = this.cur;
        if (p.id !== pid || this.phase !== 'play') return fail('Сейчас не ваш ход');
        const c = p.hand.find(x => x.id === cardId);
        if (!c) return fail('Нет такой карты');

        // Каламити Джанет играет «Мимо!» как «Бэнг!»
        const k = (c.key === 'MISSED' && p.char === 'CALAMITY') ? 'BANG' : c.key;
        const needTarget = k === 'BANG' ? 'range' : c.target;
        const t = targetId ? this.byId(targetId) : null;
        if (needTarget && (!t || !t.alive || t === p)) return fail('Выберите цель');
        const take = () => { p.hand.splice(p.hand.indexOf(c), 1); };

        switch (k) {
            case 'MISSED':
                return fail('«Мимо!» играется только в ответ на выстрел');

            case 'BANG': {
                if (this.bangUsed && !this.has(p, 'VOLCANIC') && p.char !== 'WILLY') return fail('Только один «Бэнг!» за ход');
                if (this.dist(p, t) > this.range(p)) return fail('Цель вне дальности');
                take(); this.drop(c); this.bangUsed = true;
                this.say(`${p.name} стреляет в ${t.name}`);
                const need = p.char === 'SLAB' ? 2 : 1;
                const left = need - this.tryBarrel(t, need);
                if (left > 0) this.pending = { type: 'bang', from: p.id, cur: t.id, needs: left };
                break;
            }

            case 'BEER':
                if (this.alive().length <= 2) return fail('Пиво не действует, когда осталось двое');
                if (p.hp >= p.maxHp) return fail('Здоровье уже полное');
                take(); this.drop(c); p.hp++;
                this.say(`${p.name} пьёт пиво 🍺`);
                break;

            case 'SALOON':
                take(); this.drop(c);
                this.alive().forEach(a => { a.hp = Math.min(a.maxHp, a.hp + 1); });
                this.say(`${p.name} угощает всех в салуне — все лечатся`);
                break;

            case 'STAGECOACH':
            case 'WELLS_FARGO': {
                const n = k === 'STAGECOACH' ? 2 : 3;
                take(); this.drop(c); p.hand.push(...this.draw(n));
                this.say(`${p.name} берёт ${n} карты (${c.name})`);
                break;
            }

            case 'CAT_BALOU':
            case 'PANIC': {
                if (k === 'PANIC' && this.dist(p, t) > 1) return fail('«Паника!» работает только на расстоянии 1');
                if (pickId === 'hand') { if (!t.hand.length) return fail('У цели нет карт в руке'); }
                else if (!t.table.some(x => x.id === pickId)) return fail('Выберите карту');
                take(); this.drop(c);
                const src = pickId === 'hand' ? t.hand : t.table;
                const idx = pickId === 'hand' ? Math.floor(Math.random() * src.length) : src.findIndex(x => x.id === pickId);
                const card = src.splice(idx, 1)[0];
                if (k === 'PANIC') {
                    p.hand.push(card);
                    this.say(`${p.name} забирает карту у ${t.name}`);
                } else {
                    this.drop(card);
                    this.say(`${p.name} заставляет ${t.name} сбросить: ${card.name}`);
                }
                break;
            }

            case 'DUEL':
                take(); this.drop(c);
                this.say(`${p.name} вызывает ${t.name} на дуэль!`);
                this.pending = { type: 'duel', from: p.id, target: t.id, cur: t.id };
                break;

            case 'INDIANS':
            case 'GATLING':
                take(); this.drop(c);
                this.say(`${p.name}: ${c.name}`);
                this.pending = { type: k === 'INDIANS' ? 'indians' : 'gatling', from: p.id, cur: null, queue: this.others(p).map(x => x.id) };
                this.nextInQueue();
                break;

            case 'GENERAL_STORE': {
                take(); this.drop(c);
                const order = [p, ...this.others(p)];
                this.pending = { type: 'store', from: p.id, cards: this.draw(order.length), queue: order.map(x => x.id), cur: p.id };
                this.say(`${p.name} открывает магазин — все выбирают по карте`);
                break;
            }

            case 'PRISON':
                if (t.role === 'Шериф') return fail('Шерифа нельзя посадить в тюрьму');
                if (this.has(t, 'PRISON')) return fail('Игрок уже в тюрьме');
                take(); t.table.push(c);
                this.say(`${p.name} сажает ${t.name} в тюрьму 🔒`);
                break;

            default: // оружие, Мустанг, Прицел, Бочка, Динамит
                if (c.action === 'weapon') {
                    const old = p.table.find(x => x.action === 'weapon');
                    if (old) { p.table.splice(p.table.indexOf(old), 1); this.drop(old); }
                } else if (this.has(p, c.key)) return fail('Такая карта уже лежит перед вами');
                take(); p.table.push(c);
                this.say(`${p.name} выкладывает: ${c.name}`);
        }
        this.suzy();
        return ok;
    }

    // Следующая цель для «Гатлинг» / «Индейцы»
    nextInQueue() {
        const pd = this.pending;
        if (this.winner || !pd) return;
        while (pd.queue.length) {
            const t = this.byId(pd.queue.shift());
            if (!t.alive) continue;
            if (pd.type === 'gatling' && this.tryBarrel(t)) continue;
            pd.cur = t.id;
            return;
        }
        this.pending = null;
        this.afterResolve();
    }

    // Ответ на выстрел / индейцев / дуэль: карта или отказ (cardId = null)
    respond(pid, cardId) {
        const pd = this.pending;
        if (!pd || pd.type === 'store' || pd.cur !== pid) return fail('Сейчас от вас не требуется ответ');
        const p = this.byId(pid);
        const need = (pd.type === 'bang' || pd.type === 'gatling') ? 'MISSED' : 'BANG';
        const allowed = p.char === 'CALAMITY' ? ['MISSED', 'BANG'] : [need];

        if (cardId) {
            const c = p.hand.find(x => x.id === cardId);
            if (!c || !allowed.includes(c.key)) return fail('Эта карта не подходит');
            p.hand.splice(p.hand.indexOf(c), 1);
            this.drop(c);
            this.say(`${p.name} отвечает: ${c.name}`);
            if (pd.type === 'duel') pd.cur = pd.cur === pd.from ? pd.target : pd.from;
            else if (pd.type === 'bang') { pd.needs = (pd.needs || 1) - 1; if (pd.needs <= 0) this.pending = null; }
            else this.nextInQueue();
            this.suzy();
            return ok;
        }

        const src = pd.type === 'duel' ? this.byId(pd.cur === pd.from ? pd.target : pd.from) : this.byId(pd.from);
        this.say(`${p.name} получает урон −1 ❤️`);
        this.damage(p, 1, src);
        if (pd.type === 'gatling' || pd.type === 'indians') this.nextInQueue();
        else { this.pending = null; this.afterResolve(); }
        return ok;
    }

    pickStore(pid, cardId) {
        const pd = this.pending;
        if (!pd || pd.type !== 'store' || pd.cur !== pid) return fail('Сейчас не ваш выбор');
        const i = pd.cards.findIndex(c => c.id === cardId);
        if (i < 0) return fail('Нет такой карты');
        const p = this.byId(pid);
        const card = pd.cards.splice(i, 1)[0];
        p.hand.push(card);
        this.say(`${p.name} берёт из магазина: ${card.name}`);
        pd.queue.shift();
        if (!pd.queue.length || !pd.cards.length) { this.discard.push(...pd.cards); this.pending = null; }
        else pd.cur = pd.queue[0];
        return ok;
    }

    endTurn(pid) {
        if (this.winner) return fail('Игра окончена');
        const p = this.cur;
        if (this.pending || p.id !== pid || this.phase !== 'play') return fail('Сейчас нельзя завершить ход');
        if (p.hand.length > p.hp) { this.phase = 'discard'; return ok; }
        this.nextTurn();
        return ok;
    }

    discardCard(pid, cardId) {
        const p = this.cur;
        if (p.id !== pid || this.phase !== 'discard') return fail('Сейчас не нужно сбрасывать карты');
        const i = p.hand.findIndex(c => c.id === cardId);
        if (i < 0) return fail('Нет такой карты');
        this.drop(p.hand.splice(i, 1)[0]);
        if (p.hand.length <= p.hp) this.nextTurn();
        return ok;
    }

    // ---------- что видит конкретный игрок ----------
    viewFor(pid) {
        const me = this.byId(pid);
        const pd = this.pending;
        const need = !pd || pd.type === 'store' ? null : (pd.type === 'bang' || pd.type === 'gatling') ? 'MISSED' : 'BANG';

        // Каламити Джанет: клиент видит «Бэнг!» и «Мимо!» так, как их сейчас можно сыграть
        let hand = me.hand;
        if (me.char === 'CALAMITY') {
            hand = hand.map(c => {
                if (c.key !== 'MISSED' && c.key !== 'BANG') return c;
                if (pd && pd.cur === pid && need) return { ...c, key: need };
                if (!pd && c.key === 'MISSED') return { ...c, key: 'BANG', target: 'range' };
                return c;
            });
        }

        return {
            me: { id: me.id, hand },
            players: this.players.map(p => ({
                id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
                char: { name: CHAR[p.char].name, desc: CHAR[p.char].desc },
                handCount: p.hand.length, table: p.table,
                // Роли скрыты, кроме шерифа, своей, мёртвых и конца игры
                role: (p.role === 'Шериф' || p.id === pid || !p.alive || this.winner) ? p.role : null,
                dist: (me.alive && p.alive && p !== me) ? this.dist(me, p) : null
            })),
            range: this.range(me),
            turn: this.cur.id,
            phase: this.phase,
            bangUsed: this.bangUsed,
            deckCount: this.deck.length,
            winner: this.winner,
            log: this.logLines,
            pending: pd && {
                type: pd.type, from: pd.from, cur: pd.cur, target: pd.target || null, need, needs: pd.needs || 1,
                cards: pd.type === 'store' ? pd.cards : undefined
            }
        };
    }
}

module.exports = { Game };
