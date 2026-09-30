'use strict';
/*
 * RewardSystem, XPSystem, InventorySystem, ShopSystem.
 * Rewards grow sub-linearly with the stage (stage^0.7) so late stages pay more without exploding;
 * bosses and elites pay multipliers, win streaks add a bonus. Levels never add raw stats:
 * they unlock shop items, pay coins and grant cosmetics, so skill stays more important than level.
 */
(function (SA) {
  const B = SA.BALANCE;

  const Rewards = {
    streakBonus(streak) {
      for (const [n, b] of B.rewards.streak) if (streak >= n) return b;
      return 0;
    },
    // baseReward x stageScaling x kind multiplier x difficulty multiplier (+ streak / perfect bonus)
    forStage(stage, kind, opts) {
      opts = opts || {};
      const R = B.rewards;
      const diff = B.arena.rewardMul[opts.difficulty || 'normal'] || 1;
      let kindMul = 1;
      if (kind === 'elite') kindMul = R.eliteMul;
      if (kind === 'boss') kindMul = (R.bossMulBase + R.bossMulPerStage * stage) * (opts.great ? R.greatBossMul : 1);
      const baseCoins = R.coinBase * Math.pow(stage, R.coinExp) * kindMul * diff;
      const baseXp = R.xpBase * Math.pow(stage, R.xpExp) * kindMul * diff;
      const streak = this.streakBonus(opts.streak || 0);
      const perfect = opts.perfect ? R.perfectBonus : 0;
      const mul = 1 + streak + perfect;
      return {
        coins: Math.round(baseCoins * mul),
        xp: Math.round(baseXp * mul),
        baseCoins: Math.round(baseCoins),
        baseXp: Math.round(baseXp),
        streakBonus: streak,
        perfectBonus: perfect,
      };
    },
  };

  const Progression = {
    get data() { return SA.Save.data.player; },
    xpToNext(level) { return Math.round(B.xp.base * Math.pow(level, B.xp.exp)); },
    addCoins(n) {
      const p = this.data;
      p.coins += n;
      if (n > 0) p.lifetimeCoins += n;
    },
    // returns [{level, coins, unlocks:[names]}] for each level gained
    addXp(n) {
      const p = this.data;
      const ups = [];
      p.xp += n;
      while (p.level < B.xp.maxLevel && p.xp >= this.xpToNext(p.level)) {
        p.xp -= this.xpToNext(p.level);
        p.level++;
        const coins = B.xp.levelCoins[0] + B.xp.levelCoins[1] * p.level;
        this.addCoins(coins);
        const unlocks = Shop.all().filter((id) => SA.Items.get(id).levelRequired === p.level).map((id) => SA.Items.get(id).name);
        ups.push({ level: p.level, coins, unlocks });
      }
      return ups;
    },
    progress() {
      const p = this.data;
      return { level: p.level, xp: p.xp, need: this.xpToNext(p.level), frac: p.xp / this.xpToNext(p.level) };
    },
  };

  const CATEGORIES = ['weapons', 'throwables', 'firearms', 'specials', 'cosmetics'];
  const SLOT_OF = { weapons: 'primary', throwables: 'ranged', firearms: 'ranged', specials: 'special', cosmetics: 'cosmetic' };

  const Shop = {
    CATEGORIES,
    all() {
      const out = [];
      for (const c of CATEGORIES) out.push(...this.items(c));
      return out;
    },
    items(cat) {
      let src;
      if (cat === 'weapons') src = SA.WEAPONS;
      else if (cat === 'throwables') src = Object.fromEntries(Object.entries(SA.RANGED).filter(([, r]) => r.type === 'throwable'));
      else if (cat === 'firearms') src = Object.fromEntries(Object.entries(SA.RANGED).filter(([, r]) => r.type === 'firearm'));
      else if (cat === 'specials') src = SA.SPECIAL_ITEMS;
      else src = SA.COSMETICS;
      return Object.keys(src).filter((id) => !src[id].hidden)
        .sort((a, b) => src[a].levelRequired - src[b].levelRequired || src[a].price - src[b].price);
    },
    slotOf(id) { return SLOT_OF[SA.Items.category(id)]; },
    isEquipped(id) {
      const eq = SA.Save.data.inventory.equipped;
      return eq[this.slotOf(id)] === id;
    },
    status(id) {
      const it = SA.Items.get(id), p = SA.Save.data.player;
      if (SA.Save.owns(id)) return this.isEquipped(id) ? 'equipped' : 'owned';
      if (p.level < it.levelRequired) return 'locked';
      if (p.coins < it.price) return 'poor';
      return 'buyable';
    },
    // -> { ok, reason }
    buy(id) {
      const it = SA.Items.get(id);
      if (!it) return { ok: false, reason: 'unknown' };
      const st = this.status(id);
      if (st === 'owned' || st === 'equipped') return { ok: false, reason: 'owned' };
      if (st === 'locked') return { ok: false, reason: 'level' };
      if (st === 'poor') return { ok: false, reason: 'coins' };
      SA.Save.data.player.coins -= it.price;
      SA.Save.grant(id);
      const extra = [];
      // a weapon's signature special comes with it
      if (it.special && SA.Save.grant(it.special)) extra.push(SA.SPECIAL_ITEMS[it.special].name);
      SA.Save.save();
      return { ok: true, extra };
    },
    equip(id) {
      if (!SA.Save.owns(id)) return false;
      const slot = this.slotOf(id);
      SA.Save.data.inventory.equipped[slot] = id;
      SA.Save.save();
      return true;
    },
    unequipRanged() {
      SA.Save.data.inventory.equipped.ranged = null;
      SA.Save.save();
    },
    owned(cat) { return this.items(cat).filter((id) => SA.Save.owns(id)); },
  };

  SA.Rewards = Rewards;
  SA.Progression = Progression;
  SA.Shop = Shop;
})(window.SA);
