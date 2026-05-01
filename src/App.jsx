import { useState, useReducer, useCallback, useMemo, useEffect, useRef } from "react";
import {
  CARD_RARITY, CARD_POOL, SUPPORT_CARDS, TOKEN_ICEPILLAR,
  TOKEN_CAPPYBARE, TOKEN_RANDIA2,
  TOKEN_STARBLOCK, TOKEN_ENERGY, TOKEN_YELLOWSNAKE, TOKEN_DUBIAJR,
  TOKEN_FOOD, TOKEN_WAPOD, TOKEN_BOMB, TOKEN_SNOWBALL,
} from "./cards";

// ═══════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════
const UNIT_SLOTS = ["frontLeft", "frontCenter", "frontRight", "midCenter", "backLeft", "backRight"];
const BUILDING_SLOTS = ["backLeft", "backRight"];
const ALL_SLOTS = [...UNIT_SLOTS, "base"];

const PROTECTION_MAP = {
  backLeft: "frontLeft",
  backRight: "frontRight",
  midCenter: "frontCenter",
};

const HEX_ADJACENCY = {
  frontCenter: ["frontLeft", "frontRight", "midCenter"],
  frontLeft: ["frontCenter", "midCenter", "backLeft"],
  frontRight: ["frontCenter", "midCenter", "backRight"],
  midCenter: ["frontCenter", "frontLeft", "frontRight", "backLeft", "backRight"],
  backLeft: ["frontLeft", "midCenter"],
  backRight: ["frontRight", "midCenter"],
};

const LEFT_SLOTS = ["frontLeft", "backLeft"];
const CENTER_SLOTS = ["frontCenter", "midCenter"];
const RIGHT_SLOTS = ["frontRight", "backRight"];

function getColumn(slot) {
  if (LEFT_SLOTS.includes(slot)) return "left";
  if (CENTER_SLOTS.includes(slot)) return "center";
  if (RIGHT_SLOTS.includes(slot)) return "right";
  return null;
}

function getFacingEnemySlots(state, myPlayer, mySlot) {
  const col = getColumn(mySlot);
  if (!col) return [];
  const oppId = opponent(myPlayer);
  const colSlots = col === "left" ? LEFT_SLOTS : col === "center" ? CENTER_SLOTS : RIGHT_SLOTS;
  return colSlots.filter(s => state.players[oppId].board[s]);
}

function isFacing(mySlot, targetSlot) {
  return getColumn(mySlot) === getColumn(targetSlot);
}

const BEHIND_MAP = {
  frontCenter: "midCenter",
  frontLeft: "backLeft",
  frontRight: "backRight",
  midCenter: "base",
};

// ── Flying helpers ──
function unitHasFlying(unit) {
  if (!unit || !unit.keywords) return false;
  return unit.keywords.includes("flying1") || unit.keywords.includes("flying2");
}
function unitHasFlying2(unit) {
  if (!unit || !unit.keywords) return false;
  return unit.keywords.includes("flying2");
}

function isLeaderProtected(state, targetPlayer) {
  const board = state.players[targetPlayer].board;
  const occupied = UNIT_SLOTS.filter(s => board[s] && !(board[s].keywords?.includes("stealth") && !board[s].hasActed));
  if (occupied.length === 0) return false;

  const visited = new Set();
  function bfs(start) {
    const component = new Set();
    const queue = [start];
    visited.add(start);
    component.add(start);
    while (queue.length > 0) {
      const current = queue.shift();
      for (const neighbor of HEX_ADJACENCY[current] || []) {
        if (!visited.has(neighbor) && occupied.includes(neighbor)) {
          visited.add(neighbor);
          component.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return component;
  }

  for (const slot of occupied) {
    if (visited.has(slot)) continue;
    const component = bfs(slot);
    const hasLeft = [...component].some(s => LEFT_SLOTS.includes(s));
    const hasCenter = [...component].some(s => CENTER_SLOTS.includes(s));
    const hasRight = [...component].some(s => RIGHT_SLOTS.includes(s));
    if (hasLeft && hasCenter && hasRight) return true;
  }
  return false;
}

const SLOT_LABELS = {
  frontLeft: "左前", frontCenter: "中前", frontRight: "右前",
  midCenter: "中央", backLeft: "左後", backRight: "右後", base: "本陣",
};

const ATTR_COLORS = {
  Common: { bg: "#6B7280", border: "#9CA3AF", light: "#E5E7EB" },
  Red: { bg: "#DC2626", border: "#F87171", light: "#FEE2E2" },
  Blue: { bg: "#2563EB", border: "#60A5FA", light: "#DBEAFE" },
  Green: { bg: "#16A34A", border: "#4ADE80", light: "#DCFCE7" },
  White: { bg: "#7C9CBF", border: "#93C5FD", light: "#EFF6FF" },
  Orange: { bg: "#EA580C", border: "#FB923C", light: "#FFF7ED" },
  Purple: { bg: "#7C3AED", border: "#A78BFA", light: "#EDE9FE" },
  Black: { bg: "#1F2937", border: "#6B7280", light: "#F3F4F6" },
};

const KEYWORD_ICONS = { dash1: "⚡", dash2: "⚡⚡", block: "🛡️", flying1: "🪽", flying2: "🪽🪽", guard1: "🪨", guard2: "🪨🪨", immobile: "📌", pierce1: "🔱", stealth: "🫥", triple_attack: "⚔×3" };

const KEYWORD_LABELS = {
  dash1: "ダッシュI: 召喚ターンにヘルパーへ攻撃可能",
  dash2: "ダッシュII: 召喚ターンにヘルパー・リーダーへ攻撃可能",
  block: "ブロック: 自分より後ろの味方を攻撃対象にさせない",
  flying1: "ふゆうI: ブロック・壁・保護を無視して攻撃可能",
  flying2: "ふゆうII: ふゆうI + 攻撃時に反撃ダメージを受けない",
  guard1: "ガードI: 受けるダメージを常時-1",
  guard2: "ガードII: 受けるダメージを常時-2",
  immobile: "攻撃不可: 攻撃できないが移動は可能",
  pierce1: "貫通I: 攻撃対象の真後ろにも同ダメージ",
  stealth: "せんぷく: 攻撃するまで対象に選ばれない",
};

// ═══════════════════════════════════════════
//  RARITY SYSTEM
// ═══════════════════════════════════════════
const RARITY_LEVELS = {
  C: { label: "コモン", stars: 1, color: "#CD7F32", bgGlow: "rgba(205,127,50,0.3)" },
  R: { label: "レア", stars: 2, color: "#C0C0C0", bgGlow: "rgba(192,192,192,0.3)" },
  SR: { label: "スーパーレア", stars: 3, color: "#FFD700", bgGlow: "rgba(255,215,0,0.3)" },
  UR: { label: "ウルトラレア", stars: 4, color: "#B9F2FF", bgGlow: "rgba(185,242,255,0.4)" },
};

// ═══════════════════════════════════════════
//  COPY ABILITIES（コピー能力定義）
// ═══════════════════════════════════════════
const LINEAGE_TO_COPY = {
  fire: "C01", fighter: "C02", sword: "C03", spark: "C04",
  leaf: "C05", ice: "C06", tornado: "C07", stone: "C08",
  beam: "C09", whip: "C10", bomb: "C11", water: "C12", hammer: "C13", sleep: "C14", crash: "C15", spear: "C16", cutter: "C17",
};

const COPY_ABILITIES = {
  C01: { id: "C01", name: "ファイア", attr: "Red", wazas: [
    { id: "fire1", name: "火ふきこうげき", cost: 2, maxStock: 2, targetMode: "enemy_any", desc: "敵ヘルパーに3ダメ\n敵リーダーに2ダメ" },
    { id: "fire2", name: "火だるまぢごく", cost: 3, maxStock: 2, targetMode: "none", desc: "赤味方ランダムATK+2\nカード1枚引く" },
    { id: "fire3", name: "バーニングアタック", cost: 3, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパーに5ダメ\n自身にも3ダメ" },
    { id: "fire4", name: "かいてんひふき", cost: 4, maxStock: 2, targetMode: "none", desc: "すべての敵ヘルパーに\n2ダメージ" },
  ]},
  C02: { id: "C02", name: "ファイター", attr: "Red", wazas: [
    { id: "fighter1", name: "バルカンジャブ", cost: 1, maxStock: 2, targetMode: "attack", atk: 1, desc: "【こうげき】\nリンク赤II:追加2ダメ" },
    { id: "fighter2", name: "スマッシュパンチ", cost: 2, maxStock: 2, targetMode: "enemy_any", desc: "指定した縦1列の\n敵ヘルパー全てに2ダメ" },
    { id: "fighter3", name: "ライジンブレイク", cost: 3, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパーに3ダメ\nブロック持ちなら7ダメ" },
  ]},
  C03: { id: "C03", name: "ソード", attr: "Green", wazas: [
    { id: "sword1", name: "たてぎり", cost: 1, maxStock: 3, targetMode: "attack", atk: 2, desc: "【こうげき】" },
    { id: "sword2", name: "かいてんぎり", cost: 3, maxStock: 2, targetMode: "enemy_any", desc: "敵1体に2ダメ\n【リンク:緑I】:\n隣接する敵すべてに1ダメ" },
    { id: "sword3", name: "エナジーソード", cost: 1, maxStock: 2, targetMode: "none", desc: "次のこうげき時\n攻撃力+2" },
    { id: "sword4", name: "ヒーローシールド", cost: 2, maxStock: 2, targetMode: "none", desc: "次の相手ターン終了まで\nリーダー＆隣接ヘルパー\nダメージ-1\n【連続使用不可】" },
  ]},
  C04: { id: "C04", name: "スパーク", attr: "Green", wazas: [
    { id: "spark1", name: "スパークバリア", cost: 1, maxStock: 4, targetMode: "none", desc: "次ターン中こうげき反撃1ダメ\nスパークレーザー+2ダメ\n(最大5ダメまで重複)" },
    { id: "spark2", name: "サンダーボルト", cost: 1, maxStock: 2, targetMode: "none", desc: "ダメージ中の\nランダム敵ヘルパーに2ダメ" },
    { id: "spark3", name: "スパークレーザー", cost: 2, maxStock: 2, targetMode: "enemy_any", desc: "指定した縦1列の\n敵ヘルパー全てにダメ\n使用後ダメージリセット" },
  ]},
  C05: { id: "C05", name: "リーフ", attr: "Green", wazas: [
    { id: "leaf1", name: "リーフカッター", cost: 2, maxStock: 3, targetMode: "none", desc: "ランダム敵に\n合計3ダメ分配" },
    { id: "leaf2", name: "リーフダンサー", cost: 3, maxStock: 2, targetMode: "none", desc: "2枚ドロー\nリンク緑X:\n味方リーダーをX回復" },
    { id: "leaf3", name: "アッパーリーフ", cost: 3, maxStock: 2, targetMode: "attack", atk: 4, desc: "【こうげき】" },
  ]},
  C06: { id: "C06", name: "アイス", attr: "White", wazas: [
    { id: "ice1", name: "こちこちといき", cost: 3, maxStock: 2, targetMode: "any_helper", desc: "任意のヘルパー1体を\n-2/-2する\nリンク白I:コスト-1" },
    { id: "ice2", name: "こちこちウォール", cost: 1, maxStock: 2, targetMode: "none", desc: "味方マスに\n氷柱(0/1ブロック)を出す" },
    { id: "ice3", name: "こちこちスプリンクラー", cost: 6, maxStock: 1, targetMode: "none", desc: "ランダムな敵ヘルパー\n4体を-2/-2する\n【連続使用不可】" },
  ]},
  C07: { id: "C07", name: "トルネイド", attr: "White", wazas: [
    { id: "tornado1", name: "トルネイドアタック", cost: 2, maxStock: 2, targetMode: "none", desc: "カードを2枚引き\nその後1枚捨てる" },
    { id: "tornado2", name: "スクリュータックル", cost: 3, maxStock: 2, targetMode: "enemy_helper_atk3_or_less", desc: "ATK3以下の敵ヘルパーを\n相手の手札に戻す" },
    { id: "tornado3", name: "ビッグトルネイド", cost: 7, maxStock: 1, targetMode: "none", desc: "ランダム敵ヘルパーに\n2ダメ×4回\nカード1枚引く" },
  ]},
  C08: { id: "C08", name: "ストーン", attr: "Orange", wazas: [
    { id: "stone1", name: "石ころへんしん", cost: 1, maxStock: 2, targetMode: "none", desc: "次に受けるダメージを\n0にする\n(相手ターン終了時に解除)" },
    { id: "stone2", name: "石ころアッパーカット", cost: 3, maxStock: 2, targetMode: "attack", atk: 3, desc: "【こうげき】\n手札ランダム+1/+1" },
    { id: "stone3", name: "ヘビーおしつぶし", cost: 4, maxStock: 1, targetMode: "none", desc: "最もHPの高い\n敵ヘルパーに6ダメ" },
  ]},
  C09: { id: "C09", name: "ビーム", attr: "Orange", wazas: [
    { id: "beam1", name: "ビームウィップ", cost: 2, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパーに2ダメ\nリンク橙II:1枚引く" },
    { id: "beam2", name: "ビームマシンガン", cost: 1, maxStock: 2, targetMode: "none", desc: "ランダムな敵に合計X\nダメ分配\nX=使ったコピー種類数\n(このワザ自身を含む)" },
    { id: "beam3", name: "はどうビーム", cost: 3, maxStock: 2, targetMode: "enemy_any", desc: "指定した縦1列の\n敵ヘルパー全てに3ダメ" },
    { id: "beam4", name: "レボリューションビーム", cost: 1, maxStock: 2, targetMode: "none", desc: "手札の橙カードから\nランダム2枚を選び\n各カードにATK+1かHP+1\nをランダム付与" },
  ]},
  C10: { id: "C10", name: "ウィップ", attr: "Orange", wazas: [
    { id: "whip1", name: "むちうち", cost: 1, maxStock: 2, targetMode: "attack", atk: 2, desc: "【こうげき】" },
    { id: "whip2", name: "キャッチャーウィップ", cost: 2, maxStock: 2, targetMode: "none", desc: "相手手札から\nランダム1枚コピー\nコスト-1" },
    { id: "whip3", name: "パラダイスタイフーン", cost: 5, maxStock: 1, targetMode: "none", desc: "カードを3枚引く" },
  ]},
  C11: { id: "C11", name: "ボム", attr: "Blue", wazas: [
    { id: "bomb1", name: "ばくだんなげ", cost: 1, maxStock: 2, targetMode: "enemy_front_empty_slot", desc: "相手の前列の空きマスに\nばくだんを設置" },
    { id: "bomb2", name: "おきにげばくだん", cost: 2, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパーに2ダメ\n死亡したらそのマスに\nばくだんを設置" },
    { id: "bomb3", name: "とく大ばくだんなげ", cost: 6, maxStock: 1, targetMode: "enemy_any_slot", desc: "敵ヘルパーマスに5ダメ\n隣接の敵にも2ダメ" },
  ]},
  C12: { id: "C12", name: "ウォーター", attr: "Blue", wazas: [
    { id: "water1", name: "ウェーブショット", cost: 2, maxStock: 2, targetMode: "attack", atk: 2, desc: "【こうげき】ATK2\n【リンク:青I】:\nヘルパーならATK-2後\n攻撃する" },
    { id: "water2", name: "ウォータークラウン", cost: 0, maxStock: 2, targetMode: "none", desc: "手札1枚捨てて\nこのターン中PP+1" },
    { id: "water3", name: "レインボーレイン", cost: 3, maxStock: 2, targetMode: "none", desc: "手札1枚捨てて\nカードを3枚引く" },
  ]},
  C13: { id: "C13", name: "ハンマー", attr: "Red", wazas: [
    { id: "hammer1", name: "ハンマーたたき", cost: 1, maxStock: 2, targetMode: "attack", atk: 2, desc: "【こうげき】" },
    { id: "hammer2", name: "おにごろし火炎ハンマー", cost: 2, maxStock: 1, targetMode: "enemy_any", desc: "敵1体にダメージ\n(基本1、毎ターン+1)\n使用後ダメージリセット" },
    { id: "hammer3", name: "ばくれつハンマー投げ", cost: 3, maxStock: 1, targetMode: "enemy_any", desc: "指定した縦1列の\n敵ヘルパーに3ダメ\n使用後コピー能力を失う" },
  ]},
  C14: { id: "C14", name: "スリープ", attr: "Purple", wazas: [
    { id: "sleep1", name: "すいみん", cost: 0, maxStock: 0, targetMode: "none", desc: "Zzz...\nこのワザは使えない\n2ターン後に自動解除" },
    { id: "sleep2", name: "頑張り早起き", cost: 1, maxStock: 1, targetMode: "none", desc: "コピー能力を失う\n(早期解除)\n※ワザ使用済みでも使える" },
  ]},
  C15: { id: "C15", name: "クラッシュ", attr: "Purple", wazas: [
    { id: "crash1", name: "はかいのかえん", cost: 7, maxStock: 1, targetMode: "none", desc: "すべてのヘルパーに\n5ダメージ\nその後コピー能力を失う" },
  ]},
  C16: { id: "C16", name: "スピア", attr: "Orange", wazas: [
    { id: "spear1", name: "ヤリつき", cost: 2, maxStock: 3, targetMode: "attack", atk: 2, desc: "【こうげき】【貫通I】" },
    { id: "spear2", name: "月おとし", cost: 1, maxStock: 2, targetMode: "friendly_helper", desc: "味方ヘルパー1体の\n攻撃力+1＆貫通I付与" },
    { id: "spear3", name: "スピアコプター", cost: 3, maxStock: 2, targetMode: "none", desc: "デッキからヘルパー2枚引く\n【リンクIII】\n引いたカードを+1/+1" },
  ]},
  C17: { id: "C17", name: "カッター", attr: "Common", wazas: [
    { id: "cutter1", name: "ジャンプカッター", cost: 1, maxStock: 2, targetMode: "none", desc: "相手の山札を\n上から2枚破棄する" },
    { id: "cutter2", name: "ハイパーブーメラン", cost: 3, maxStock: 2, targetMode: "attack", atk: 3, desc: "【こうげき】\n隣接ランダム敵ヘルパーに\n3ダメージ\nコピーターン使用不可" },
    { id: "cutter3", name: "ファイナルカッター", cost: 4, maxStock: 1, targetMode: "enemy_any", desc: "敵ヘルパー: 5ダメージ\n敵リーダー: 山札5枚破棄" },
  ]},
};

// ═══════════════════════════════════════════
//  WAZA HANDLERS（ワザ効果辞典）
// ═══════════════════════════════════════════
function getWazaDmgBonus(player) { return UNIT_SLOTS.filter(sl => player.board[sl] && player.board[sl].effect === "passive_waza_dmg_bonus").length; }

const WAZA_HANDLERS = {
  fire1: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    if (ctx.targetSlot === "leader") { ctx.damageLeader(ctx.opp, 2 + b); ctx.addLog("🔥 火ふきこうげき: 敵リーダーに" + (2+b) + "ダメ！"); }
    else { const name = ctx.ep.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 3 + b); ctx.addLog("🔥 火ふきこうげき: " + name + "に" + d + "ダメ！"); }
  },
  fire2: (ctx) => {
    const redHelpers = UNIT_SLOTS.filter(sl => ctx.player.board[sl] && ctx.player.board[sl].attr === "Red");
    if (redHelpers.length > 0) { const sl = rand(redHelpers); const t = ctx.player.board[sl]; t.currentAttack += 2; ctx.addLog("🔥 火だるまぢごく: " + t.name + "のATK+2！"); }
    if (ctx.drawCard(ctx.ap)) ctx.addLog("🔥 火だるまぢごく: カード1枚引いた！");
  },
  fire3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const name = ctx.ep.board[ctx.targetSlot]?.name;
    const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 5 + b);
    if (d > 0) ctx.addLog("🔥 バーニングアタック: " + name + "に" + d + "ダメ！");
    ctx.damageLeader(ctx.ap, 3 + b); ctx.addLog("🔥 バーニングアタック: 自身に" + (3+b) + "ダメ！");
  },
  fire4: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const targets = UNIT_SLOTS.filter(sl => ctx.ep.board[sl]);
    targets.forEach(sl => ctx.dealDamage(ctx.opp, sl, 2 + b, true));
    targets.forEach(sl => ctx.checkDeath(ctx.opp, sl));
    ctx.addLog("🔥 かいてんひふき: すべての敵ヘルパーに" + (2+b) + "ダメージ！");
  },
  fighter2: makeColumnDamageWaza(2, "👊 スマッシュパンチ:"),
  fighter3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const t = ctx.ep.board[ctx.targetSlot];
    if (t) { const isBlock = t.keywords.includes("block"); const dmg = isBlock ? 7 + b : 3 + b; const name = t.name; const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, dmg); ctx.addLog("👊 ライジンブレイク: " + name + "に" + d + "ダメ！" + (isBlock ? "(ブロック特効)" : "")); }
  },
  sword2: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const hasLink = checkLink(ctx.s, ctx.ap, "base", "Green", 1);
    const LEADER_ADJ = ["backLeft", "backRight", "midCenter"];
    if (ctx.targetSlot === "leader") {
      ctx.damageLeader(ctx.opp, 2 + b); ctx.addLog("⚔️ かいてんぎり: 敵リーダーに" + (2+b) + "ダメ！");
      if (hasLink) {
        LEADER_ADJ.forEach(sl => { const name = ctx.ep.board[sl]?.name; const d = ctx.dealDamage(ctx.opp, sl, 1 + b, true); if (d > 0) ctx.addLog("⚔️ かいてんぎり: " + name + "に" + d + "ダメ！"); });
        LEADER_ADJ.forEach(sl => ctx.checkDeath(ctx.opp, sl));
      }
    } else {
      const name = ctx.ep.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 2 + b, true); if (d > 0) ctx.addLog("⚔️ かいてんぎり: " + name + "に" + d + "ダメ！");
      if (hasLink) {
        const adj = HEX_ADJACENCY[ctx.targetSlot] || [];
        adj.forEach(sl => { const n2 = ctx.ep.board[sl]?.name; const d2 = ctx.dealDamage(ctx.opp, sl, 1 + b, true); if (d2 > 0) ctx.addLog("⚔️ かいてんぎり: " + n2 + "に" + d2 + "ダメ！"); });
        if (LEADER_ADJ.includes(ctx.targetSlot)) { ctx.damageLeader(ctx.opp, 1 + b); ctx.addLog("⚔️ かいてんぎり: 敵リーダーに" + (1+b) + "ダメ！"); }
        [ctx.targetSlot, ...adj].forEach(sl => ctx.checkDeath(ctx.opp, sl));
      } else {
        ctx.checkDeath(ctx.opp, ctx.targetSlot);
      }
    }
  },
  sword3: (ctx) => {
    ctx.player.leaderAtkBonus = 2;
    ctx.addLog("⚔️ エナジーソード: 次のこうげき時ATK+2！");
  },
  sword4: (ctx) => {
    ctx.player.heroShield = true;
    ctx.player.heroShieldCooldown = 2;
    ctx.addLog("🛡️ ヒーローシールド: リーダー＆隣接ヘルパーのダメージ-1！");
  },
  spark1: (ctx) => {
    ctx.player.sparkBarrier = true;
    ctx.player.sparkLaserBonus = Math.min((ctx.player.sparkLaserBonus || 0) + 2, 4);
    const nextDmg = 1 + ctx.player.sparkLaserBonus;
    ctx.addLog("⚡ スパークバリア: 次ターン中こうげき反撃！レーザー威力" + nextDmg + "に！");
  },
  spark2: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const damaged = UNIT_SLOTS.filter(sl => ctx.ep.board[sl] && ctx.ep.board[sl].currentHp < ctx.ep.board[sl].hp);
    if (damaged.length > 0) {
      const t = rand(damaged);
      const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 2 + b); ctx.addLog("⚡ サンダーボルト: " + name + "に" + d + "ダメ！");
    } else { ctx.addLog("⚡ サンダーボルト: ダメージ中の敵ヘルパーがいない！"); }
  },
  spark3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const col = ctx.targetSlot === "leader" ? "center" : getColumn(ctx.targetSlot);
    if (!col) return;
    const colSlots = col === "left" ? LEFT_SLOTS : col === "center" ? CENTER_SLOTS : RIGHT_SLOTS;
    const dmg = 1 + (ctx.player.sparkLaserBonus || 0) + b;
    const oppSlots = colSlots.filter(sl => ctx.ep.board[sl]);
    oppSlots.forEach(sl => { const name = ctx.ep.board[sl]?.name; const d = ctx.dealDamage(ctx.opp, sl, dmg, true); ctx.addLog("⚡ スパークレーザー: " + name + "に" + d + "ダメ！"); });
    oppSlots.forEach(sl => ctx.checkDeath(ctx.opp, sl));
    ctx.player.sparkLaserBonus = 0;
    if (oppSlots.length > 0) ctx.addLog("⚡ スパークレーザー: ダメージリセット！");
    else ctx.addLog("⚡ スパークレーザー: 対象なし。ダメージリセット！");
  },
  // leaf1はUSE_WAZAで直接pendingSpreadにセットするためここでは処理しない
  leaf2: (ctx) => {
    let n = 0; for (let i = 0; i < 2; i++) { if (ctx.drawCard(ctx.ap)) n++; }
    const x = getLinkCount(ctx.s, ctx.ap, "base", "Green");
    if (x > 0) { ctx.player.leaderHp = Math.min(20, ctx.player.leaderHp + x); ctx.addLog("🍃 リーフダンサー: " + n + "枚ドロー＆【リンク緑" + x + "】リーダーHP" + x + "回復！"); }
    else { ctx.addLog("🍃 リーフダンサー: " + n + "枚ドロー！(緑リンクなし)"); }
  },
  ice1: (ctx) => {
    const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot];
    if (t) { t.currentAttack = Math.max(0, t.currentAttack - 2); t.hp = Math.max(0, t.hp - 2); t.currentHp -= 2; ctx.addLog("❄️ こちこちといき: " + t.name + "を-2/-2！"); ctx.checkDeath(ctx.targetPlayer, ctx.targetSlot); }
  },
  ice2: (ctx) => {
    const sl = ctx.spawnUnit(ctx.ap, TOKEN_ICEPILLAR);
    if (sl) ctx.addLog("❄️ こちこちウォール: " + SLOT_LABELS[sl] + "に氷柱を配置！");
    else ctx.addLog("❄️ こちこちウォール: 空きマスがない！");
  },
  ice3: (ctx) => {
    const helpers = UNIT_SLOTS.filter(sl => ctx.ep.board[sl]);
    const pool = [...helpers];
    const targets = [];
    for (let i = 0; i < 4 && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      targets.push(pool.splice(idx, 1)[0]);
    }
    targets.forEach(sl => { const u = ctx.ep.board[sl]; if (u) { u.currentAttack = Math.max(0, u.currentAttack - 2); u.hp = Math.max(0, u.hp - 2); u.currentHp -= 2; } });
    targets.forEach(sl => ctx.checkDeath(ctx.opp, sl));
    ctx.addLog("❄️ こちこちスプリンクラー: ランダム敵" + targets.length + "体を-2/-2！");
    ctx.player.ice3Cooldown = 2;
  },
  stone1: (ctx) => {
    ctx.player.leaderShield = true;
    ctx.addLog("🪨 石ころへんしん: 次のダメージを無効化！");
  },
  stone3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    let maxHp = 0; let targets = [];
    UNIT_SLOTS.forEach(sl => { const u = ctx.ep.board[sl]; if (u) { if (u.currentHp > maxHp) { maxHp = u.currentHp; targets = [sl]; } else if (u.currentHp === maxHp) targets.push(sl); } });
    if (targets.length > 0) { const t = rand(targets); const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 6 + b); ctx.addLog("🪨 ヘビーおしつぶし: " + name + "に" + d + "ダメ！"); }
    else ctx.addLog("🪨 ヘビーおしつぶし: 敵ヘルパーがいない！");
  },
  beam1: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const name = ctx.ep.board[ctx.targetSlot]?.name;
    const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 2 + b);
    if (d > 0) ctx.addLog("🔮 ビームウィップ: " + name + "に" + d + "ダメ！");
    if (checkLink(ctx.s, ctx.ap, "base", "Orange", 2)) { if (ctx.drawCard(ctx.ap)) ctx.addLog("🔮 ビームウィップ: 【リンク橙II】1枚引いた！"); }
  },
  beam3: makeColumnDamageWaza(3, "🔮 はどうビーム:"),
  beam4: (ctx) => {
    const orangeCards = ctx.player.hand.filter(c => c.attr === "Orange");
    if (orangeCards.length === 0) { ctx.addLog("🔮 レボリューションビーム: 手札に橙カードがない！"); return; }
    const picked = [];
    for (let i = 0; i < Math.min(2, orangeCards.length); i++) {
      const remaining = orangeCards.filter(c => !picked.includes(c));
      picked.push(rand(remaining));
    }
    picked.forEach(card => {
      if (Math.random() < 0.5) { card.attack = (card.attack || 0) + 1; ctx.addLog("🔮 レボリューションビーム: " + card.name + " ATK+1！"); }
      else { card.hp = (card.hp || 0) + 1; ctx.addLog("🔮 レボリューションビーム: " + card.name + " HP+1！"); }
    });
  },
  whip2: (ctx) => {
    const oppHand = ctx.ep.hand;
    if (oppHand.length > 0 && ctx.player.hand.length < 8) {
      const copied = { ...rand(oppHand) }; copied.cost = Math.max(0, copied.cost - 1);
      ctx.player.hand.push(copied);
      ctx.addLog("🪢 キャッチャーウィップ: " + copied.name + "をコスト-1でコピー！");
    } else { ctx.addLog("🪢 キャッチャーウィップ: コピーできず！"); }
  },
  whip3: (ctx) => {
    let n = 0; for (let i = 0; i < 3; i++) { if (ctx.drawCard(ctx.ap)) n++; }
    ctx.addLog("🪢 パラダイスタイフーン: " + n + "枚ドロー！");
  },
  tornado1: (ctx) => {
    let drawn = 0;
    for (let i = 0; i < 2; i++) { if (ctx.drawCard(ctx.ap)) drawn++; }
    if (ctx.player.hand.length > 0) {
      ctx.s.pendingTwisterDiscard = true;
      ctx.addLog("🌪️ トルネイドアタック: " + drawn + "枚引いた！捨てるカードを選んでください");
    } else { ctx.addLog("🌪️ トルネイドアタック: " + drawn + "枚引いた！手札がないため捨てるカードなし"); }
  },
  tornado2: (ctx) => {
    const t = ctx.ep.board[ctx.targetSlot];
    if (!t) return;
    ctx.ep.board[ctx.targetSlot] = null;
    if (ctx.ep.hand.length < 8) {
      const original = CARD_POOL.find(c => c.id === t.id);
      if (original) {
        ctx.ep.hand.push({ ...original, origAttack: original.attack, origHp: original.hp });
      } else {
        ctx.ep.hand.push({ id: t.id, name: t.name, type: t.type, cost: t.cost, attack: t.baseAttack ?? t.currentAttack, hp: t.baseHp ?? t.hp, attr: t.attr, keywords: [...(t.keywords || [])], desc: t.desc || "", effect: t.effect || "", isToken: t.isToken || false });
      }
      ctx.addLog("🌪️ スクリュータックル: " + t.name + "を相手の手札に戻した！");
    } else {
      ctx.addLog("🌪️ スクリュータックル: " + t.name + "を消滅させた！(手札上限)");
    }
  },
  tornado3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    ctx.s.pendingSpread = { remaining: 4, targetPlayerId: ctx.opp, sourceName: "ビッグトルネイド", sourceEmoji: "🌪️", dmgPerHit: 2 + b, helpersOnly: true };
    ctx.addLog("🌪️ ビッグトルネイド: " + (2+b) + "ダメ×4！");
    if (ctx.drawCard(ctx.ap)) ctx.addLog("🌪️ ビッグトルネイド: 1枚ドロー！");
  },
  bomb1: (ctx) => {
    if (!ctx.ep.board[ctx.targetSlot]) {
      ctx.spawnUnit(ctx.opp, TOKEN_BOMB, ctx.targetSlot);
      ctx.addLog("💣 ばくだんなげ: " + SLOT_LABELS[ctx.targetSlot] + "にばくだん設置！");
    }
  },
  bomb2: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const t = ctx.ep.board[ctx.targetSlot];
    if (t) {
      const name = t.name;
      const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 2 + b);
      ctx.addLog("💣 おきにげばくだん: " + name + "に" + d + "ダメ！");
      if (!ctx.ep.board[ctx.targetSlot]) {
        ctx.spawnUnit(ctx.opp, TOKEN_BOMB, ctx.targetSlot);
        ctx.addLog("💣 おきにげばくだん: " + SLOT_LABELS[ctx.targetSlot] + "にばくだん設置！");
      }
    }
  },
  bomb3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const LEADER_ADJ = ["backLeft", "backRight", "midCenter"];
    const t = ctx.ep.board[ctx.targetSlot];
    if (t) { const name = t.name; const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 5 + b, true); ctx.addLog("💣 とく大ばくだんなげ: " + name + "に" + d + "ダメ！"); }
    else { ctx.addLog("💣 とく大ばくだんなげ: " + SLOT_LABELS[ctx.targetSlot] + "に着弾！"); }
    const adj = HEX_ADJACENCY[ctx.targetSlot] || [];
    adj.forEach(sl => {
      const name = ctx.ep.board[sl]?.name;
      const d = ctx.dealDamage(ctx.opp, sl, 2 + b, true);
      if (d > 0) ctx.addLog("💣 とく大ばくだんなげ: " + name + "に" + d + "ダメ！");
    });
    if (LEADER_ADJ.includes(ctx.targetSlot)) { ctx.damageLeader(ctx.opp, 2 + b); ctx.addLog("💣 とく大ばくだんなげ: 敵リーダーに" + (2+b) + "ダメ！"); }
    if (t) ctx.checkDeath(ctx.opp, ctx.targetSlot);
    adj.forEach(sl => ctx.checkDeath(ctx.opp, sl));
  },
  water2: (ctx) => {
    if (ctx.player.hand.length > 0) {
      ctx.s.pendingWaterDiscard = { waza: "water2" };
      ctx.addLog("💧 ウォータークラウン: 捨てるカードを選んでください");
    } else { ctx.addLog("💧 ウォータークラウン: 手札がない！"); }
  },
  water3: (ctx) => {
    if (ctx.player.hand.length > 0) {
      ctx.s.pendingWaterDiscard = { waza: "water3" };
      ctx.addLog("💧 レインボーレイン: 捨てるカードを選んでください");
    } else { ctx.addLog("💧 レインボーレイン: 手札がない！"); }
  },
  hammer2: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const dmg = (ctx.player.hammerFireDmg || 1) + b;
    if (ctx.targetSlot === "leader") { ctx.damageLeader(ctx.opp, dmg); ctx.addLog("🔨 おにごろし火炎ハンマー: 敵リーダーに" + dmg + "ダメ！"); }
    else { const name = ctx.ep.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, dmg); ctx.addLog("🔨 おにごろし火炎ハンマー: " + name + "に" + d + "ダメ！"); }
    ctx.player.hammerFireDmg = 1;
    ctx.addLog("🔨 おにごろし火炎ハンマー: ダメージをリセット！");
  },
  hammer3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    ctx.player.currentCopy = null;
    ctx.player.wazaStocks = {};
    ctx.player.hammerFireDmg = 1;
    ctx.addLog("🔨 ばくれつハンマー投げ: コピー能力を失った！");
    doColumnDamage(ctx, 3 + b, "🔨 ばくれつハンマー投げ:");
  },
  sleep2: (ctx) => {
    ctx.player.currentCopy = null;
    ctx.player.wazaStocks = {};
    ctx.player.sleepTurns = 0;
    ctx.addLog("💤 頑張り早起き: 目が覚めた！コピー能力が解除された");
  },
  crash1: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    ctx.player.currentCopy = null;
    ctx.player.wazaStocks = {};
    ctx.addLog("💥 はかいのかえん: コピー能力を失った！");
    [ctx.ap, ctx.opp].forEach(pid => {
      UNIT_SLOTS.forEach(sl => { ctx.dealDamage(pid, sl, 5 + b, true); });
    });
    [ctx.ap, ctx.opp].forEach(pid => { UNIT_SLOTS.forEach(sl => ctx.checkDeath(pid, sl)); });
    ctx.addLog("💥 はかいのかえん: すべてのヘルパーに" + (5+b) + "ダメージ！");
  },
  spear2: (ctx) => {
    const t = ctx.player.board[ctx.targetSlot];
    if (t) {
      t.currentAttack += 1;
      if (!t.keywords.includes("pierce1")) t.keywords.push("pierce1");
      ctx.addLog("🔱 月おとし: " + t.name + "の攻撃力+1＆貫通I付与！");
    }
  },
  spear3: (ctx) => {
    const helperIndices = [];
    ctx.player.deck.forEach((c, i) => { if (c.type === "helper") helperIndices.push(i); });
    const picked = [];
    for (let i = 0; i < 2 && helperIndices.length > 0; i++) {
      const ri = Math.floor(Math.random() * helperIndices.length);
      picked.push(helperIndices.splice(ri, 1)[0]);
    }
    picked.sort((a, b) => b - a);
    const drawnCards = [];
    picked.forEach(idx => { if (ctx.player.hand.length < 8) { const card = ctx.player.deck.splice(idx, 1)[0]; ctx.player.hand.push(card); drawnCards.push(card); } });
    if (drawnCards.length > 0) ctx.addLog("🔱 スピアコプター: ヘルパー" + drawnCards.length + "枚を引いた！");
    else { ctx.addLog("🔱 スピアコプター: ヘルパーが見つからない！"); return; }
    if (checkLink(ctx.s, ctx.ap, "base", "Orange", 3)) {
      drawnCards.forEach(c => { c.attack = (c.attack || 0) + 1; c.hp = (c.hp || 0) + 1; });
      ctx.addLog("🔱 スピアコプター: 【リンク橙III】引いたカードを+1/+1！");
    }
  },
  cutter1: (ctx) => {
    const n = ctx.millCards(ctx.opp, 2);
    if (n > 0) ctx.addLog("✂️ ジャンプカッター: 相手山札" + n + "枚破棄！");
    else ctx.addLog("✂️ ジャンプカッター: 相手の山札がない！");
  },
  cutter3: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    if (ctx.targetSlot === "leader") {
      const n = ctx.millCards(ctx.opp, 5);
      ctx.addLog("✂️ ファイナルカッター: 相手山札" + n + "枚破棄！");
    } else {
      const name = ctx.ep.board[ctx.targetSlot]?.name;
      const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 5 + b);
      if (d > 0) ctx.addLog("✂️ ファイナルカッター: " + name + "に" + d + "ダメ！");
    }
  },
};

function resolveLeaderAttack(s, ap, opp, waza, targetSlot, addLog, triggerOnDamage, checkDeath) {
  const player = s.players[ap]; const ep = s.players[opp];
  let atkPower = waza.atk + (player.leaderAtkBonus || 0);
  UNIT_SLOTS.forEach(sl => { const u = player.board[sl]; if (u && u.effect === "" && u.id === 402) atkPower += 1; });
  player.leaderAtkBonus = 0;

  if (targetSlot === "leader") {
    if (atkPower <= 0) { addLog("⚔️ " + waza.name + ": 敵リーダーに0ダメ！"); }
    else if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: ダメージ無効化！"); }
    else { const hsDmg = ep.heroShield ? Math.max(0, atkPower - 1) : atkPower; ep.leaderHp -= hsDmg; addLog("⚔️ " + waza.name + ": 敵リーダーに" + hsDmg + "ダメ！"); }
    if (waza.id === "fighter1" && checkLink(s, ap, "base", "Red", 2)) {
      if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: リンクダメージ無効化！"); }
      else { const lkDmg = ep.heroShield ? Math.max(0, 2 - 1) : 2; ep.leaderHp -= lkDmg; addLog("👊 バルカンジャブ: 【リンク赤II】追加" + lkDmg + "ダメ！"); }
    }
    if (waza.id === "stone2") {
      const helpers = player.hand.filter(h => h.type === "helper");
      if (helpers.length > 0) { const pick = rand(helpers); pick.attack = (pick.attack||0)+1; pick.hp = (pick.hp||0)+1; addLog("🪨 石ころアッパーカット: " + pick.name + "を+1/+1！"); }
    }
  } else {
    const target = ep.board[targetSlot]; if (!target) return;
    const tgtPower = getEffectiveAttack(target, s);
    const dmgToTarget = applyGuard(target, atkPower);
    const bladeKnightCount = UNIT_SLOTS.filter(sl => player.board[sl] && player.board[sl].effect === "passive_reduce_retaliation").length;
    const dmgToLeader = Math.max(0, tgtPower - bladeKnightCount * 2);
    const LEADER_ADJ = ["backLeft", "backRight", "midCenter"];
    const actualDmgToTarget = (ep.heroShield && LEADER_ADJ.includes(targetSlot)) ? Math.max(0, dmgToTarget - 1) : dmgToTarget;
    target.currentHp -= actualDmgToTarget;
    if (dmgToLeader <= 0) { if (bladeKnightCount > 0) addLog("🛡️ ブレイドナイト: 反撃ダメージを0に軽減！"); }
    else if (player.leaderShield) { player.leaderShield = false; addLog("🪨 石ころへんしん: 反撃ダメージ無効化！"); }
    else { const rDmg = player.heroShield ? Math.max(0, dmgToLeader - 1) : dmgToLeader; player.leaderHp -= rDmg; if (bladeKnightCount > 0) addLog("🛡️ ブレイドナイト: 反撃ダメージ-" + (bladeKnightCount * 2) + "！"); }
    addLog("⚔️ " + waza.name + "(" + actualDmgToTarget + ") ⇄ " + target.name + "(" + dmgToLeader + ")");
    if (actualDmgToTarget > 0) triggerOnDamage(opp, targetSlot);
    if (waza.id === "fighter1" && checkLink(s, ap, "base", "Red", 2)) {
      const bonus = applyGuard(target, 2); target.currentHp -= bonus;
      addLog("👊 バルカンジャブ: 【リンク赤II】追加" + bonus + "ダメ！");
      if (bonus > 0) triggerOnDamage(opp, targetSlot);
    }
    if (waza.id === "stone2") {
      const helpers = player.hand.filter(h => h.type === "helper");
      if (helpers.length > 0) { const pick = rand(helpers); pick.attack = (pick.attack||0)+1; pick.hp = (pick.hp||0)+1; addLog("🪨 石ころアッパーカット: " + pick.name + "を+1/+1！"); }
    }
    if (waza.id === "spear1") {
      const behindSlot = BEHIND_MAP[targetSlot];
      if (behindSlot) {
        if (behindSlot === "base") {
          if (dmgToTarget > 0) {
            if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: 貫通ダメージ無効化！"); }
            else { const pHsDmg = ep.heroShield ? Math.max(0, dmgToTarget - 1) : dmgToTarget; ep.leaderHp -= pHsDmg; addLog("🔱 貫通: 敵リーダーにも" + pHsDmg + "ダメ！"); }
          }
        } else if (ep.board[behindSlot]) {
          const behindName = ep.board[behindSlot].name;
          const pierceDmg = applyGuard(ep.board[behindSlot], dmgToTarget);
          ep.board[behindSlot].currentHp -= pierceDmg;
          if (pierceDmg > 0) { triggerOnDamage(opp, behindSlot); addLog("🔱 貫通: " + behindName + "にも" + pierceDmg + "ダメ！"); }
        }
      }
    }
    checkDeath(opp, targetSlot);
    if (waza.id === "spear1") { const bs = BEHIND_MAP[targetSlot]; if (bs && bs !== "base" && ep.board[bs]) checkDeath(opp, bs); }
  }
  if (targetSlot === "leader" && ep.sparkBarrier) {
    const bladeKnightCount = UNIT_SLOTS.filter(sl => player.board[sl] && player.board[sl].effect === "passive_reduce_retaliation").length;
    const barrierDmg = Math.max(0, 1 - bladeKnightCount * 2);
    if (barrierDmg <= 0) { addLog("🛡️ ブレイドナイト: スパークバリア反撃を0に軽減！"); }
    else if (player.leaderShield) { player.leaderShield = false; addLog("🪨 石ころへんしん: スパークバリア反撃を無効化！"); }
    else { const bHsDmg = player.heroShield ? Math.max(0, barrierDmg - 1) : barrierDmg; if (bHsDmg > 0) { player.leaderHp -= bHsDmg; addLog("⚡ スパークバリア: こうげき反撃で" + bHsDmg + "ダメージ！"); } }
  }
}

// ═══════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const opponent = (p) => p === "p1" ? "p2" : "p1";
const DECK_COLORS = ["Red", "Blue", "Green", "White", "Orange"];

function buildDeck(color, supportCard) {
  const deckColor = color || rand(DECK_COLORS);
  const colorCards = shuffle(CARD_POOL.filter(c => c.attr === deckColor));
  const commonCards = shuffle(CARD_POOL.filter(c => c.attr === "Common"));
  const blackCards = shuffle(CARD_POOL.filter(c => c.attr === "Black"));
  const purpleCards = shuffle(CARD_POOL.filter(c => c.attr === "Purple"));
  const picked = [];
  colorCards.forEach(c => { if (picked.length < 15) picked.push(c); });
  blackCards.forEach(c => { if (picked.length < 15) picked.push(c); });
  purpleCards.forEach(c => { if (picked.length < 15) picked.push(c); });
  commonCards.forEach(c => { if (picked.length < 15) picked.push(c); });
  const deck = [];
  picked.forEach(c => { deck.push({...c, origAttack: c.attack, origHp: c.hp}, {...c, origAttack: c.attack, origHp: c.hp}, {...c, origAttack: c.attack, origHp: c.hp}); });
  if (supportCard) { deck.pop(); deck.push({...supportCard}); }
  return { deck: shuffle(deck), color: deckColor };
}
function buildCustomDeck(customDeckData, supportCard) {
  const deck = [];
  Object.entries(customDeckData.counts).forEach(([idStr, count]) => {
    const id = parseInt(idStr);
    const card = CARD_POOL.find(c => c.id === id);
    if (card) {
      for (let i = 0; i < count; i++) {
        deck.push({ ...card, origAttack: card.attack, origHp: card.hp });
      }
    }
  });
  if (supportCard) deck.push({ ...supportCard });
  return shuffle(deck);
}
const getEmptyUnitSlots = (state, p) => UNIT_SLOTS.filter(s => !state.players[p].board[s]);
const hasEnemyHelpers = (state, p) => { const o = opponent(p); return UNIT_SLOTS.some(s => state.players[o].board[s]); };
const getEnemyHelperSlots = (state, p) => { const o = opponent(p); return UNIT_SLOTS.filter(s => state.players[o].board[s]); };

function checkLink(state, playerId, slot, linkAttr, linkCount) {
  const board = state.players[playerId].board;
  const adj = HEX_ADJACENCY[slot] || [];
  let count = 0;
  for (const s of adj) {
    const u = board[s];
    if (u && (linkAttr === null || u.attr === linkAttr)) count++;
  }
  const LEADER_ADJ = ["backLeft", "backRight", "midCenter"];
  const copy = state.players[playerId].currentCopy;
  if (copy && LEADER_ADJ.includes(slot) && (linkAttr === null || copy.attr === linkAttr)) count++;
  if (slot === "base") {
    LEADER_ADJ.forEach(s => { const u = board[s]; if (u && (linkAttr === null || u.attr === linkAttr)) count++; });
  }
  return count >= linkCount;
}

function getLinkCount(state, playerId, slot, linkAttr) {
  const board = state.players[playerId].board;
  const adj = HEX_ADJACENCY[slot] || [];
  let count = 0;
  for (const s of adj) {
    const u = board[s];
    if (u && (linkAttr === null || u.attr === linkAttr)) count++;
  }
  const LEADER_ADJ = ["backLeft", "backRight", "midCenter"];
  const copy = state.players[playerId].currentCopy;
  if (copy && LEADER_ADJ.includes(slot) && (linkAttr === null || copy.attr === linkAttr)) count++;
  if (slot === "base") {
    LEADER_ADJ.forEach(s => { const u = board[s]; if (u && (linkAttr === null || u.attr === linkAttr)) count++; });
  }
  return count;
}

function getEffectiveAttack(unit, state) {
  let atk = unit.currentAttack;
  if (unit.effect === "enrage3" && unit.currentHp < unit.hp) atk += 3;
  if (unit.effect === "hunter_enrage3" && state) {
    for (const pid of ["p1", "p2"]) {
      const isOwner = UNIT_SLOTS.some(sl => state.players[pid].board[sl] === unit);
      if (!isOwner && state.players[pid].hand.length >= 5) atk += 3;
    }
  }
  return Math.max(0, atk);
}

function initGuardCharges(card) {
  if (card.keywords?.includes("guard2")) return 2;
  if (card.keywords?.includes("guard1")) return 1;
  return 0;
}

function applyGuard(unit, damage) {
  if (!unit || !unit.keywords) return damage;
  if (unit.immuneThisTurn) return 0;
  if (damage >= 1 && unit.guardCharges > 0) {
    unit.guardCharges -= 1;
    if (unit.guardCharges === 1) { unit.keywords = unit.keywords.filter(k => k !== "guard2"); if (!unit.keywords.includes("guard1")) unit.keywords.push("guard1"); }
    else if (unit.guardCharges === 0) { unit.keywords = unit.keywords.filter(k => k !== "guard2" && k !== "guard1"); }
    return 0;
  }
  return damage;
}

function isProtected(state, targetPlayer, targetSlot) {
  const protector = PROTECTION_MAP[targetSlot];
  if (!protector) return false;
  const unit = state.players[targetPlayer].board[protector];
  if (!unit || unit.frozen) return false;
  if (unit.keywords?.includes("stealth") && !unit.hasActed) return false;
  return true;
}

const SLOT_ROW = { frontCenter: 0, frontLeft: 1, frontRight: 1, midCenter: 2, backLeft: 3, backRight: 3, base: 4 };

function getBlockProtected(state, targetPlayer) {
  const board = state.players[targetPlayer].board;
  const p = new Set();
  UNIT_SLOTS.forEach(slot => {
    const u = board[slot];
    if (u && u.keywords.includes("block") && !u.frozen && !(u.keywords.includes("stealth") && !u.hasActed)) {
      if (isProtected(state, targetPlayer, slot)) return;
      const blockRow = SLOT_ROW[slot];
      [...UNIT_SLOTS, "base"].forEach(s => { if (SLOT_ROW[s] > blockRow) p.add(s); });
    }
  });
  return p;
}

function getValidAttackTargets(state, attackerPlayer, attackerSlot) {
  const opp = opponent(attackerPlayer);
  const attacker = state.players[attackerPlayer].board[attackerSlot];
  if (!attacker) return [];
  const isFlying = unitHasFlying(attacker);
  const targets = [];
  const bp = getBlockProtected(state, opp);

  UNIT_SLOTS.forEach(slot => {
    const u = state.players[opp].board[slot];
    if (!u) return;
    if (u.keywords?.includes("stealth") && !u.hasActed) return;
    if (isFlying) { targets.push(slot); return; }
    if (isProtected(state, opp, slot)) return;
    if (bp.has(slot)) return;
    targets.push(slot);
  });

  const leaderWalled = isLeaderProtected(state, opp);
  const leaderBlocked = bp.has("base");
  if (isFlying || (!leaderWalled && !leaderBlocked)) {
    if (!attacker.keywords.includes("dash1") && !attacker.keywords.includes("dash2") || attacker.canAttackLeader || attacker.keywords.includes("dash2")) {
      targets.push("leader");
    }
  }
  return targets;
}

function getValidLeaderAttackTargets(state, attackerPlayer) {
  const opp = opponent(attackerPlayer);
  const targets = [];
  const bp = getBlockProtected(state, opp);

  UNIT_SLOTS.forEach(slot => {
    const u = state.players[opp].board[slot];
    if (!u) return;
    if (u.keywords?.includes("stealth") && !u.hasActed) return;
    if (isProtected(state, opp, slot)) return;
    if (bp.has(slot)) return;
    targets.push(slot);
  });

  const leaderWalled = isLeaderProtected(state, opp);
  const leaderBlocked = bp.has("base");
  if (!leaderWalled && !leaderBlocked) {
    targets.push("leader");
  }
  return targets;
}

// ═══════════════════════════════════════════
//  INITIAL STATE
// ═══════════════════════════════════════════
function createPlayerState(color, supportCard, customDeckData) {
  let deck, deckColor;
  if (customDeckData) {
    deckColor = customDeckData.color;
    deck = buildCustomDeck(customDeckData, supportCard);
  } else {
    const result = buildDeck(color, supportCard);
    deck = result.deck;
    deckColor = result.color;
  }
  let hand;
  if (supportCard) {
    const supIdx = deck.findIndex(c => c.isSupport);
    const sup = supIdx >= 0 ? deck.splice(supIdx, 1)[0] : null;
    hand = sup ? [sup, ...deck.splice(0, 2)] : deck.splice(0, 3);
  } else {
    hand = deck.splice(0, 3);
  }
  return { leaderHp: 20, mana: 0, maxMana: 0, hand, deck, board: Object.fromEntries(ALL_SLOTS.map(s => [s, null])), costReduction: 0, deckColor, supportCooldowns: [], usedSupportThisTurn: false, graveyard: [], currentCopy: null, wazaStocks: {}, usedWazaThisTurn: false, leaderAtkBonus: 0, leaderShield: false, transformedThisTurn: false, sparkBarrier: false, sparkLaserBonus: 0, hammerFireDmg: 1, sleepTurns: 0, leaderFrozen: false, millCount: 0, heroShield: false, heroShieldCooldown: 0, ice3Cooldown: 0, usedCopyTypes: [], friendlyDeathCount: 0 };
}

function createInitialState(p1Color, p2Color, p1Support, p2Support, p1Custom, p2Custom) {
  const p2 = createPlayerState(p2Color, p2Support, p2Custom || null);
  if (p2.deck.length > 0) p2.hand.push(p2.deck.shift());
  p2.hand.push({...TOKEN_ENERGY});
  return { phase: "playing", turn: 0, activePlayer: "p1", winner: null, players: { p1: createPlayerState(p1Color, p1Support, p1Custom || null), p2: p2 }, log: ["🌟 ゲーム開始！ P2に手札+1&エナジードリンクを付与"], fullLog: ["🌟 ゲーム開始！ P2に手札+1&エナジードリンクを付与"], turnStarted: false, pendingSummonEffect: null, pendingKain: false, pendingKuu: null, pendingTwisterDiscard: false, pendingWaza: null, pendingWaterDiscard: null, pendingSpread: null, pendingGalactica: null, galacticaMissSeq: 0, galacticaLastMiss: null, showWazaPanel: false };
}

// ═══════════════════════════════════════════
//  HANDLER FACTORY FUNCTIONS
// ═══════════════════════════════════════════
function makeDamageHandler(dmg, label) {
  return (ctx) => {
    if (ctx.targetSlot === "leader") { ctx.damageLeader(ctx.targetPlayer, dmg); ctx.addLog(label + " 敵リーダーに" + dmg + "ダメージ！"); }
    else { const name = ctx.tp.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.targetPlayer, ctx.targetSlot, dmg); if (d > 0) ctx.addLog(label + " " + name + "に" + d + "ダメ！"); }
  };
}
function makeDebuffAtkHandler(amount, label) {
  return (ctx) => { const t = ctx.tp.board[ctx.targetSlot]; if (t) { t.currentAttack = Math.max(0, t.currentAttack - amount); ctx.addLog(label + " " + t.name + "の攻撃力-" + amount + "！"); } };
}
function makeMillHandler(targetFn, count, label) {
  return (ctx) => { const n = ctx.millCards(targetFn(ctx), count); if (n > 0) ctx.addLog(label + n + "枚破棄！"); };
}
function doColumnDamage(ctx, dmg, label) {
  const col = ctx.targetSlot === "leader" ? "center" : getColumn(ctx.targetSlot);
  if (!col) return;
  const colSlots = col === "left" ? LEFT_SLOTS : col === "center" ? CENTER_SLOTS : RIGHT_SLOTS;
  const oppSlots = colSlots.filter(sl => ctx.ep.board[sl]);
  oppSlots.forEach(sl => { const name = ctx.ep.board[sl]?.name; const d = ctx.dealDamage(ctx.opp, sl, dmg, true); ctx.addLog(label + " " + name + "に" + d + "ダメ！"); });
  oppSlots.forEach(sl => ctx.checkDeath(ctx.opp, sl));
}
function makeColumnDamageWaza(baseDmg, label) {
  return (ctx) => { doColumnDamage(ctx, baseDmg + getWazaDmgBonus(ctx.player), label); };
}

// ═══════════════════════════════════════════
//  SUMMON EFFECT HANDLERS
// ═══════════════════════════════════════════
function makeSummonAoeHandler(hitSelf) {
  return (ctx) => {
    const { s, ap, opp, slot } = ctx;
    [ap, opp].forEach(pid => {
      UNIT_SLOTS.forEach(sl => {
        const u = s.players[pid].board[sl];
        if (u && (hitSelf || !(pid === ap && sl === slot))) {
          ctx.dealDamage(pid, sl, 1, true);
        }
      });
    });
    [ap, opp].forEach(pid => { UNIT_SLOTS.forEach(sl => ctx.checkDeath(pid, sl)); });
    ctx.addLog("⚡ スパーキー: 全ヘルパーに1ダメ！");
  };
}

const SUMMON_EFFECT_HANDLERS = {
  galactic_knight: (ctx) => { const consumed = Math.min(20, ctx.player.graveyard.length); ctx.player.graveyard.splice(0, consumed); ctx.addLog("🌌 ギャラクティックナイト: 墓地から" + consumed + "枚消費！"); },
  summon_2dmg_leader: (ctx) => { ctx.damageLeader(ctx.opp, 2); ctx.addLog("🔥 ホットヘッド: 敵リーダーに2ダメージ！"); },
  summon_aoe1: makeSummonAoeHandler(false),
  summon_aoe1_self: makeSummonAoeHandler(true),
  summon_buff_red: (ctx) => {
    UNIT_SLOTS.forEach(sl => { const u = ctx.player.board[sl]; if (u && u.attr === "Red" && sl !== ctx.slot) { u.currentAttack += 1; ctx.addLog("💪 " + u.name + " 攻撃力+1！"); } });
  },
  summon_mill2: makeMillHandler(ctx => ctx.opp, 2, "📤 サーキブル: 相手山札"),
  summon_self_mill2: makeMillHandler(ctx => ctx.ap, 2, "📤 ファッティバッファー: 自分の山札"),
  summon_heal_all2: (ctx) => { const { player } = ctx; let healed = 0; UNIT_SLOTS.forEach(sl => { const u = player.board[sl]; if (u && u.currentHp < u.hp) { u.currentHp = Math.min(u.hp, u.currentHp + 2); healed++; } }); if (player.leaderHp < 20) { player.leaderHp = Math.min(20, player.leaderHp + 2); healed++; } ctx.addLog("💚 リーファン: 味方" + healed + "体を2回復！"); },
  summon_buff_orange_hand: (ctx) => { let c = 0; ctx.player.hand.forEach(h => { if (h.attr === "Orange" && h.type === "helper") { h.hp = (h.hp || 0) + 1; c++; } }); if (c) ctx.addLog("🟠 ジェムラ: 手札の橙" + c + "体HP+1！"); },
  summon_draw2_discard1: (ctx) => { let drawn = 0; for (let i = 0; i < 2; i++) { if (ctx.drawCard(ctx.ap)) drawn++; } if (ctx.player.hand.length > 0) { ctx.s.pendingTwisterDiscard = true; ctx.addLog("🌪️ ツイスター: " + drawn + "枚引いた！捨てるカードを選んでください"); } else { ctx.addLog("🌪️ ツイスター: 手札がないため捨てるカードなし"); } },
  summon_snowball: (ctx) => { if (ctx.player.hand.length < 8) { ctx.player.hand.push({ ...TOKEN_SNOWBALL }); ctx.addLog("❄️ Mr.フロスティ: 雪玉を手札に！"); } },
  goliath: (ctx) => {
    let n = 0;
    for (let i = 0; i < 2 && ctx.player.hand.length < 8; i++) { ctx.player.hand.push({ ...TOKEN_SNOWBALL }); n++; }
    if (n > 0) ctx.addLog("❄️ ゴライアス: 雪玉" + n + "枚を手札に！");
  },
  mr_shine: (ctx) => { const n1 = ctx.millCards(ctx.ap, 2); const n2 = ctx.millCards(ctx.opp, 2); ctx.addLog("🌟 ミスター・シャイン: お互いの山札を上から2枚ずつ破棄！(自分" + n1 + "枚・相手" + n2 + "枚)"); },
  mr_bright: (ctx) => { ctx.damageLeader(ctx.ap, 2); ctx.damageLeader(ctx.opp, 2); ctx.addLog("☀️ ミスター・ブライト: お互いのリーダーに2ダメージ！"); },
  summon_copy_if_leader_damaged: (ctx) => { if (ctx.player.leaderHp < 20) { const sl = ctx.spawnUnit(ctx.ap, ctx.card); if (sl) ctx.addLog("🔥 フレイマー: 味方リーダーがダメージ中！もう1体召喚！"); } },
  summon_copy_always: (ctx) => { const sl = ctx.spawnUnit(ctx.ap, ctx.card); if (sl) ctx.addLog("✨ モプーがもう1体！"); },
  summon_pruid: (ctx) => { const n = ctx.millCards(ctx.ap, 2); if (n > 0) ctx.addLog("📤 プルイド: 山札" + n + "枚破棄！"); const sl = ctx.spawnUnit(ctx.ap, ctx.card); if (sl) ctx.addLog("✨ プルイドがもう1体！"); },
  summon_dubia: (ctx) => { let added = 0; for (let i = 0; i < 2 && ctx.player.hand.length < 8; i++) { ctx.player.hand.push({ ...TOKEN_DUBIAJR }); added++; } if (added) ctx.addLog("⚡ ドゥビア: ドゥビアJr.を" + added + "体手札に！"); },
  summon_and_discard_2dmg: (ctx) => { const es = getEnemyHelperSlots(ctx.s, ctx.ap); if (es.length > 0) { const t = rand(es); const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 2); ctx.addLog("🌊 バラクー: " + name + "に" + d + "ダメ！"); } },
  summon_2dmg_all_damaged: (ctx) => { const damaged = UNIT_SLOTS.filter(sl => ctx.ep.board[sl] && ctx.ep.board[sl].currentHp < ctx.ep.board[sl].hp); damaged.forEach(t => ctx.dealDamage(ctx.opp, t, 2, true)); damaged.forEach(t => ctx.checkDeath(ctx.opp, t)); if (damaged.length > 0) ctx.addLog("🦅 オウグルフ: ダメージ中の敵" + damaged.length + "体に2ダメ！"); },
  summon_hp_reduce_all_damaged: (ctx) => { const damaged = UNIT_SLOTS.filter(sl => ctx.ep.board[sl] && ctx.ep.board[sl].currentHp < ctx.ep.board[sl].hp); damaged.forEach(t => { const u = ctx.ep.board[t]; u.hp = Math.max(0, u.hp - 2); u.currentHp -= 2; }); damaged.forEach(t => ctx.checkDeath(ctx.opp, t)); if (damaged.length > 0) ctx.addLog("🦅 オウグルフ: ダメージ中の敵" + damaged.length + "体をHP-2！"); },
  summon_random_3dmg_2: (ctx) => { const es = getEnemyHelperSlots(ctx.s, ctx.ap); const targets = []; const pool = [...es]; for (let i = 0; i < 2 && pool.length > 0; i++) { const idx = Math.floor(Math.random() * pool.length); targets.push(pool.splice(idx, 1)[0]); } targets.forEach(t => { const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 3, true); ctx.addLog("🟠 グランドローパー: " + name + "に" + d + "ダメ！"); }); targets.forEach(t => ctx.checkDeath(ctx.opp, t)); },
  summon_propeller: (ctx) => { const oppPlayer = ctx.ep; if (oppPlayer.usedSupportThisTurn) { const unit = ctx.player.board[ctx.slot]; if (unit) { unit.currentAttack += 2; unit.currentHp += 2; unit.hp += 2; unit.keywords = [...unit.keywords, "dash1"]; ctx.addLog("🌀 プロペラー: 敵がサポート使用済み！+2/+2＆ダッシュI！"); } } },
  summon_needlous: (ctx) => { const allHelpers = []; [ctx.ap, ctx.opp].forEach(pid => { UNIT_SLOTS.forEach(sl => { if (ctx.s.players[pid].board[sl] && !(pid === ctx.ap && sl === ctx.slot)) { allHelpers.push({ pid, sl }); } }); }); if (allHelpers.length > 0) { const pick = rand(allHelpers); const name = ctx.s.players[pick.pid].board[pick.sl]?.name; const d = ctx.dealDamage(pick.pid, pick.sl, 1); ctx.addLog("🦔 ニードラス: " + name + "に" + d + "ダメ！"); } },
  summon_draw_orange_lineage: (ctx) => {
    const orangeIndices = [];
    ctx.player.deck.forEach((c, i) => { if (c.attr === "Orange") orangeIndices.push(i); });
    const picked = [];
    for (let i = 0; i < 2 && orangeIndices.length > 0; i++) {
      const ri = Math.floor(Math.random() * orangeIndices.length);
      picked.push(orangeIndices.splice(ri, 1)[0]);
    }
    picked.sort((a, b) => b - a);
    let n = 0;
    picked.forEach(idx => { if (ctx.player.hand.length < 8) { const card = ctx.player.deck.splice(idx, 1)[0]; ctx.player.hand.push(card); n++; } });
    if (n > 0) ctx.addLog("🔱 バンダナワドルディ: デッキから橙カード" + n + "枚を手札に！");
    else ctx.addLog("🔱 バンダナワドルディ: 橙カードが見つからない！");
  },
  summon_bonkers: (ctx) => {
    const emptySlots = getEmptyUnitSlots(ctx.s, ctx.opp);
    const pool = [...emptySlots];
    let placed = 0;
    for (let i = 0; i < 2 && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const sl = pool.splice(idx, 1)[0];
      ctx.spawnUnit(ctx.opp, TOKEN_BOMB, sl);
      placed++;
    }
    if (placed > 0) ctx.addLog("💣 ボンカース: ランダムな敵の空きマス" + placed + "つにばくだん設置！");
    else ctx.addLog("💣 ボンカース: 敵の空きマスがない！");
  },
  summon_bombs_3: (ctx) => {
    const emptySlots = getEmptyUnitSlots(ctx.s, ctx.opp);
    const pool = [...emptySlots];
    let placed = 0;
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const sl = pool.splice(idx, 1)[0];
      ctx.spawnUnit(ctx.opp, TOKEN_BOMB, sl);
      placed++;
    }
    if (placed > 0) ctx.addLog("💣 メタルジェネラル: ランダムな敵の空きマス" + placed + "つにばくだん設置！");
    else ctx.addLog("💣 メタルジェネラル: 敵の空きマスがない！");
  },
  summon_metaknight: (ctx) => {
    const oppHand = ctx.ep.hand;
    const helpers = oppHand.filter(c => c.type === "helper");
    if (helpers.length === 0) { ctx.addLog("⚔️ メタナイト: 相手の手札にヘルパーがいない！"); return; }
    const FACING_PRIORITY = {
      left: ["frontLeft", "backLeft", "frontCenter", "midCenter", "frontRight", "backRight"],
      center: ["frontCenter", "midCenter", "frontLeft", "backLeft", "frontRight", "backRight"],
      right: ["frontRight", "backRight", "frontCenter", "midCenter", "frontLeft", "backLeft"],
    };
    const col = getColumn(ctx.slot) || "center";
    const priority = FACING_PRIORITY[col];
    const targetSlot = priority.find(sl => !ctx.ep.board[sl]);
    if (!targetSlot) { ctx.addLog("⚔️ メタナイト: 相手の盤面が埋まっている！"); return; }
    const maxCost = Math.max(...helpers.map(c => c.cost));
    const maxHelpers = helpers.filter(c => c.cost === maxCost);
    const picked = rand(maxHelpers);
    const handIdx = oppHand.indexOf(picked);
    if (handIdx < 0) return;
    oppHand.splice(handIdx, 1);
    ctx.ep.board[targetSlot] = { ...picked, currentHp: picked.hp, currentAttack: picked.attack, baseAttack: picked.origAttack ?? picked.attack, baseHp: picked.origHp ?? picked.hp, hasAttacked: false, summonedThisTurn: true, canAttackLeader: false, frozen: false, hasActed: false };
    ctx.addLog("⚔️ メタナイト: 相手の" + picked.name + "(コスト" + picked.cost + ")を" + SLOT_LABELS[targetSlot] + "に引きずり出した！");
  },
};

// ═══════════════════════════════════════════
//  DEATH EFFECT HANDLERS
// ═══════════════════════════════════════════
const DEATH_EFFECT_HANDLERS = {
  mr_shine: (ctx) => { if (ctx.s.players[ctx.owner].hand.length < 8) { const card = CARD_POOL.find(c => c.id === 212); if (card) { ctx.s.players[ctx.owner].hand.push({...card}); ctx.addLog("🌟 ミスター・シャイン: ミスター・ブライトを手札に！"); } } },
  mr_bright: (ctx) => { if (ctx.s.players[ctx.owner].hand.length < 8) { const card = CARD_POOL.find(c => c.id === 317); if (card) { ctx.s.players[ctx.owner].hand.push({...card}); ctx.addLog("☀️ ミスター・ブライト: ミスター・シャインを手札に！"); } } },
  death_2dmg_leaders: (ctx) => { ctx.damageLeader("p1", 2); ctx.damageLeader("p2", 2); ctx.addLog("🔥 ガルボ: 全リーダーに2ダメージ！"); },
  death_draw: (ctx) => { if (ctx.drawCard(ctx.owner)) ctx.addLog("📥 " + ctx.unit.name + ": カード1枚引いた！"); },
  death_bobo: (ctx) => { if (ctx.drawCard(ctx.owner)) ctx.addLog("🔥 ボボ: カード1枚引いた！"); ctx.damageLeader(ctx.oppOf, 1); ctx.addLog("🔥 ボボ: 敵リーダーに1ダメージ！"); },
  death_and_discard_draw: (ctx) => { if (ctx.drawCard(ctx.owner)) ctx.addLog("📥 " + ctx.unit.name + ": カード1枚引いた！"); },
  death_opp_draw: (ctx) => { if (ctx.drawCard(ctx.oppOf)) ctx.addLog("📥 ウォンキィ: 相手が1枚引いた！"); },
  death_debuff: (ctx) => { const es = UNIT_SLOTS.filter(sl => ctx.s.players[ctx.oppOf].board[sl]); if (es.length > 0) { const t = rand(es); const tgt = ctx.s.players[ctx.oppOf].board[t]; tgt.currentAttack = Math.max(0, tgt.currentAttack - 1); tgt.hp = Math.max(0, tgt.hp - 1); tgt.currentHp -= 1; ctx.addLog("❄️ スノウル: " + tgt.name + "を-1/-1！"); if (tgt.currentHp <= 0) ctx.checkDeath(ctx.oppOf, t); } },
  death_waddle3: (ctx) => { let n = 0; const waddleCard = CARD_POOL.find(c => c.id === 1); for (let i = 0; i < 3 && ctx.s.players[ctx.owner].hand.length < 8; i++) { ctx.s.players[ctx.owner].hand.push({ ...waddleCard }); n++; } if (n > 0) ctx.addLog("🎁 パペットワドルディ: ワドルディ" + n + "体を手札に！"); },
  death_revive: (ctx) => { const sl = ctx.spawnUnit(ctx.p, TOKEN_CAPPYBARE, ctx.slot); if (sl) ctx.addLog("🔄 キャピィが0/1で復活！"); },
  death_copy_opp_hand: (ctx) => { const oppHand = ctx.s.players[ctx.oppOf].hand; if (oppHand.length > 0 && ctx.s.players[ctx.owner].hand.length < 8) { const copied = { ...rand(oppHand) }; ctx.s.players[ctx.owner].hand.push(copied); ctx.addLog("🔮 ウィッピィ: 相手の" + copied.name + "をコピー！"); } },
  death_cost_reduce: (ctx) => { ctx.s.players[ctx.owner].costReduction += 1; ctx.addLog("💜 ブルームハッター: 次のカードコスト-1！"); },
  death_randia: (ctx) => { let spawned = 0; for (let i = 0; i < 4; i++) { const sl = ctx.spawnUnit(ctx.owner, TOKEN_RANDIA2); if (sl) spawned++; } if (spawned > 0) ctx.addLog("🐉 ランディア: 3/2を" + spawned + "体召喚！"); },
  death_draw_link_2: (ctx) => { if (!checkLink(ctx.s, ctx.owner, ctx.slot, null, 2)) { ctx.addLog("🔗 ワドルドゥ: リンク不成立"); return; } if (ctx.drawCard(ctx.owner)) ctx.addLog("📥 ワドルドゥ: 【リンクII】カード1枚引いた！"); },
  death_sleep_opponent: (ctx) => {
    const opp = ctx.oppOf;
    const oppPlayer = ctx.s.players[opp];
    const sleepAbility = COPY_ABILITIES["C14"];
    oppPlayer.currentCopy = { ...sleepAbility };
    const stocks = {};
    sleepAbility.wazas.forEach(w => { stocks[w.id] = w.maxStock; });
    oppPlayer.wazaStocks = stocks;
    oppPlayer.sleepTurns = 2;
    oppPlayer.usedWazaThisTurn = false;
    ctx.addLog("💤 ノディ: 相手をスリープ状態にした！");
  },
  bomb_unit: (ctx) => {
    const adj = HEX_ADJACENCY[ctx.slot] || [];
    const dmg = ctx.unit.currentAttack;
    if (dmg <= 0) return;
    adj.forEach(sl => {
      const name = ctx.s.players[ctx.owner].board[sl]?.name;
      const d = ctx.dealDamage(ctx.owner, sl, dmg, true);
      if (d > 0) ctx.addLog("💣 ばくだん爆発: " + name + "に" + d + "ダメ！");
    });
    adj.forEach(sl => { if (ctx.s.players[ctx.owner].board[sl]) ctx.checkDeath(ctx.owner, sl); });
  },
};

// ═══════════════════════════════════════════
//  TARGETED SUMMON EFFECT HANDLERS
// ═══════════════════════════════════════════
const TARGETED_SUMMON_EFFECT_HANDLERS = {
  rololo_rarara: (ctx) => {
    const card = CARD_POOL.find(c => c.id === 413);
    if (!card) return;
    const spawned = ctx.spawnUnit(ctx.ap, card, ctx.targetSlot);
    if (spawned) {
      ctx.addLog("🎵 ロロロとラララ: " + SLOT_LABELS[ctx.targetSlot] + "に仲間を召喚！");
    }
  },
  summon_1dmg: makeDamageHandler(1, "💥"),
  summon_2dmg_target: makeDamageHandler(2, "🔥 バーニンレオ:"),
  summon_3dmg_damaged: (ctx) => { const name = ctx.tp.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.targetPlayer, ctx.targetSlot, 3); if (d > 0) ctx.addLog("💚 スフィアローパー(緑): " + name + "に" + d + "ダメ！"); },
  summon_debuff_atk2: makeDebuffAtkHandler(2, "💧 ウォーターガルボロス:"),
  summon_debuff_atk1: makeDebuffAtkHandler(1, "💧 ウォーターガルボ:"),
  summon_debuff_1_1: (ctx) => { const t = ctx.tp.board[ctx.targetSlot]; if (t) { t.currentAttack = Math.max(0, t.currentAttack - 1); t.hp = Math.max(0, t.hp - 1); t.currentHp -= 1; ctx.addLog("❄️ スフィアローパー(白): " + t.name + "を-1/-1！"); ctx.checkDeath(ctx.targetPlayer, ctx.targetSlot); } },
  summon_freeze: (ctx) => { if (ctx.targetSlot === "leader") { ctx.tp.leaderFrozen = true; ctx.addLog("🧊 チリー: 敵リーダーを凍結！次ターンワザ使用不可！"); } else { const t = ctx.tp.board[ctx.targetSlot]; if (t) { t.frozen = true; ctx.addLog("🧊 チリー: " + t.name + "を凍結！"); } } },
  summon_copy_stats: (ctx) => { const t = ctx.tp.board[ctx.targetSlot]; const self = ctx.player.board[ctx.summonSlot]; if (t && self) { const effectiveAtk = getEffectiveAttack(t, ctx.s); self.currentAttack = effectiveAtk; self.currentHp = t.currentHp; self.hp = t.currentHp; ctx.addLog("🖤 シャドーカービィ: " + t.name + "をコピー(" + effectiveAtk + "/" + t.currentHp + ")！"); } },
  summon_dedede: (ctx) => { const remaining = ctx.player.mana; if (remaining > 0) { ctx.player.mana = 0; if (ctx.targetSlot === "leader") { ctx.damageLeader(ctx.targetPlayer, remaining); ctx.addLog("🔨 デデデ大王: 敵リーダーに" + remaining + "ダメ！"); } else { const name = ctx.tp.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.targetPlayer, ctx.targetSlot, remaining); ctx.addLog("🔨 デデデ大王: " + name + "に" + d + "ダメ！"); } const self = ctx.player.board[ctx.summonSlot]; if (self) { self.currentAttack += remaining; ctx.addLog("🔨 デデデ大王: 攻撃力+" + remaining + "！"); } } },
  summon_buff_red_atk2: (ctx) => { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.currentAttack += 2; ctx.addLog("🔴 スフィアローパー(赤): " + t.name + "の攻撃力+2！"); } },
  summon_dynablade: (ctx) => { if (ctx.targetSlot === "leader") { let n = 0; for (let i = 0; i < 3; i++) { if (ctx.drawCard(ctx.ap)) n++; } ctx.addLog("🦅 ダイナブレイド: " + n + "枚ドロー！"); } else { const self = ctx.player.board[ctx.summonSlot]; if (self) { self.currentHp += 5; self.hp += 5; ctx.addLog("🦅 ダイナブレイド: HP+5！(HP" + self.currentHp + ")"); } } },
  summon_starblock: (ctx) => { if (!ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]) { ctx.spawnUnit(ctx.targetPlayer, TOKEN_STARBLOCK, ctx.targetSlot); ctx.addLog("⭐ ブロントバート: " + SLOT_LABELS[ctx.targetSlot] + "に星ブロック配置！"); } },
  summon_place_bomb: (ctx) => {
    if (!ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]) {
      ctx.spawnUnit(ctx.targetPlayer, TOKEN_BOMB, ctx.targetSlot);
      ctx.addLog("💣 ポピーブラザーズJr.: " + SLOT_LABELS[ctx.targetSlot] + "にばくだん設置！");
    }
  },
  summon_elec_dmg_copy: (ctx) => { if (ctx.targetSlot === "leader") { ctx.damageLeader(ctx.ap, 1); ctx.addLog("⚡ エレック: 味方リーダーに1ダメ！"); } else { const name = ctx.player.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.ap, ctx.targetSlot, 1); if (d > 0) ctx.addLog("⚡ エレック: " + name + "に" + d + "ダメ！"); } const card = CARD_POOL.find(c => c.id === 401); if (card) { const sl = ctx.spawnUnit(ctx.ap, card); if (sl) ctx.addLog("✨ エレックがもう1体！"); } },
  dekaboo: (ctx) => { const card = CARD_POOL.find(c => c.id === 2); if (card) { const spawned = ctx.spawnUnit(ctx.ap, card, ctx.targetSlot); if (spawned !== null && spawned !== undefined) ctx.addLog("🎩 デカブー: " + SLOT_LABELS[ctx.targetSlot] + "にカブーを召喚！"); } },
};

// ═══════════════════════════════════════════
//  ENDTURN EFFECT HANDLERS
// ═══════════════════════════════════════════
const ENDTURN_EFFECT_HANDLERS = {
  endturn_mill1: makeMillHandler(ctx => ctx.opp, 1, "📤 ジャックル: 相手山札"),
  endturn_3dmg_facing: (ctx) => { const facing = getFacingEnemySlots(ctx.s, ctx.ap, ctx.sl); if (facing.length > 0) { facing.forEach(t => { const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 3, true); ctx.addLog("⚡ キングスドゥ: " + name + "に" + d + "ダメ！"); }); facing.forEach(t => ctx.checkDeath(ctx.opp, t)); } },
  endturn_buff_orange_hand: (ctx) => { const oranges = ctx.player.hand.filter(h => h.attr === "Orange" && h.type === "helper"); if (oranges.length > 0) { const pick = rand(oranges); pick.attack = (pick.attack || 0) + 1; pick.hp = (pick.hp || 0) + 1; ctx.addLog("🟠 マウンデス: 手札の" + pick.name + "を+1/+1！"); } },
  endturn_spawn_wapod: (ctx) => { const sl2 = ctx.spawnUnit(ctx.ap, TOKEN_WAPOD); if (sl2) ctx.addLog("🏺 ワポッドのつぼ: ワポッド(1/1)を召喚！"); const d = ctx.dealDamage(ctx.ap, ctx.sl, 1); ctx.addLog("🏺 ワポッドのつぼ: 自身に" + d + "ダメージ(HP" + (ctx.u.currentHp) + ")"); if (ctx.u.currentHp <= 0) ctx.checkDeath(ctx.ap, ctx.sl); },
  endturn_spawn_snakes: (ctx) => { const enemyCount = getEnemyHelperSlots(ctx.s, ctx.ap).length; let spawned = 0; for (let i = 0; i < enemyCount; i++) { const sl2 = ctx.spawnUnit(ctx.ap, TOKEN_YELLOWSNAKE); if (sl2) spawned++; } if (spawned > 0) ctx.addLog("🐍 Mr.ダウター: イエロースネーク" + spawned + "体召喚！"); },
  endturn_3dmg_facing_link_o2: (ctx) => { if (!checkLink(ctx.s, ctx.ap, ctx.sl, "Orange", 2)) { return; } const facing = getFacingEnemySlots(ctx.s, ctx.ap, ctx.sl); if (facing.length > 0) { facing.forEach(t => { const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 3, true); ctx.addLog("⚡ キングスドゥ: 【リンク:橙II】" + name + "に" + d + "ダメ！"); }); facing.forEach(t => ctx.checkDeath(ctx.opp, t)); } },
  goliath: (ctx) => {
    if (!checkLink(ctx.s, ctx.ap, ctx.sl, "White", 4)) return;
    UNIT_SLOTS.forEach(sl => {
      const name = ctx.ep.board[sl]?.name;
      const d = ctx.dealDamage(ctx.opp, sl, 4, true);
      if (d > 0) ctx.addLog("❄️ ゴライアス: 【リンク:白IV】" + name + "に" + d + "ダメ！");
    });
    ctx.damageLeader(ctx.opp, 4);
    ctx.addLog("❄️ ゴライアス: 【リンク:白IV】敵リーダーに4ダメ！");
    UNIT_SLOTS.forEach(sl => ctx.checkDeath(ctx.opp, sl));
  },
};

// ═══════════════════════════════════════════
//  SPELL EFFECT HANDLERS
// ═══════════════════════════════════════════
const SPELL_EFFECT_HANDLERS = {
  deal3_helper: (ctx) => { const name = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.targetPlayer, ctx.targetSlot, 3); if (d > 0) ctx.addLog("💥 ゴルドー → " + name + "に" + d + "ダメ！"); },
  heal3: (ctx) => { if (ctx.targetSlot === "leader") { ctx.s.players[ctx.targetPlayer].leaderHp = Math.min(20, ctx.s.players[ctx.targetPlayer].leaderHp + 3); ctx.addLog("💖 マキシムトマト → リーダー3回復！"); } else { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.currentHp = Math.min(t.hp, t.currentHp + 3); ctx.addLog("💖 マキシムトマト → " + t.name + "3回復！"); } } },
  heal1: (ctx) => { if (ctx.targetSlot === "leader") { ctx.s.players[ctx.targetPlayer].leaderHp = Math.min(20, ctx.s.players[ctx.targetPlayer].leaderHp + 1); ctx.addLog("🍎 たべもの → リーダー1回復！"); } else { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.currentHp = Math.min(t.hp, t.currentHp + 1); ctx.addLog("🍎 たべもの → " + t.name + "1回復！"); } } },
  freeze: (ctx) => { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.frozen = true; ctx.addLog("🧊 雪玉 → " + t.name + "を凍結！"); } },
  snowball_debuff: (ctx) => { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.currentAttack = Math.max(0, t.currentAttack - 2); t.hp = Math.max(0, t.hp - 2); t.currentHp -= 2; ctx.addLog("❄️ 雪玉 → " + t.name + "を-2/-2！"); ctx.checkDeath(ctx.targetPlayer, ctx.targetSlot); } },
  energy_drink: (ctx) => { ctx.player.mana += 1; ctx.addLog("🥤 エナジードリンク: このターンPP+1！(" + ctx.player.mana + "/" + ctx.player.maxMana + ")"); },
  rick_dmg: (ctx) => { const es = getEnemyHelperSlots(ctx.s, ctx.ap); if (es.length > 0) { const t = rand(es); const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 2); ctx.addLog("🐹 リック: " + name + "に" + d + "ダメ！"); } else { ctx.addLog("🐹 リック: 敵ヘルパーがいない！"); } ctx.player.supportCooldowns.push({ card: { ...ctx.card }, turnsLeft: 2 }); },
  kain_cycle: (ctx) => { if (ctx.player.hand.length > 0) { ctx.s.pendingKain = true; ctx.addLog("🐟 カイン: 手札から1枚選んでデッキに戻してください"); } else { if (ctx.drawCard(ctx.ap)) ctx.addLog("🐟 カイン: カード1枚引いた！"); } ctx.player.supportCooldowns.push({ card: { ...ctx.card }, turnsLeft: 2 }); },
  kuu_move: (ctx) => { const hasHelper = UNIT_SLOTS.some(sl => ctx.player.board[sl]); if (hasHelper) { ctx.s.pendingKuu = { phase: "selectHelper", sourceSlot: null }; ctx.addLog("🦉 クー: 移動する味方ヘルパーを選んでください"); } else { ctx.addLog("🦉 クー: 移動可能な味方がいない！"); } ctx.player.supportCooldowns.push({ card: { ...ctx.card }, turnsLeft: 2 }); },
  destroy_atk3_or_less: (ctx) => { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { const effectiveAtk = getEffectiveAttack(t, ctx.s); if (effectiveAtk <= 3) { ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot] = null; ctx.addLog("💀 バルバル → " + t.name + "を消滅させた！(死亡時効果なし)"); } } },
};

// ═══════════════════════════════════════════
//  STARTTURN EFFECT HANDLERS
// ═══════════════════════════════════════════
const STARTTURN_EFFECT_HANDLERS = {
  start_whispy: (ctx) => { const roll = Math.floor(Math.random() * 3); if (roll === 0) { const sl = ctx.spawnUnit(ctx.ap, CARD_POOL.find(c => c.id === 1)); if (sl) ctx.addLog("🌳 ウィスピー: ワドルディ召喚！"); else ctx.addLog("🌳 ウィスピー: 盤面が埋まっている…"); } else if (roll === 1) { const sl = ctx.spawnUnit(ctx.ap, CARD_POOL.find(c => c.id === 3)); if (sl) ctx.addLog("🌳 ウィスピー: ブロントバート召喚！"); else ctx.addLog("🌳 ウィスピー: 盤面が埋まっている…"); } else { const es = getEnemyHelperSlots(ctx.s, ctx.ap); const targets = [...es, "leader"]; const t = rand(targets); if (t === "leader") { ctx.damageLeader(ctx.opp, 1); ctx.addLog("🌳 ウィスピー: 敵リーダーに1ダメ！"); } else { const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 1); ctx.addLog("🌳 ウィスピー: " + name + "に" + d + "ダメ！"); } } },
  start_explode3: (ctx) => { if (!ctx.u.readyToExplode) return; ctx.addLog("💥 サーチス: 全ヘルパーに3ダメージ！"); [ctx.ap, ctx.opp].forEach(pid => { UNIT_SLOTS.forEach(sl => { ctx.dealDamage(pid, sl, 3, true); }); }); [ctx.ap, ctx.opp].forEach(pid => { UNIT_SLOTS.forEach(sl => ctx.checkDeath(pid, sl)); }); },
};

// ═══════════════════════════════════════════
//  ATTACK EFFECT HANDLERS
// ═══════════════════════════════════════════
const PRE_ATTACK_EFFECT_HANDLERS = {
  flank_atk2: (ctx) => { if (ctx.targetSlot !== "leader" && !isFacing(ctx.attackerSlot, ctx.targetSlot)) { ctx.addLog("🦀 クラビィ: 正面にいない敵との交戦で攻撃力+2！"); return 2; } return 0; },
  attack_mill2: (ctx) => { const n = ctx.millCards(ctx.opp, 2); if (n > 0) ctx.addLog("📤 ザンギブル: 相手山札" + n + "枚墓地へ！"); return 0; },
  summon_bonkers: (ctx) => { ctx.addLog("🔨 ボンカース: 攻撃時ATK+3！"); return 3; },
};

const POST_ATTACK_EFFECT_HANDLERS = {
  attack_self_mill2: (ctx) => { const n = ctx.millCards(ctx.ap, 2); if (n > 0) ctx.addLog("📤 スターマン: 自分の山札" + n + "枚破棄！"); },
  bomber: (ctx) => { if (ctx.player.board[ctx.attackerSlot]) { ctx.player.board[ctx.attackerSlot].currentHp = 0; ctx.addLog("💣 ボンバー: 攻撃後に自壊！"); ctx.checkDeath(ctx.ap, ctx.attackerSlot); } },
  rololo_rarara: (ctx) => { if (checkLink(ctx.s, ctx.ap, ctx.attackerSlot, "Green", 3)) { if (ctx.drawCard(ctx.ap)) ctx.addLog("🎵 ロロロとラララ: 【リンクIII】攻撃時カードを1枚引いた！"); } },
};

// ═══════════════════════════════════════════
//  GAME REDUCER
// ═══════════════════════════════════════════
function gameReducer(state, action) {
  const s = JSON.parse(JSON.stringify(state));
  const ap = s.activePlayer;
  const player = s.players[ap];
  const opp = opponent(ap);
  const ep = s.players[opp];

  const addLog = (m) => { s.log = [m, ...s.log].slice(0, 40); s.fullLog = [...(s.fullLog || []), m]; };
  const damageLeader = (targetPlayerId, amount) => { const tp = s.players[targetPlayerId]; if (amount <= 0) return 0; if (tp.leaderShield) { tp.leaderShield = false; addLog("🪨 石ころへんしん: ダメージ無効化！"); return 0; } let dmg = amount; if (tp.heroShield) dmg = Math.max(0, dmg - 1); if (dmg <= 0) return 0; tp.leaderHp -= dmg; return dmg; };
  const drawCard = (p) => { const pl = s.players[p]; if (pl.deck.length > 0 && pl.hand.length < 8) { pl.hand.push(pl.deck.shift()); return true; } return false; };
  const triggerOnDamage = (pid, slot) => { const u = s.players[pid].board[slot]; if (!u) return; if (u.effect === "on_damage_food" && s.players[pid].hand.length < 8) { s.players[pid].hand.push({...TOKEN_FOOD}); addLog("🍎 サンドバッグさん: たべものを手札に！"); } if (u.effect === "on_damage_waddle" && s.players[pid].hand.length < 8) { s.players[pid].hand.push({...CARD_POOL.find(c => c.id === 1)}); addLog("🛡️ アーマーワドルディ: ワドルディを手札に！"); } };
  const SPAWN_PRIORITY = ["frontCenter", "frontLeft", "frontRight", "midCenter", "backLeft", "backRight"];
  const spawnUnit = (p, card, targetSlot) => { if (targetSlot) { if (s.players[p].board[targetSlot]) return null; } else { targetSlot = SPAWN_PRIORITY.find(sl => !s.players[p].board[sl]); if (!targetSlot) return null; } const isTriple = card.keywords && card.keywords.includes("triple_attack"); s.players[p].board[targetSlot] = { ...card, currentHp: card.hp, currentAttack: card.attack, baseAttack: card.origAttack ?? card.attack, baseHp: card.origHp ?? card.hp, hasAttacked: false, summonedThisTurn: true, canAttackLeader: false, frozen: false, hasActed: false, attacksLeft: isTriple ? 3 : undefined, guardCharges: initGuardCharges(card) }; refreshLinkKeywords(); return targetSlot; };
  const millCards = (targetPlayer, count) => {
    const pl = s.players[targetPlayer]; const oppOfTarget = opponent(targetPlayer); let n = 0;
    for (let i = 0; i < count && pl.deck.length > 0; i++) {
      const card = pl.deck.shift(); n++;
      pl.millCount = (pl.millCount || 0) + 1;
      addToGraveyard(targetPlayer, card);
      if (card.effect === "summon_and_discard_2dmg" || card.effect === "death_and_discard_draw") { triggerDiscardEffect(card, targetPlayer, "破棄"); }
      if (card.effect === "gabriel" && pl.hand.length < 8) { const gc = CARD_POOL.find(c => c.id === card.id); if (gc) { pl.hand.push({ ...gc, origAttack: gc.attack, origHp: gc.hp }); addLog("🦈 ガブリエル: 山札から破棄され手札に加わった！"); } }
    }
    return n;
  };

  function refreshLinkKeywords() {
    ["p1", "p2"].forEach(pid => {
      UNIT_SLOTS.forEach(sl => {
        const u = s.players[pid].board[sl];
        if (!u) return;
        const cardDef = CARD_POOL.find(c => c.id === u.id);
        if (!cardDef?.linkKeywords) return;
        cardDef.linkKeywords.forEach(({ attr, count, keyword }) => {
          const hasLink = checkLink(s, pid, sl, attr, count);
          const hasKw = u.keywords.includes(keyword);
          if (hasLink && !hasKw) u.keywords.push(keyword);
          else if (!hasLink && hasKw) u.keywords = u.keywords.filter(k => k !== keyword);
        });
      });
    });
  }

  function checkDeath(p, slot) {
    const unit = s.players[p].board[slot]; if (!unit || unit.currentHp > 0) return;
    const owner = p; const oppOf = opponent(p);
    s.players[p].board[slot] = null;
    addLog("💀 " + unit.name + " が倒れた！");
    addToGraveyard(p, unit);
    s.players[p].friendlyDeathCount = (s.players[p].friendlyDeathCount || 0) + 1;
    const handler = DEATH_EFFECT_HANDLERS[unit.effect];
    if (handler) { handler({ s, p, slot, unit, owner, oppOf, addLog, drawCard, spawnUnit, checkDeath, triggerOnDamage, dealDamage, checkLink, damageLeader }); }
    refreshLinkKeywords();
  }

  function addToGraveyard(pid, card) {
    s.players[pid].graveyard.push({ id: card.id, name: card.name, attr: card.attr, type: card.type, isToken: card.isToken || false });
  }

  function checkWin() { if (s.players.p1.leaderHp <= 0) { s.phase = "gameOver"; s.winner = "p2"; } if (s.players.p2.leaderHp <= 0) { s.phase = "gameOver"; s.winner = "p1"; } }

  function dealDamage(pid, slot, amount, skipDeath) {
    const u = s.players[pid].board[slot];
    if (!u) return 0;
    let d = applyGuard(u, amount);
    if (s.players[pid].heroShield && ["backLeft", "backRight", "midCenter"].includes(slot)) d = Math.max(0, d - 1);
    u.currentHp -= d;
    if (d > 0) triggerOnDamage(pid, slot);
    if (!skipDeath) checkDeath(pid, slot);
    return d;
  }

  function triggerDiscardEffect(card, ownerId, label) {
    const oppId = opponent(ownerId);
    if (card.effect === "summon_and_discard_2dmg") {
      const es = UNIT_SLOTS.filter(sl => s.players[oppId].board[sl]);
      if (es.length > 0) { const t = rand(es); const name = s.players[oppId].board[t]?.name; const d = dealDamage(oppId, t, 2); addLog("🌊 バラクー(" + label + "): " + name + "に" + d + "ダメ！"); }
      else { addLog("🌊 バラクー(" + label + "): 敵ヘルパーがいない！"); }
    }
    if (card.effect === "death_and_discard_draw") { if (drawCard(ownerId)) addLog("📥 スクイッシー(" + label + "): カード1枚引いた！"); else addLog("📥 スクイッシー(" + label + "): ドローできず！"); }
    if (card.effect === "discard_spawn_self") { const sl = spawnUnit(ownerId, card); if (sl) addLog("🐟 ブリッパー(" + label + "): 場に出た！"); }
  }

  function applySummonEffects(card, slot) { const handler = SUMMON_EFFECT_HANDLERS[card.effect]; if (handler) { handler({ s, ap, opp, player, ep, slot, card, addLog, drawCard, spawnUnit, checkDeath, triggerOnDamage, dealDamage, millCards, checkLink, damageLeader }); } }

  function hasValidTargets(card) { const tm = card.targetMode; if (!tm) return false; if (tm === "enemy_any") return true; if (tm === "enemy_helper") return getEnemyHelperSlots(s, ap).length > 0; if (tm === "enemy_helper_damaged") return UNIT_SLOTS.some(sl => ep.board[sl] && ep.board[sl].currentHp < ep.board[sl].hp); if (tm === "friendly_red") return UNIT_SLOTS.some(sl => player.board[sl] && player.board[sl].attr === "Red"); if (tm === "friendly_any") return true; if (tm === "choice_dynablade") return true; if (tm === "any_empty_slot") return getEmptyUnitSlots(s, ap).length > 0 || getEmptyUnitSlots(s, opp).length > 0; if (tm === "enemy_empty_slot") return getEmptyUnitSlots(s, opp).length > 0; if (tm === "friendly_empty") return getEmptyUnitSlots(s, ap).length > 0; return false; }

  function resolveTargetedEffect(effect, summonSlot, targetPlayer, targetSlot) { const handler = TARGETED_SUMMON_EFFECT_HANDLERS[effect]; if (handler) { const tp = s.players[targetPlayer]; handler({ s, ap, player, tp, targetPlayer, targetSlot, summonSlot, addLog, drawCard, checkDeath, triggerOnDamage, dealDamage, spawnUnit, checkLink, damageLeader }); } }

  switch (action.type) {
    case "START_TURN": {
      s.turn += 1; player.maxMana = Math.min(10, player.maxMana + 1); player.mana = player.maxMana; player.usedSupportThisTurn = false; player.usedWazaThisTurn = false; player.transformedThisTurn = false; player.sparkBarrier = false; if (player.heroShieldCooldown > 0) player.heroShieldCooldown -= 1; if (player.ice3Cooldown > 0) player.ice3Cooldown -= 1; if (player.leaderFrozen) { player.usedWazaThisTurn = true; addLog("🧊 リーダーの凍結！このターンはワザを使えない"); } s.showWazaPanel = false;
      if (player.supportCooldowns) { const returning = []; player.supportCooldowns = player.supportCooldowns.filter(cd => { cd.turnsLeft -= 1; if (cd.turnsLeft <= 0) { returning.push(cd.card); return false; } return true; }); returning.forEach(c => { if (player.hand.length < 8) { player.hand.push(c); addLog("🔄 " + c.name + " が手札に戻った！"); } else { addLog("🔄 " + c.name + ": 手札上限で戻れず！"); } }); }
      if (player.deck.length > 0) { if (!drawCard(ap)) addLog("💨 手札上限！"); else addLog("📥 P" + (ap==="p1"?1:2) + " がカードを引いた"); } else { s.phase = "gameOver"; s.winner = opp; addLog("⚠️ デッキ切れ！"); }
      UNIT_SLOTS.forEach(slot => { const u = player.board[slot]; if (u) { u.hasAttacked = false; if (u.keywords.includes("triple_attack")) u.attacksLeft = 3; if (u.summonedThisTurn && u.keywords.includes("dash1")) { u.canAttackLeader = true; } u.summonedThisTurn = false; } });
      UNIT_SLOTS.forEach(slot => { const u = player.board[slot]; if (!u) return; const startHandler = STARTTURN_EFFECT_HANDLERS[u.effect]; if (startHandler) { startHandler({ s, ap, opp, slot, u, player, ep, addLog, spawnUnit, checkDeath, triggerOnDamage, dealDamage, checkLink, damageLeader }); } });
      s.turnStarted = true; addLog("── ターン" + s.turn + ": P" + (ap==="p1"?1:2) + " ──"); checkWin(); return s;
    }
    case "SUMMON": {
      const { cardIndex, slot } = action; const card = player.hand[cardIndex]; if (!card || card.type !== "helper") return state;
      let cost = card.cost; if (player.costReduction > 0) { cost = Math.max(0, cost - player.costReduction); player.costReduction = 0; }
      if (card.effect === "gabriel") cost = Math.max(0, cost - (player.millCount || 0));
      if (card.effect === "galactic_knight" && player.graveyard.length >= 20) cost = Math.max(0, cost - 20);
      if (cost > player.mana) return state; if (!UNIT_SLOTS.includes(slot) || player.board[slot]) return state;
      player.mana -= cost; player.hand.splice(cardIndex, 1);
      const isTripleAtk = card.keywords && card.keywords.includes("triple_attack");
      player.board[slot] = { ...card, currentHp: card.hp, currentAttack: card.attack, baseAttack: card.origAttack ?? card.attack, baseHp: card.origHp ?? card.hp, hasAttacked: false, summonedThisTurn: true, canAttackLeader: false, frozen: false, hasActed: false, readyToExplode: card.effect === "start_explode3", immuneThisTurn: card.effect === "summon_immune", attacksLeft: isTripleAtk ? 3 : undefined, guardCharges: initGuardCharges(card) };
      refreshLinkKeywords();
      addLog("✨ " + card.name + " を " + SLOT_LABELS[slot] + " に召喚！" + (cost < card.cost ? "(コスト" + cost + "に軽減)" : ""));
      applySummonEffects(card, slot);
      if (card.targetMode && hasValidTargets(card) && !(card.effect === "summon_dedede" && player.mana === 0)) { s.pendingSummonEffect = { effect: card.effect, slot, targetMode: card.targetMode, cardName: card.name }; addLog("🎯 " + card.name + "の対象を選んでください"); } else if (card.targetMode && !(card.effect === "summon_dedede" && player.mana === 0)) { addLog("❌ " + card.name + ": 有効な対象なし"); } else if (card.effect === "summon_dedede" && player.mana === 0) { addLog("❌ デデデ大王: PP0のため対象なし"); }
      checkWin(); return s;
    }
    case "RESOLVE_SUMMON_EFFECT": { const { targetPlayer, targetSlot } = action; const pending = s.pendingSummonEffect; if (!pending) return state; resolveTargetedEffect(pending.effect, pending.slot, targetPlayer, targetSlot); s.pendingSummonEffect = null; checkWin(); return s; }
    case "CANCEL_SUMMON_EFFECT": { s.pendingSummonEffect = null; addLog("⏩ 効果をスキップ"); return s; }
    case "ATTACK": {
      const { attackerSlot, targetSlot } = action; const attacker = player.board[attackerSlot];
      const isTriple = attacker && attacker.keywords && attacker.keywords.includes("triple_attack");
      if (!attacker || attacker.frozen) return state;
      if (isTriple ? (attacker.attacksLeft <= 0) : attacker.hasAttacked) return state;
      if (attacker.summonedThisTurn && !attacker.keywords.includes("dash1") && !attacker.keywords.includes("dash2")) return state;
      if (attacker.keywords.includes("immobile")) return state;
      if (attacker.effect === "no_attack") return state;
      if (attacker.effect === "no_atk_full_hp" && attacker.currentHp >= attacker.hp) return state;
      let atkPower = getEffectiveAttack(attacker, s); attacker.hasActed = true;
      const preAtkHandler = PRE_ATTACK_EFFECT_HANDLERS[attacker.effect];
      if (preAtkHandler) { atkPower += preAtkHandler({ s, ap, opp, player, ep, attacker, attackerSlot, targetSlot, addLog, checkDeath, millCards, checkLink }); }
      if (targetSlot === "leader") {
        if (atkPower <= 0) { addLog("⚔️ " + attacker.name + " → 敵リーダーに0ダメ！"); }
        else if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: ダメージ無効化！"); }
        else { const hsDmg = ep.heroShield ? Math.max(0, atkPower - 1) : atkPower; ep.leaderHp -= hsDmg; addLog("⚔️ " + attacker.name + " → 敵リーダーに" + hsDmg + "ダメ！"); }
        if (isTriple) { attacker.attacksLeft -= 1; if (attacker.attacksLeft <= 0) attacker.hasAttacked = true; } else { attacker.hasAttacked = true; }
        if (ep.sparkBarrier && player.board[attackerSlot] && !unitHasFlying2(attacker)) {
          const barrierDmg = applyGuard(attacker, 1);
          attacker.currentHp -= barrierDmg;
          addLog("⚡ スパークバリア: " + attacker.name + "に" + barrierDmg + "反撃ダメージ！");
          if (barrierDmg > 0) triggerOnDamage(ap, attackerSlot);
          checkDeath(ap, attackerSlot);
        }
      } else {
        const target = ep.board[targetSlot]; if (!target) return state;
        let tgtPower = getEffectiveAttack(target, s);
        if (target.effect === "flank_atk2" && !isFacing(attackerSlot, targetSlot)) { tgtPower += 2; addLog("🦀 クラビィ: 正面にいない敵との交戦で攻撃力+2！"); }
        const dmgToTarget = applyGuard(target, atkPower);
        const dmgToAttacker = unitHasFlying2(attacker) ? 0 : applyGuard(attacker, tgtPower);
        const LEADER_ADJ2 = ["backLeft", "backRight", "midCenter"];
        const actualDmgToTarget = (ep.heroShield && LEADER_ADJ2.includes(targetSlot)) ? Math.max(0, dmgToTarget - 1) : dmgToTarget;
        const actualDmgToAttacker = (player.heroShield && LEADER_ADJ2.includes(attackerSlot)) ? Math.max(0, dmgToAttacker - 1) : dmgToAttacker;
        target.currentHp -= actualDmgToTarget; attacker.currentHp -= actualDmgToAttacker;
        if (unitHasFlying2(attacker)) { addLog("⚔️ " + attacker.name + "(" + actualDmgToTarget + ") → " + target.name + " (🪽🪽反撃なし)"); }
        else { addLog("⚔️ " + attacker.name + "(" + actualDmgToTarget + ") ⇄ " + target.name + "(" + actualDmgToAttacker + ")"); }
        if (isTriple) { attacker.attacksLeft -= 1; if (attacker.attacksLeft <= 0) attacker.hasAttacked = true; } else { attacker.hasAttacked = true; }
        if (actualDmgToTarget > 0) triggerOnDamage(opp, targetSlot);
        if (actualDmgToAttacker > 0) triggerOnDamage(ap, attackerSlot);
        if (attacker.keywords.includes("pierce1")) { const behindSlot = BEHIND_MAP[targetSlot]; if (behindSlot) { if (behindSlot === "base") { if (dmgToTarget <= 0) { /* 0ダメなので貫通なし */ } else if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: 貫通ダメージ無効化！"); } else { const pHsDmg = ep.heroShield ? Math.max(0, dmgToTarget - 1) : dmgToTarget; ep.leaderHp -= pHsDmg; addLog("🔱 貫通: 敵リーダーにも" + pHsDmg + "ダメ！"); } } else if (ep.board[behindSlot]) { const behindName = ep.board[behindSlot].name; const pierceDmg = dealDamage(opp, behindSlot, dmgToTarget); addLog("🔱 貫通: " + behindName + "にも" + pierceDmg + "ダメ！"); } } }
        checkDeath(opp, targetSlot); checkDeath(ap, attackerSlot);
      }
      const postAtkHandler = POST_ATTACK_EFFECT_HANDLERS[attacker.effect];
      if (postAtkHandler) { postAtkHandler({ s, ap, opp, player, ep, attacker, attackerSlot, targetSlot, addLog, checkDeath, checkLink, damageLeader, millCards, drawCard }); }
      checkWin(); return s;
    }
    case "CAST_SPELL": {
      const { cardIndex, targetPlayer, targetSlot } = action; const card = player.hand[cardIndex]; if (!card || card.type !== "spell") return state;
      let cost = card.cost; if (player.costReduction > 0) { cost = Math.max(0, cost - player.costReduction); player.costReduction = 0; }
      if (card.effect === "snowball_debuff" && UNIT_SLOTS.some(sl => player.board[sl] && player.board[sl].effect === "goliath")) cost = Math.max(0, cost - 1);
      if (cost > player.mana) return state; player.mana -= cost; player.hand.splice(cardIndex, 1);
      const spellHandler = SPELL_EFFECT_HANDLERS[card.effect];
      if (spellHandler) { spellHandler({ s, ap, opp, player, ep, card, targetPlayer, targetSlot, addLog, drawCard, checkDeath, triggerOnDamage, dealDamage, checkLink, damageLeader }); }
      if (card.isSupport) player.usedSupportThisTurn = true;
      else addToGraveyard(ap, card);
      checkWin(); return s;
    }
    case "RESOLVE_KAIN": { if (!s.pendingKain) return state; const { cardIndex } = action; const card = player.hand[cardIndex]; if (!card) return state; player.hand.splice(cardIndex, 1); player.deck.push(card); addLog("🐟 カイン: " + card.name + "をデッキに戻した"); if (drawCard(ap)) addLog("🐟 カイン: カード1枚引いた！"); s.pendingKain = false; return s; }
    case "CANCEL_KAIN": { s.pendingKain = false; addLog("⏩ カインをスキップ"); return s; }
    case "RESOLVE_KUU_HELPER": { if (!s.pendingKuu || s.pendingKuu.phase !== "selectHelper") return state; const { slot } = action; const unit = player.board[slot]; if (!unit) return state; s.pendingKuu = { phase: "selectDest", sourceSlot: slot }; addLog("🦉 クー: " + unit.name + "の移動先を選んでください"); return s; }
    case "RESOLVE_KUU_DEST": { if (!s.pendingKuu || s.pendingKuu.phase !== "selectDest") return state; const { slot } = action; const source = s.pendingKuu.sourceSlot; if (slot === source) { s.pendingKuu = null; return s; } const sourceUnit = player.board[source]; const destUnit = player.board[slot]; if (destUnit) { player.board[source] = destUnit; player.board[slot] = sourceUnit; addLog("🦉 クー: " + sourceUnit.name + "と" + destUnit.name + "を入れ替えた！"); } else { player.board[slot] = sourceUnit; player.board[source] = null; addLog("🦉 クー: " + sourceUnit.name + "を" + SLOT_LABELS[slot] + "に移動！"); } s.pendingKuu = null; return s; }
    case "CANCEL_KUU": { s.pendingKuu = null; addLog("⏩ クーをスキップ"); return s; }
    case "RESOLVE_TWISTER_DISCARD": { if (!s.pendingTwisterDiscard) return state; const { cardIndex } = action; const card = player.hand[cardIndex]; if (!card) return state; player.hand.splice(cardIndex, 1); addToGraveyard(ap, card); player.millCount = (player.millCount || 0) + 1; addLog("🌪️ ツイスター: " + card.name + "を捨てた！"); triggerDiscardEffect(card, ap, "捨"); s.pendingTwisterDiscard = false; checkWin(); return s; }
    case "CANCEL_TWISTER_DISCARD": { if (s.pendingTwisterDiscard && player.hand.length > 0) { const di = Math.floor(Math.random() * player.hand.length); const dc = player.hand.splice(di, 1)[0]; addToGraveyard(ap, dc); player.millCount = (player.millCount || 0) + 1; addLog("🌪️ ツイスター: " + dc.name + "をランダムに捨てた"); triggerDiscardEffect(dc, ap, "捨"); } s.pendingTwisterDiscard = false; return s; }
    case "END_TURN": {
      UNIT_SLOTS.forEach(sl => { const u = player.board[sl]; if (u && u.frozen) { u.frozen = false; addLog("🧊 " + u.name + "の凍結が解けた"); } if (u && u.immuneThisTurn) { u.immuneThisTurn = false; } });
      if (player.leaderFrozen) { player.leaderFrozen = false; addLog("🧊 リーダーの凍結が解けた"); }
      if (ep.heroShield) { ep.heroShield = false; addLog("🛡️ ヒーローシールドが消えた"); }
      if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: バリアが消えた"); }
      UNIT_SLOTS.forEach(sl => { const u = player.board[sl]; if (!u) return; const endHandler = ENDTURN_EFFECT_HANDLERS[u.effect]; if (endHandler) { endHandler({ s, ap, opp, sl, u, player, ep, addLog, drawCard, spawnUnit, checkDeath, triggerOnDamage, dealDamage, millCards, checkLink, damageLeader }); } });
      [ap, opp].forEach(pid => { UNIT_SLOTS.forEach(sl => { const u = s.players[pid].board[sl]; if (u && u.effect === "endturn_starblock_decay") { u.currentHp -= 1; if (u.currentHp <= 0) { addToGraveyard(pid, u); s.players[pid].board[sl] = null; addLog("⭐ 星ブロックが崩れた"); } } if (u && u.effect === "bomb_unit") { u.currentHp -= 1; addLog("💣 ばくだん: 自身に1ダメージ(HP" + u.currentHp + ")"); if (u.currentHp <= 0) checkDeath(pid, sl); } }); });
      if (player.currentCopy && player.currentCopy.id === "C13") { player.hammerFireDmg = (player.hammerFireDmg || 1) + 1; addLog("🔨 おにごろし火炎ハンマー: ダメージが" + player.hammerFireDmg + "に上昇！"); }
      if (player.currentCopy && player.currentCopy.id === "C14") { player.sleepTurns -= 1; if (player.sleepTurns <= 0) { player.currentCopy = null; player.wazaStocks = {}; player.sleepTurns = 0; addLog("💤 スリープ: 目が覚めた！コピー能力が解除された"); } else { addLog("💤 スリープ: あと" + player.sleepTurns + "ターン…Zzz"); } }
      checkWin();
      if (s.phase === "gameOver") { s.phase = "gameOver"; return s; }
      const galacticSlot = UNIT_SLOTS.find(sl => player.board[sl] && player.board[sl].effect === "galactic_knight");
      if (galacticSlot) {
        s.pendingGalactica = { remaining: 12, ownerPlayerId: ap };
        addLog("🌌 ギャラクティックナイト: ランダムマスに2ダメ×12！");
        return s;
      }
      s.phase = "passDevice"; s.activePlayer = opp; s.turnStarted = false; addLog("🔄 ターン終了 → P" + (opp==="p1"?1:2) + "の番"); return s;
    }
    case "CONFIRM_PASS": { s.phase = "playing"; return s; }
    case "TRANSFORM": { const { cardIndex } = action; const card = player.hand[cardIndex]; if (!card || !card.lineage) return state; if (player.currentCopy && player.currentCopy.id === "C14") { addLog("💤 スリープ中は変身できない！"); return s; } const copyId = LINEAGE_TO_COPY[card.lineage]; if (!copyId) { addLog("❌ この系統にはコピー能力がありません"); return s; } const ability = COPY_ABILITIES[copyId]; if (!ability) return state; player.hand.splice(cardIndex, 1); player.currentCopy = { ...ability }; const stocks = {}; ability.wazas.forEach(w => { stocks[w.id] = w.maxStock; }); player.wazaStocks = stocks; player.transformedThisTurn = true; player.sparkLaserBonus = 0; player.hammerFireDmg = 1; player.leaderAtkBonus = 0; if (copyId === "C14") { player.sleepTurns = 2; } s.showWazaPanel = false; addLog("🌟 " + card.name + " をコピー！→【" + ability.name + "】に変身！"); checkWin(); return s; }
    case "TOGGLE_WAZA_PANEL": { s.showWazaPanel = !s.showWazaPanel; return s; }
    case "USE_WAZA": {
      const { wazaId } = action; if (!player.currentCopy || player.usedWazaThisTurn) return state;
      const waza = player.currentCopy.wazas.find(w => w.id === wazaId); if (!waza) return state;
      if ((player.wazaStocks[wazaId] || 0) <= 0) return state;
      let cost = waza.cost;
      if (wazaId === "ice1" && checkLink(s, ap, "base", "White", 1)) cost = Math.max(0, cost - 1);
      if (cost > player.mana) return state;
      if (waza.targetMode === "not_implemented") { addLog("❌ このワザは未実装です"); return s; }
      if (wazaId === "beam3" && player.transformedThisTurn) { addLog("❌ はどうビーム: コピーしたターン中は使用できない！"); return s; }
      if (wazaId === "cutter2" && player.transformedThisTurn) { addLog("❌ ハイパーブーメラン: コピーしたターン中は使用できない！"); return s; }
      if (wazaId === "sword4" && player.heroShieldCooldown > 0) { addLog("❌ ヒーローシールド: 連続使用不可！"); return s; }
      if (wazaId === "ice3" && player.ice3Cooldown > 0) { addLog("❌ こちこちスプリンクラー: 連続使用不可！"); return s; }
      if (waza.targetMode === "enemy_helper" && getEnemyHelperSlots(s, ap).length === 0) { addLog("❌ " + waza.name + ": 対象となる敵ヘルパーがいない！"); return s; }
      if (waza.targetMode === "any_helper" && !UNIT_SLOTS.some(sl => player.board[sl] || ep.board[sl])) { addLog("❌ " + waza.name + ": 対象となるヘルパーがいない！"); return s; }
      if (waza.targetMode === "enemy_helper_atk3_or_less" && !UNIT_SLOTS.some(sl => ep.board[sl] && getEffectiveAttack(ep.board[sl], s) <= 3)) { addLog("❌ " + waza.name + ": ATK3以下の敵ヘルパーがいない！"); return s; }
      if (waza.targetMode === "enemy_empty_slot" && getEmptyUnitSlots(s, opp).length === 0) { addLog("❌ " + waza.name + ": 相手の空きマスがない！"); return s; }
      if (waza.targetMode === "enemy_front_empty_slot" && !["frontLeft", "frontCenter", "frontRight"].some(sl => !ep.board[sl])) { addLog("❌ " + waza.name + ": 相手の前列に空きマスがない！"); return s; }
      if (waza.targetMode === "attack" && getValidLeaderAttackTargets(s, ap).length === 0) { addLog("❌ " + waza.name + ": 攻撃対象がいない！"); return s; }
      if (waza.targetMode === "friendly_helper" && !UNIT_SLOTS.some(sl => player.board[sl])) { addLog("❌ " + waza.name + ": 味方ヘルパーがいない！"); return s; }
      player.mana -= cost; player.wazaStocks[wazaId] -= 1; player.usedWazaThisTurn = true; s.showWazaPanel = false;
      // usedCopyTypesを追跡（全ワザ対象）
      { const copyType = wazaId.replace(/\d+$/, ""); if (!player.usedCopyTypes.includes(copyType)) player.usedCopyTypes.push(copyType); }
      if (wazaId === "leaf1") {
        const b = getWazaDmgBonus(player); const total = 3 + b;
        s.pendingSpread = { remaining: total, targetPlayerId: opp, sourceName: "リーフカッター", sourceEmoji: "🍃" };
        addLog("🍃 リーフカッター: 合計" + total + "ダメをランダムに分配！");
      } else if (wazaId === "beam2") {
        const total = player.usedCopyTypes.length;
        if (total === 0) { addLog("📡 ビームマシンガン: 0ダメージ（コピー能力未使用）"); }
        else { s.pendingSpread = { remaining: total, targetPlayerId: opp, sourceName: "ビームマシンガン", sourceEmoji: "📡" }; addLog("📡 ビームマシンガン: 合計" + total + "ダメをランダムに分配！"); }
      } else if (waza.targetMode === "none") { const handler = WAZA_HANDLERS[wazaId]; if (handler) handler({ s, ap, opp, player, ep, addLog, drawCard, checkDeath, triggerOnDamage, dealDamage, spawnUnit, millCards, checkLink, damageLeader }); }
      else if (waza.targetMode === "attack") { s.pendingWaza = { wazaId, waza, targetMode: "attack" }; addLog("🎯 " + waza.name + "の攻撃対象を選んでください"); }
      else { s.pendingWaza = { wazaId, waza, targetMode: waza.targetMode }; addLog("🎯 " + waza.name + "の対象を選んでください"); }
      checkWin(); return s;
    }
    case "RESOLVE_WAZA_TARGET": { const { targetPlayer, targetSlot } = action; const pending = s.pendingWaza; if (!pending) return state; if (pending.targetMode === "attack") { if (pending.wazaId === "water1" && targetSlot !== "leader" && checkLink(s, ap, "base", "Blue", 1)) { const t = ep.board[targetSlot]; if (t) { t.currentAttack = Math.max(0, t.currentAttack - 2); addLog("💧 ウェーブショット: 【リンク:青I】" + t.name + "のATK-2！"); } } resolveLeaderAttack(s, ap, opp, pending.waza, targetSlot, addLog, triggerOnDamage, checkDeath); if (pending.wazaId === "cutter2") { const b = getWazaDmgBonus(player); const LEADER_ADJ_SLOTS = ["backLeft", "backRight", "midCenter"]; const adjSlots = targetSlot === "leader" ? LEADER_ADJ_SLOTS : (HEX_ADJACENCY[targetSlot] || []); const adjEnemies = adjSlots.filter(sl => ep.board[sl]); if (adjEnemies.length > 0) { const pick = rand(adjEnemies); const name = ep.board[pick]?.name; const d = dealDamage(opp, pick, 3 + b); addLog("✂️ ハイパーブーメラン: " + name + "に" + (3+b) + "ダメ！"); } } } else { const handler = WAZA_HANDLERS[pending.wazaId]; if (handler) handler({ s, ap, opp, player, ep, targetPlayer, targetSlot, addLog, drawCard, checkDeath, triggerOnDamage, dealDamage, spawnUnit, millCards, checkLink, damageLeader }); } s.pendingWaza = null; checkWin(); return s; }
    case "CANCEL_WAZA": { s.pendingWaza = null; addLog("⏩ ワザをキャンセル"); return s; }
    case "RESOLVE_WATER_DISCARD": {
      if (!s.pendingWaterDiscard) return state; const { cardIndex } = action; const card = player.hand[cardIndex]; if (!card) return state;
      player.hand.splice(cardIndex, 1); addToGraveyard(ap, card);
      player.millCount = (player.millCount || 0) + 1;
      triggerDiscardEffect(card, ap, "捨");
      if (s.pendingWaterDiscard.waza === "water2") { player.mana += 1; addLog("💧 ウォータークラウン: " + card.name + "を捨ててPP+1！"); }
      else if (s.pendingWaterDiscard.waza === "water3") { let n = 0; for (let i = 0; i < 3; i++) { if (drawCard(ap)) n++; } addLog("💧 レインボーレイン: " + card.name + "を捨てて" + n + "枚ドロー！"); }
      s.pendingWaterDiscard = null; checkWin(); return s;
    }
    case "CANCEL_WATER_DISCARD": { s.pendingWaterDiscard = null; addLog("⏩ スキップ"); return s; }
    case "SPREAD_TICK": {
      if (!s.pendingSpread) return state;
      const { remaining, targetPlayerId: tpid, sourceName, sourceEmoji, dmgPerHit, helpersOnly } = s.pendingSpread;
      const hitDmg = dmgPerHit || 1;
      const tp = s.players[tpid];
      const validHelpers = UNIT_SLOTS.filter(sl => tp.board[sl]);
      const allTargets = helpersOnly ? validHelpers : [...validHelpers, ...(tp.leaderHp > 0 ? ["leader"] : [])];
      if (allTargets.length > 0) {
        const t = rand(allTargets);
        if (t === "leader") {
          let dmg = hitDmg;
          if (tp.leaderShield) { tp.leaderShield = false; addLog("🪨 石ころへんしん: ダメージ無効化！"); dmg = 0; }
          else if (tp.heroShield) { dmg = Math.max(0, hitDmg - 1); }
          if (dmg > 0) { tp.leaderHp -= dmg; addLog(sourceEmoji + " " + sourceName + ": 敵リーダーに" + dmg + "ダメ！"); }
        } else {
          const name = tp.board[t]?.name;
          const d = dealDamage(tpid, t, hitDmg);
          checkDeath(tpid, t);
          if (d > 0) addLog(sourceEmoji + " " + sourceName + ": " + name + "に" + d + "ダメ！");
        }
        checkWin();
      }
      const newRemaining = remaining - 1;
      if (newRemaining <= 0 || s.phase === "gameOver") { s.pendingSpread = null; }
      else { s.pendingSpread = { ...s.pendingSpread, remaining: newRemaining }; }
      return s;
    }
    case "GALACTICA_TICK": {
      if (!s.pendingGalactica) return state;
      const { remaining: galRem, ownerPlayerId } = s.pendingGalactica;
      const oppOfOwner = opponent(ownerPlayerId);
      // ランダムな1マス（7マス: UNIT_SLOTS6 + leader）
      const ALL_TARGET_SLOTS = [...UNIT_SLOTS, "leader"];
      const hitSlot = rand(ALL_TARGET_SLOTS);
      const targetPl = s.players[oppOfOwner];
      const isMiss = hitSlot !== "leader" && !targetPl.board[hitSlot];
      if (isMiss) {
        addLog("🌌 ギャラクティックナイト: " + SLOT_LABELS[hitSlot] + " はMISS！");
        s.galacticaMissSeq = (s.galacticaMissSeq || 0) + 1;
        s.galacticaLastMiss = { seq: s.galacticaMissSeq, slot: hitSlot, targetPlayerId: oppOfOwner };
      } else if (hitSlot === "leader") {
        const dmg = damageLeader(oppOfOwner, 2);
        addLog("🌌 ギャラクティックナイト: 敵リーダーに" + dmg + "ダメ！");
      } else {
        const name = targetPl.board[hitSlot]?.name;
        const d = dealDamage(oppOfOwner, hitSlot, 2);
        addLog("🌌 ギャラクティックナイト: " + name + "に" + d + "ダメ！");
      }
      checkWin();
      const newGalRem = galRem - 1;
      if (newGalRem <= 0 || s.phase === "gameOver") {
        s.pendingGalactica = null;
        if (s.phase !== "gameOver") { s.phase = "passDevice"; s.activePlayer = oppOfOwner; s.turnStarted = false; addLog("🔄 ターン終了 → P" + (oppOfOwner==="p1"?1:2) + "の番"); }
      } else {
        s.pendingGalactica = { remaining: newGalRem, ownerPlayerId };
      }
      return s;
    }
    case "MULLIGAN": {
      const { playerId, returnIndices } = action;
      const pl = s.players[playerId];
      const sorted = [...returnIndices].sort((a, b) => b - a);
      const toReturn = sorted.map(i => pl.hand[i]).filter(Boolean);
      sorted.forEach(i => pl.hand.splice(i, 1));
      toReturn.forEach(c => pl.deck.push(c));
      for (let i = pl.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pl.deck[i], pl.deck[j]] = [pl.deck[j], pl.deck[i]]; }
      const drawCount = toReturn.length;
      for (let i = 0; i < drawCount && pl.deck.length > 0 && pl.hand.length < 8; i++) { pl.hand.push(pl.deck.shift()); }
      return s;
    }
    case "RESTART": { return createInitialState(); }
    case "RESTART_WITH_COLORS": { return createInitialState(action.p1Color, action.p2Color, action.p1Support, action.p2Support, action.p1Custom, action.p2Custom); }
    default: return state;
  }
}

// ═══════════════════════════════════════════
//  CARD INFO PANEL
// ═══════════════════════════════════════════
const LINEAGE_ICONS = { fire: "🔥", fighter: "👊", sword: "⚔️", spark: "⚡", leaf: "🍃", ice: "❄️", tornado: "🌪️", stone: "🪨", beam: "🔮", whip: "🪢", bomb: "💣", water: "💧", cutter: "✂️", waddle: "🟡", crash: "💥", beast: "🐾", hammer: "🔨", spear: "🔱", sleep: "💤" };

function CardInfoPanel({ unit, card, onClose }) {
  const data = unit || card;
  if (!data) return null;
  const isHandCard = !!card && !unit;
  const colors = ATTR_COLORS[data.attr] || ATTR_COLORS.Common;
  const atk = unit ? getEffectiveAttack(unit, null) : (data.attack ?? 0);
  const hp = isHandCard ? (data.hp ?? 0) : (unit ? unit.hp : 0);
  const baseAtk = unit ? (unit.baseAttack ?? unit.attack) : (data.origAttack ?? data.attack ?? 0);
  const baseHp = unit ? (unit.baseHp ?? unit.hp) : (data.origHp ?? data.hp ?? 0);
  const rarity = CARD_RARITY[data.id];
  const rarityInfo = rarity ? RARITY_LEVELS[rarity] : null;
  const isSpell = data.type === "spell";
  const kwIcons = data.keywords ? data.keywords.map(k => KEYWORD_ICONS[k] || "").join("") : "";
  return (
    <div style={{ position: "fixed", top: "10px", left: "10px", zIndex: 1000, width: "180px", borderRadius: "10px", overflow: "hidden", background: "linear-gradient(160deg, #1e293b, #0f172a)", border: "2px solid " + colors.border, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff" }}>
      <div style={{ background: "linear-gradient(135deg, " + colors.bg + ", " + colors.border + ")", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", fontWeight: "900", lineHeight: 1.2 }}>{isSpell ? "📜" : ""}{kwIcons}{data.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
            <span style={{ fontSize: "8px", opacity: 0.8 }}>No.{String(data.id).padStart(4,"0")}</span>
            {rarityInfo && <span style={{ color: rarityInfo.color, fontSize: "9px", textShadow: rarity === "UR" ? "0 0 4px " + rarityInfo.color : "none" }}>{Array(rarityInfo.stars).fill("★").join("")}</span>}
            {!isSpell && <span style={{ fontSize: "11px", fontWeight: "900" }}><span style={{ color: atk > baseAtk ? "#FFD700" : atk < baseAtk ? "#FF6B6B" : "#fff" }}>⚔{atk}</span> <span style={{ color: hp > baseHp ? "#FFD700" : "#fff" }}>❤{hp}</span></span>}
          </div>
        </div>
        <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "linear-gradient(135deg,#818CF8,#6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900", flexShrink: 0 }}>{data.cost}</div>
      </div>
      {data.desc && <div style={{ padding: "5px 10px 8px", fontSize: "11px", color: "rgba(255,255,255,0.85)", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{data.desc}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════
//  DECK SELECT SCREEN
// ═══════════════════════════════════════════
function DeckSelectScreen({ playerLabel, onSelectDefault, onSelectCustom, onCreateNew, onEditDeck, onDeleteDeck, savedDecks, loading }) {
  const screenBg = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", background: "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", padding: "24px 16px", gap: "16px" };
  const colorNames = { Red: "赤", Blue: "青", Green: "緑", White: "白", Orange: "橙" };
  const colorEmoji = { Red: "🔴", Blue: "🔵", Green: "🟢", White: "⚪", Orange: "🟠" };
  const colorThemes = { Red: "アグロ＆バーン", Blue: "速攻＆ばくだん", Green: "オールラウンダー", White: "デバフ＆凍結", Orange: "盤面制圧＆リンク" };
  const [menuDeck, setMenuDeck] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const longPressTimer = useRef(null);
  const handleTouchStart = useCallback((deck) => { longPressTimer.current = setTimeout(() => { setMenuDeck(deck); }, 700); }, []);
  const handleTouchEnd = useCallback(() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }, []);
  const handleBackdropClick = useCallback(() => { setMenuDeck(null); setConfirmDelete(null); }, []);
  return (
    <div style={screenBg}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: "40px" }}>⭐</div><h2 style={{ fontSize: "20px", fontWeight: "900", margin: "8px 0 4px" }}>{playerLabel} のデッキを選ぼう</h2></div>
      <button onClick={() => { if (savedDecks.length >= 10) return; onCreateNew(); }} disabled={savedDecks.length >= 10} style={{ width: "100%", maxWidth: "340px", padding: "14px", borderRadius: "14px", cursor: savedDecks.length >= 10 ? "default" : "pointer", opacity: savedDecks.length >= 10 ? 0.4 : 1, background: "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(96,165,250,0.05))", border: "2px dashed rgba(96,165,250,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}><span style={{ fontSize: "22px" }}>＋</span><span style={{ fontSize: "14px", fontWeight: "800", color: "#60A5FA" }}>{savedDecks.length >= 10 ? "デッキ上限に達しています" : "新しくデッキを作る"}</span></button>
      <div style={{ width: "100%", maxWidth: "340px", fontSize: "11px", fontWeight: "700", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "4px" }}>デフォルトデッキ</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", width: "100%", maxWidth: "340px" }}>{DECK_COLORS.map(color => { const c = ATTR_COLORS[color]; const cardCount = CARD_POOL.filter(card => card.attr === color).length; return (<button key={color} onClick={() => onSelectDefault(color)} style={{ padding: "14px 6px", borderRadius: "14px", background: "linear-gradient(150deg, " + c.light + ", " + c.border + ")", border: "3px solid " + c.border, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", boxShadow: "0 4px 14px " + c.bg + "33", transition: "transform 0.15s, box-shadow 0.15s" }}><span style={{ fontSize: "24px" }}>{colorEmoji[color]}</span><span style={{ fontSize: "14px", fontWeight: "900", color: c.bg }}>{colorNames[color]}</span><span style={{ fontSize: "9px", color: c.bg, opacity: 0.6, textAlign: "center", lineHeight: 1.3 }}>{colorThemes[color]}</span><span style={{ fontSize: "9px", color: c.bg, opacity: 0.45 }}>{cardCount}種 / 45枚</span></button>); })}</div>
      <div style={{ width: "100%", maxWidth: "340px", fontSize: "11px", fontWeight: "700", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "4px", marginTop: "4px" }}>マイデッキ {!loading && savedDecks.length > 0 && <span>({savedDecks.length}/10)</span>}</div>
      {loading ? (<div style={{ padding: "20px", textAlign: "center", fontSize: "12px", opacity: 0.4 }}>読み込み中...</div>) : savedDecks.length === 0 ? (<div style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>保存済みデッキはまだありません<br />「＋新しくデッキを作る」で作成しましょう</div>) : (<>{(menuDeck || confirmDelete) && <div onClick={handleBackdropClick} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.3)" }} />}<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", width: "100%", maxWidth: "340px", position: "relative", zIndex: menuDeck ? 60 : "auto" }}>{savedDecks.map((deck, i) => { const c = ATTR_COLORS[deck.color] || ATTR_COLORS.Common; const ce = { Red: "🔴", Blue: "🔵", Green: "🟢", White: "⚪", Orange: "🟠" }; const isMenuOpen = menuDeck && menuDeck._storageKey === deck._storageKey; return (<div key={deck._storageKey || i} style={{ position: "relative" }}><button onClick={() => { if (!menuDeck) onSelectCustom(deck); }} onTouchStart={() => handleTouchStart(deck)} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd} onMouseDown={() => handleTouchStart(deck)} onMouseUp={handleTouchEnd} onMouseLeave={handleTouchEnd} onContextMenu={(e) => { e.preventDefault(); setMenuDeck(deck); }} style={{ width: "100%", padding: "14px 6px", borderRadius: "14px", background: isMenuOpen ? "linear-gradient(150deg, #334155, #475569)" : "linear-gradient(150deg, #1e293b, #334155)", border: "2px solid " + (isMenuOpen ? c.border : c.border + "66"), cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", boxShadow: isMenuOpen ? "0 0 12px " + c.border + "44" : "0 2px 8px rgba(0,0,0,0.3)", transition: "all 0.15s" }}><span style={{ fontSize: "18px" }}>{ce[deck.color] || "🎴"}</span><span style={{ fontSize: "11px", fontWeight: "800", color: c.border, maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</span><span style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>{deck.totalCards}枚</span></button>{isMenuOpen && (<div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", zIndex: 100, marginTop: "4px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: "120px" }}><button onClick={(e) => { e.stopPropagation(); setMenuDeck(null); onEditDeck(deck); }} style={{ width: "100%", padding: "10px 16px", border: "none", background: "transparent", color: "#60A5FA", fontSize: "12px", fontWeight: "700", cursor: "pointer", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>✏️ 編集</button><button onClick={(e) => { e.stopPropagation(); setMenuDeck(null); setConfirmDelete(deck); }} style={{ width: "100%", padding: "10px 16px", border: "none", background: "transparent", color: "#F87171", fontSize: "12px", fontWeight: "700", cursor: "pointer", textAlign: "left" }}>🗑️ 削除</button></div>)}</div>); })}</div></>)}
      {confirmDelete && (<div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ background: "linear-gradient(160deg, #1e293b, #0f172a)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "16px", padding: "24px", maxWidth: "280px", width: "90%", textAlign: "center" }}><div style={{ fontSize: "28px", marginBottom: "8px" }}>🗑️</div><div style={{ fontSize: "14px", fontWeight: "800", marginBottom: "6px" }}>「{confirmDelete.name}」を削除しますか？</div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>この操作は取り消せません</div><div style={{ display: "flex", gap: "10px", justifyContent: "center" }}><button onClick={() => setConfirmDelete(null)} style={{ padding: "10px 24px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>キャンセル</button><button onClick={() => { onDeleteDeck(confirmDelete._storageKey); setConfirmDelete(null); }} style={{ padding: "10px 24px", borderRadius: "12px", background: "linear-gradient(135deg, #DC2626, #B91C1C)", border: "none", color: "#fff", fontSize: "12px", fontWeight: "900", cursor: "pointer", boxShadow: "0 4px 12px rgba(220,38,38,0.3)" }}>削除する</button></div></div></div>)}
    </div>
  );
}

// ═══════════════════════════════════════════
//  DECK EDIT SCREEN
// ═══════════════════════════════════════════
function DeckEditScreen({ initialData, onSave, onBack }) {
  const [selectedColor, setSelectedColor] = useState(initialData ? initialData.color : null);
  const [counts, setCounts] = useState(initialData ? { ...initialData.counts } : {});
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [activeTab, setActiveTab] = useState("color");
  const [deckName, setDeckName] = useState(initialData ? initialData.name : "");
  const [showNameInput, setShowNameInput] = useState(false);
  const [showDeckPreview, setShowDeckPreview] = useState(false);
  const [winW, setWinW] = useState(typeof window !== "undefined" ? window.innerWidth : 400);
  useEffect(() => { const onResize = () => setWinW(window.innerWidth); window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize); }, []);
  const vw = (min, pct, max) => Math.min(max, Math.max(min, winW * pct / 100));
  const totalCards = Object.values(counts).reduce((a, b) => a + b, 0);
  const getTabCards = useCallback(() => { let cards; if (activeTab === "color") cards = CARD_POOL.filter(c => c.attr === selectedColor); else if (activeTab === "common") cards = CARD_POOL.filter(c => c.attr === "Common"); else cards = CARD_POOL.filter(c => c.attr === "Purple" || c.attr === "Black"); return cards.sort((a, b) => a.cost - b.cost || a.id - b.id); }, [activeTab, selectedColor]);
  const adjustCount = (cardId, delta) => { setCounts(prev => { const current = prev[cardId] || 0; const next = Math.max(0, Math.min(3, current + delta)); const nc = { ...prev }; if (next === 0) delete nc[cardId]; else nc[cardId] = next; return nc; }); };
  const handleDecide = () => { if (totalCards < 10) return; setShowNameInput(true); };
  const handleSave = () => { const name = deckName.trim() || (selectedColor + "デッキ"); onSave({ name, color: selectedColor, counts, totalCards }); };
  const screenBg = { minHeight: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", padding: "12px 12px 16px" };
  const colorNames = { Red: "🔴 赤", Blue: "🔵 青", Green: "🟢 緑", White: "⚪ 白", Orange: "🟠 橙" };
  if (showDeckPreview) { const deckCards = []; Object.entries(counts).forEach(([idStr, count]) => { const card = CARD_POOL.find(c => c.id === parseInt(idStr)); if (card) for (let i = 0; i < count; i++) deckCards.push(card); }); deckCards.sort((a, b) => a.cost - b.cost || a.id - b.id); return (<div style={screenBg}><div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", maxWidth: "360px", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}><h2 style={{ fontSize: "16px", fontWeight: "900", margin: 0 }}>📋 デッキプレビュー</h2><span style={{ fontSize: "12px", opacity: 0.5 }}>{colorNames[selectedColor]} | {totalCards}枚</span></div><div style={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" }}>{deckCards.map((card, i) => { const co = ATTR_COLORS[card.attr] || ATTR_COLORS.Common; const isSpell = card.type === "spell"; return (<div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}><div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "linear-gradient(135deg,#818CF8,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "900", flexShrink: 0 }}>{card.cost}</div><div style={{ flex: 1, fontSize: "12px", fontWeight: "700", color: co.border }}>{isSpell ? "📜 " : ""}{card.name}</div>{!isSpell && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>⚔{card.attack} ❤{card.hp}</div>}<div style={{ width: "8px", height: "8px", borderRadius: "50%", background: co.border, flexShrink: 0 }} /></div>); })}</div><button onClick={() => setShowDeckPreview(false)} style={{ marginTop: "12px", padding: "11px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>← カード選択に戻る</button></div></div>); }
  if (showNameInput) { return (<div style={screenBg}><div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px" }}><div style={{ fontSize: "40px" }}>🎴</div><h2 style={{ fontSize: "18px", fontWeight: "900", textAlign: "center" }}>{initialData ? "デッキ名を変更" : "デッキに名前をつけよう"}</h2><div style={{ fontSize: "12px", opacity: 0.5, textAlign: "center" }}>{colorNames[selectedColor]} | {totalCards}枚</div><input type="text" value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder={selectedColor + "デッキ"} maxLength={12} style={{ width: "240px", padding: "12px 16px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: "16px", fontWeight: "700", outline: "none", textAlign: "center" }} autoFocus /><div style={{ display: "flex", gap: "12px" }}><button onClick={() => setShowNameInput(false)} style={{ padding: "12px 28px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>← 戻る</button><button onClick={handleSave} style={{ padding: "12px 36px", borderRadius: "14px", background: "linear-gradient(135deg,#FF69B4,#FF1493)", border: "none", color: "#fff", fontSize: "14px", fontWeight: "900", cursor: "pointer", boxShadow: "0 4px 16px rgba(255,20,147,0.3)" }}>{initialData ? "上書き保存" : "保存する"}</button></div></div></div>); }
  if (!selectedColor) { return (<div style={screenBg}><div style={{ textAlign: "center", marginBottom: "20px", marginTop: "20px" }}><div style={{ fontSize: "36px" }}>🎴</div><h2 style={{ fontSize: "20px", fontWeight: "900", margin: "8px 0 4px" }}>デッキカラーを選択</h2><p style={{ fontSize: "12px", opacity: 0.5, margin: 0 }}>使いたい色を選んでからカードを選びます</p></div><div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center" }}>{DECK_COLORS.map(color => { const c = ATTR_COLORS[color]; const cardCount = CARD_POOL.filter(card => card.attr === color).length; return (<button key={color} onClick={() => { setSelectedColor(color); setActiveTab("color"); setCounts({}); setSelectedCardId(null); }} style={{ width: "140px", padding: "14px 10px", borderRadius: "14px", background: "linear-gradient(135deg," + c.light + "," + c.border + ")", border: "3px solid " + c.border, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", boxShadow: "0 4px 12px " + c.bg + "44" }}><span style={{ fontSize: "16px", fontWeight: "900", color: c.bg }}>{colorNames[color]}</span><span style={{ fontSize: "11px", color: c.bg, opacity: 0.7 }}>{cardCount}種</span></button>); })}</div><button onClick={onBack} style={{ marginTop: "24px", alignSelf: "center", padding: "10px 30px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "20px", color: "rgba(255,255,255,0.6)", fontSize: "13px", cursor: "pointer" }}>← 戻る</button></div>); }
  const cards = getTabCards();
  const tabDef = [{ key: "color", label: colorNames[selectedColor] || "色カード" }, { key: "common", label: "共通" }, { key: "special", label: "紫/黒" }];
  const manaCurve = {}; Object.entries(counts).forEach(([idStr, count]) => { const card = CARD_POOL.find(c => c.id === parseInt(idStr)); if (card) { manaCurve[card.cost] = (manaCurve[card.cost] || 0) + count; } }); const maxCurve = Math.max(1, ...Object.values(manaCurve));
  return (
    <div style={{ ...screenBg, gap: "0px", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <div style={{ flexShrink: 0, marginBottom: "8px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><h2 style={{ fontSize: "15px", fontWeight: "900", margin: 0 }}>🎴 デッキ編集</h2></div><div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}><span style={{ fontSize: "11px", opacity: 0.5 }}>{colorNames[selectedColor]} | {totalCards}/45枚{totalCards < 10 && <span style={{ color: "#FF6B6B" }}> (最低10枚)</span>}</span><div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "24px", marginLeft: "4px" }}>{[1,2,3,4,5,6,7].map(cost => { const count = manaCurve[cost] || 0; const h = count > 0 ? Math.max(4, (count / maxCurve) * 20) : 2; return (<div key={cost} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}><div style={{ width: "8px", height: h + "px", borderRadius: "2px", background: count > 0 ? "rgba(255,105,180,0.6)" : "rgba(255,255,255,0.1)", transition: "height 0.2s" }} /><span style={{ fontSize: "6px", color: "rgba(255,255,255,0.3)" }}>{cost}</span></div>); })}</div><div style={{ flex: 1 }} /><button onClick={() => setShowDeckPreview(true)} disabled={totalCards === 0} style={{ padding: "4px 10px", background: totalCards > 0 ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.05)", border: "1px solid " + (totalCards > 0 ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.1)"), borderRadius: "10px", color: totalCards > 0 ? "#60A5FA" : "rgba(255,255,255,0.25)", fontSize: "10px", fontWeight: "700", cursor: totalCards > 0 ? "pointer" : "default" }}>📋 デッキを見る</button></div></div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexShrink: 0 }}>{tabDef.map(tab => { let tabFilter; if (tab.key === "color") tabFilter = c => c.attr === selectedColor; else if (tab.key === "common") tabFilter = c => c.attr === "Common"; else tabFilter = c => c.attr === "Purple" || c.attr === "Black"; const tabCount = CARD_POOL.filter(tabFilter).reduce((sum, c) => sum + (counts[c.id] || 0), 0); return (<button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedCardId(null); }} style={{ flex: 1, padding: "7px", borderRadius: "10px", background: activeTab === tab.key ? "rgba(255,105,180,0.25)" : "rgba(255,255,255,0.06)", border: activeTab === tab.key ? "1px solid rgba(255,105,180,0.4)" : "1px solid rgba(255,255,255,0.08)", color: activeTab === tab.key ? "#FF69B4" : "rgba(255,255,255,0.45)", fontSize: "11px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>{tab.label}{tabCount > 0 && <span style={{ fontSize: "9px", fontWeight: "900", background: activeTab === tab.key ? "rgba(255,105,180,0.4)" : "rgba(255,255,255,0.12)", borderRadius: "8px", padding: "1px 5px", color: activeTab === tab.key ? "#fff" : "rgba(255,255,255,0.5)" }}>{tabCount}</span>}</button>); })}</div>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: "8px", minHeight: 0, WebkitOverflowScrolling: "touch" }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedCardId(null); }}><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: vw(4, 2, 8) + "px", padding: "2px " + vw(12, 6, 28) + "px" }}>{cards.map(card => { const count = counts[card.id] || 0; const isSel = selectedCardId === card.id; const co = ATTR_COLORS[card.attr] || ATTR_COLORS.Common; const isSpell = card.type === "spell"; const rarity = CARD_RARITY[card.id]; const rarityInfo = rarity ? RARITY_LEVELS[rarity] : null; const lineageIcon = card.lineage ? LINEAGE_ICONS[card.lineage] : null; const hasCopy = card.lineage && LINEAGE_TO_COPY[card.lineage]; const kwIcons = card.keywords ? card.keywords.map(k => KEYWORD_ICONS[k] || "").join("") : ""; const br = vw(6, 2.5, 10); return (<div key={card.id} style={{ position: "relative" }} onClick={(e) => { e.stopPropagation(); setSelectedCardId(isSel ? null : card.id); }}><div style={{ aspectRatio: "82/120", borderRadius: br + "px", background: "linear-gradient(140deg,#fff," + co.light + ")", border: vw(2, 0.7, 3) + "px solid " + (isSel ? "#FFD700" : co.border), padding: vw(3, 1.5, 6) + "px " + vw(2, 1.2, 5) + "px", display: "flex", flexDirection: "column", position: "relative", cursor: "pointer", boxShadow: isSel ? "0 4px 16px " + co.border + "88" : "none", transition: "border-color 0.15s" }}><div style={{ position: "absolute", top: vw(-5, -1.8, -7) + "px", left: vw(-5, -1.8, -7) + "px", width: vw(16, 5.5, 22) + "px", height: vw(16, 5.5, 22) + "px", borderRadius: "50%", background: "linear-gradient(135deg,#818CF8,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: vw(8, 3, 12) + "px", fontWeight: "900", border: vw(1, 0.5, 2) + "px solid #fff", zIndex: 3 }}>{card.cost}</div>{lineageIcon && <div style={{ position: "absolute", top: vw(-4, -1.3, -5) + "px", right: vw(-4, -1.3, -5) + "px", width: vw(14, 5, 20) + "px", height: vw(14, 5, 20) + "px", borderRadius: "50%", background: hasCopy ? "linear-gradient(135deg,#FFD700,#F59E0B)" : "linear-gradient(135deg,#9CA3AF,#6B7280)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: vw(8, 2.8, 11) + "px", border: vw(1, 0.4, 1.5) + "px solid #fff", zIndex: 3 }}>{lineageIcon}</div>}<div style={{ fontWeight: "800", fontSize: vw(7, 2.6, 10) + "px", color: co.bg, textAlign: "center", marginTop: vw(6, 2.5, 10) + "px", lineHeight: 1.2 }}>{isSpell ? "📜 " : ""}{kwIcons}{card.name}</div>{!isSpell && <div style={{ display: "flex", justifyContent: "center", gap: vw(4, 2, 8) + "px", fontSize: vw(8, 3, 12) + "px", fontWeight: "900", margin: vw(2, 1, 4) + "px 0", color: "#333" }}><span>⚔{card.attack}</span><span>❤{card.hp}</span></div>}<div style={{ fontSize: vw(5.5, 2, 7.5) + "px", color: "#777", textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-wrap", flex: 1, overflow: "hidden" }}>{card.desc}</div>{rarityInfo && <div style={{ textAlign: "center", fontSize: vw(6, 2.1, 8) + "px", color: rarityInfo.color, fontWeight: "900", letterSpacing: "1px", textShadow: rarity === "UR" ? "0 0 4px " + rarityInfo.color : "none" }}>{Array(rarityInfo.stars).fill("★").join("")}</div>}</div>{count > 0 && !isSel && <div style={{ position: "absolute", inset: 0, borderRadius: br + "px", background: count === 1 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ color: "#fff", fontSize: vw(12, 4.5, 18) + "px", fontWeight: "900", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>{count}/3</span></div>}{isSel && <div style={{ position: "absolute", inset: 0, borderRadius: br + "px", background: "rgba(0,0,0,0.65)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: vw(3, 1.5, 6) + "px" }}><div style={{ display: "flex", alignItems: "center", gap: vw(6, 3, 14) + "px" }}><button onClick={(e) => { e.stopPropagation(); adjustCount(card.id, -1); }} style={{ width: vw(22, 8, 32) + "px", height: vw(22, 8, 32) + "px", borderRadius: "50%", background: count > 0 ? "rgba(255,100,100,0.5)" : "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.4)", color: "#fff", fontSize: vw(10, 4, 16) + "px", fontWeight: "900", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>◀</button><span style={{ color: "#fff", fontSize: vw(14, 5.5, 22) + "px", fontWeight: "900", textShadow: "0 2px 4px rgba(0,0,0,0.5)", minWidth: vw(26, 10, 40) + "px", textAlign: "center" }}>{count}/3</span><button onClick={(e) => { e.stopPropagation(); adjustCount(card.id, 1); }} style={{ width: vw(22, 8, 32) + "px", height: vw(22, 8, 32) + "px", borderRadius: "50%", background: count < 3 ? "rgba(100,255,100,0.5)" : "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.4)", color: "#fff", fontSize: vw(10, 4, 16) + "px", fontWeight: "900", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>▶</button></div><div style={{ fontSize: vw(6, 2.3, 9) + "px", color: "rgba(255,255,255,0.5)" }}>No.{String(card.id).padStart(4, "0")}</div></div>}</div>); })}</div></div>
      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}><button onClick={onBack} style={{ padding: "11px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>←</button><button onClick={() => { setCounts({}); setSelectedCardId(null); }} style={{ flex: 1, padding: "11px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>リセット</button><button onClick={handleDecide} disabled={totalCards < 10} style={{ flex: 1.5, padding: "11px", borderRadius: "14px", background: totalCards >= 10 ? "linear-gradient(135deg,#FF69B4,#FF1493)" : "#555", border: "none", color: "#fff", fontSize: "13px", fontWeight: "900", cursor: totalCards >= 10 ? "pointer" : "default", boxShadow: totalCards >= 10 ? "0 4px 16px rgba(255,20,147,0.3)" : "none", opacity: totalCards >= 10 ? 1 : 0.5 }}>決定 ({totalCards})</button></div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  HEX SLOT
// ═══════════════════════════════════════════
const HEX_W = 88; const HEX_H = 76;
const LEADER_HEX_H = 57;
const hexClip = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
const leaderHexClip = "polygon(25% 0%, 75% 0%, 100% 66.7%, 87.5% 100%, 12.5% 100%, 0% 66.7%)";
const leaderHexClipFlipped = "polygon(12.5% 0%, 87.5% 0%, 100% 33.3%, 75% 100%, 25% 100%, 0% 33.3%)";

function HexSlot({ unit, slotId, isHighlighted, isSelected, onClick, isLeader, leaderHp, leaderFrozen, leaderShield, isBuildingSlot, gameState, attackGlow, isInspected, shaking, spinning, copyAbility, isFlipped }) {
  const isEmpty = !unit && !isLeader;
  const colors = unit ? ATTR_COLORS[unit.attr] || ATTR_COLORS.Common : null;
  const label = SLOT_LABELS[slotId] || "";
  const baseHex = { width: HEX_W + "px", height: HEX_H + "px", clipPath: hexClip, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: onClick ? "pointer" : "default", transition: "all 0.2s", fontSize: "10px", fontWeight: "bold", userSelect: "none", flexShrink: 0 };
  const shakeOnly = shaking ? { animation: "hexShake 0.3s ease-out" } : {};
  const spinStyle = spinning ? { animation: "hexSpinY 0.2s ease-in-out" } : {};
  if (isLeader) { const copyColors = copyAbility ? ATTR_COLORS[copyAbility.attr] || ATTR_COLORS.Common : null; const leaderBg = isHighlighted ? "linear-gradient(135deg,#FF6B6B,#FF2222)" : leaderFrozen ? "linear-gradient(135deg,#A5F3FC,#67E8F9)" : copyColors ? "linear-gradient(135deg," + copyColors.light + "," + copyColors.border + ")" : "linear-gradient(135deg,#FFD1DC,#FF69B4)"; const leaderShadow = isHighlighted ? "0 0 18px rgba(255,0,0,0.6)" : leaderFrozen ? "0 2px 10px rgba(103,232,249,0.4)" : leaderShield ? "0 0 14px rgba(255,255,255,0.5), 0 0 28px rgba(255,255,255,0.2)" : copyColors ? "0 2px 10px " + copyColors.bg + "44" : "0 2px 10px rgba(255,105,180,0.25)"; const clip = isFlipped ? leaderHexClipFlipped : leaderHexClip; return (<div onClick={onClick} style={{ position: "relative", width: HEX_W + "px", height: LEADER_HEX_H + "px", cursor: onClick ? "pointer" : "default" }}><div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", clipPath: clip, background: leaderBg, boxShadow: leaderShadow, transition: "all 0.2s", ...(shaking ? { animation: "hexShake 0.3s ease-out" } : {}) }} />{leaderShield && <div style={{ position: "absolute", top: "-8px", left: "-8px", width: (HEX_W+16) + "px", height: (LEADER_HEX_H+16) + "px", pointerEvents: "none", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><svg viewBox="0 0 100 70" width={HEX_W+16} height={LEADER_HEX_H+16} style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.8))" }}><defs><polygon id="bHex" points="18,0 6,0 0,10.4 6,20.8 18,20.8 24,10.4" /></defs><g style={{ animation: "barrierPulse 2s ease-in-out infinite" }}><use href="#bHex" x="24" y="4" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.3" /><use href="#bHex" x="52" y="4" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" /></g><g style={{ animation: "barrierPulse 2s ease-in-out infinite 0.4s" }}><use href="#bHex" x="10" y="22" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" /><use href="#bHex" x="38" y="22" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" /><use href="#bHex" x="66" y="22" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" /></g><g style={{ animation: "barrierPulse 2s ease-in-out infinite 0.8s" }}><use href="#bHex" x="24" y="40" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" /><use href="#bHex" x="52" y="40" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.3" /></g></svg></div>}<div style={{ position: "relative", zIndex: 2, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "bold", userSelect: "none" }}>{leaderFrozen && <div style={{ fontSize: "10px", lineHeight: 1 }}>🧊</div>}{copyAbility && !leaderFrozen ? <div style={{ fontSize: "8px", color: copyColors?.bg || "#fff", fontWeight: "800", lineHeight: 1.1 }}>{copyAbility.name}</div> : !leaderFrozen && <div style={{ fontSize: "14px", lineHeight: 1 }}>⭐</div>}<div style={{ color: leaderFrozen ? "#0891B2" : "#fff", fontSize: "11px", fontWeight: "900", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>HP {leaderHp}</div><div style={{ fontSize: "7px", color: leaderFrozen ? "#0891B2" : leaderShield ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)" }}>{leaderFrozen ? "凍結中" : leaderShield ? "🪨バリア" : copyAbility ? "コピー中" : "リーダー"}</div></div></div>); }
  if (isEmpty) return (<div onClick={onClick} style={{ ...baseHex, background: isHighlighted ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.07)", boxShadow: isHighlighted ? "0 0 14px rgba(74,222,128,0.4)" : "none" }}>{isHighlighted ? <div style={{ color: "#4ADE80", fontSize: "22px", lineHeight: 1 }}>＋</div> : <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", textAlign: "center" }}>{label}{isBuildingSlot && <div style={{ fontSize: "7px", marginTop: "1px", color: "rgba(255,200,100,0.3)" }}>建物可</div>}</div>}</div>);
  const effectiveAtk = getEffectiveAttack(unit, gameState);
  const isDamaged = unit.currentHp < unit.hp;
  const kwIcons = unit.keywords.map(k => KEYWORD_ICONS[k] || "").join("");
  const isFrozen = unit.frozen;
  const glowColor = attackGlow === "all" ? "rgba(0,200,150,0.7)" : attackGlow === "helperOnly" ? "rgba(250,204,21,0.7)" : null;
  const hexBg = isFrozen ? "linear-gradient(160deg,#A5F3FC,#67E8F9)" : isSelected ? "linear-gradient(160deg," + colors.border + "," + colors.bg + ")" : isHighlighted ? "linear-gradient(160deg,#FF6B6B,#CC2222)" : "linear-gradient(160deg," + colors.light + "," + colors.border + ")";
  const hexShadow = isSelected ? "0 0 16px " + colors.border : isHighlighted ? "0 0 16px rgba(255,60,60,0.5)" : "0 2px 6px rgba(0,0,0,0.12)";
  return (<div style={{ position: "relative", width: HEX_W + "px", height: HEX_H + "px", ...shakeOnly }}>{glowColor && <div style={{ position: "absolute", top: "-3px", left: "-3px", width: (HEX_W+6) + "px", height: (HEX_H+6) + "px", filter: "blur(3px)", zIndex: 0, pointerEvents: "none" }}><div style={{ width: "100%", height: "100%", clipPath: hexClip, background: glowColor }} /></div>}{isInspected && <div style={{ position: "absolute", top: "-3px", left: "-3px", width: (HEX_W+6) + "px", height: (HEX_H+6) + "px", filter: "blur(2px)", zIndex: 0, pointerEvents: "none" }}><div style={{ width: "100%", height: "100%", clipPath: hexClip, background: "rgba(255,215,0,0.8)" }} /></div>}<div style={{ ...baseHex, position: "absolute", top: 0, left: 0, zIndex: 1, background: hexBg, boxShadow: hexShadow, ...spinStyle }} /><div onClick={onClick} style={{ ...baseHex, position: "relative", zIndex: 2, background: "transparent" }}><div style={{ fontSize: "9px", color: isSelected||isHighlighted||isFrozen ? "#fff" : colors.bg, lineHeight: 1.1, textAlign: "center", maxWidth: "72px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", textShadow: isFrozen ? "0 1px 2px rgba(0,0,0,0.5)" : "none" }}>{kwIcons}{unit.name}</div><div style={{ display: "flex", gap: "5px", marginTop: "3px", fontSize: "12px", fontWeight: "900", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}><span style={{ color: effectiveAtk > (unit.baseAttack ?? unit.attack) ? "#FFD700" : effectiveAtk < (unit.baseAttack ?? unit.attack) ? "#FF6B6B" : "#fff" }}>⚔{effectiveAtk}</span><span style={{ color: isDamaged ? "#FF6B6B" : unit.hp > (unit.baseHp ?? unit.hp) ? "#FFD700" : "#fff" }}>❤{unit.currentHp}</span></div>{isFrozen && <div style={{ fontSize: "7px", color: "#0e7490" }}>🧊凍結</div>}{!isFrozen && unit.hasAttacked && <div style={{ fontSize: "7px", color: "rgba(255,255,255,0.65)" }}>行動済</div>}{!isFrozen && unit.summonedThisTurn && !unit.keywords.includes("dash1") && !unit.keywords.includes("dash2") && <div style={{ fontSize: "7px", color: "rgba(255,255,255,0.65)" }}>酔い</div>}</div></div>);
}

// ═══════════════════════════════════════════
//  HONEYCOMB BOARD
// ═══════════════════════════════════════════
function HoneycombBoard({ player, playerId, state, selectedUnit, highlightSlots, onSlotClick, isFlipped, inspectedUnit, popups }) {
  const gap = 6; const dx = HEX_W * 0.75 + gap * 0.75; const dy = HEX_H * 0.5 + gap * 0.5;
  const normalPositions = { frontCenter: { x: 0, y: 0 }, frontLeft: { x: -dx, y: dy }, frontRight: { x: dx, y: dy }, midCenter: { x: 0, y: dy*2 }, backLeft: { x: -dx, y: dy*3 }, backRight: { x: dx, y: dy*3 }, base: { x: 0, y: dy*4 } };
  const cutOffset = HEX_H - LEADER_HEX_H;
  const flippedPositions = { base: { x: 0, y: 0 }, backLeft: { x: -dx, y: dy - cutOffset }, backRight: { x: dx, y: dy - cutOffset }, midCenter: { x: 0, y: dy*2 - cutOffset }, frontLeft: { x: -dx, y: dy*3 - cutOffset }, frontRight: { x: dx, y: dy*3 - cutOffset }, frontCenter: { x: 0, y: dy*4 - cutOffset } };
  const positions = isFlipped ? flippedPositions : normalPositions;
  const totalHeight = dy * 4 + LEADER_HEX_H; const totalWidth = dx * 2 + HEX_W;
  const isActive = state.phase === "playing" && playerId === state.activePlayer && state.turnStarted && !state.pendingSummonEffect;
  function getAttackGlow(unit) { if (!isActive || !unit) return null; if (unit.hasAttacked || unit.frozen) return null; if (unit.keywords.includes("immobile")) return null; if (unit.effect === "no_attack") return null; if (unit.summonedThisTurn && !unit.keywords.includes("dash1") && !unit.keywords.includes("dash2")) return null; if (unit.effect === "no_atk_full_hp" && unit.currentHp >= unit.hp) return null; if (unit.keywords.includes("dash2") && unit.summonedThisTurn) return "all"; if (unit.keywords.includes("dash1") && unit.summonedThisTurn) return "helperOnly"; if (unit.keywords.includes("dash1") && !unit.canAttackLeader) return "helperOnly"; return "all"; }
  const myPopups = popups.filter(p => p.player === playerId);
  const shakingSlots = new Set(myPopups.filter(p => p.type === "damage").map(p => p.slot === "leader" ? "base" : p.slot));
  const spinningSlots = new Set(myPopups.filter(p => p.type === "attack").map(p => p.slot));
  return (
    <div style={{ position: "relative", width: (totalWidth+8) + "px", height: totalHeight + "px", margin: "0 auto" }}>
      {ALL_SLOTS.map(slotId => { const pos = positions[slotId]; if (!pos) return null; const isLeader = slotId === "base"; const unit = isLeader ? null : player.board[slotId]; const isSelectedUnit = selectedUnit?.player === playerId && selectedUnit?.slot === slotId; const hlKey = isLeader ? playerId + "-leader" : playerId + "-" + slotId; const glow = isLeader ? null : getAttackGlow(unit); const isInsp = inspectedUnit?.player === playerId && inspectedUnit?.slot === slotId;
        return (<div key={slotId} style={{ position: "absolute", left: ((totalWidth+8)/2+pos.x-HEX_W/2) + "px", top: pos.y + "px" }}><HexSlot unit={unit} slotId={slotId} isSelected={isSelectedUnit} isHighlighted={highlightSlots.includes(hlKey)} isLeader={isLeader} leaderHp={player.leaderHp} leaderFrozen={player.leaderFrozen} leaderShield={isLeader ? player.leaderShield : false} isBuildingSlot={BUILDING_SLOTS.includes(slotId)} gameState={state} attackGlow={glow} isInspected={isInsp} shaking={shakingSlots.has(slotId)} spinning={spinningSlots.has(slotId)} copyAbility={isLeader ? player.currentCopy : null} isFlipped={isFlipped} onClick={() => onSlotClick(playerId, isLeader ? "leader" : slotId)} /></div>);
      })}
      {myPopups.filter(p => p.type === "damage" || p.type === "heal").map(p => { const slotId = p.slot === "leader" ? "base" : p.slot; const pos = positions[slotId]; if (!pos) return null; const isDmg = p.type === "damage"; const hexH = slotId === "base" ? LEADER_HEX_H : HEX_H; return (<div key={p.id} style={{ position: "absolute", left: ((totalWidth+8)/2+pos.x) + "px", top: (pos.y + hexH * 0.3) + "px", transform: "translate(-50%, -50%)", animation: "popupFloat 0.8s ease-out forwards", fontSize: "24px", fontWeight: "900", color: isDmg ? "#FF4444" : "#44FFAA", textShadow: "0 0 10px " + (isDmg ? "rgba(255,0,0,0.6)" : "rgba(0,255,100,0.6)") + ", 0 2px 4px rgba(0,0,0,0.7)", pointerEvents: "none", zIndex: 100 }}>{isDmg ? "-" : "+"}{p.amount}</div>); })}
      {myPopups.filter(p => p.type === "miss").map(p => { const slotId = p.slot === "leader" ? "base" : p.slot; const pos = positions[slotId]; if (!pos) return null; const hexH = slotId === "base" ? LEADER_HEX_H : HEX_H; return (<div key={p.id} style={{ position: "absolute", left: ((totalWidth+8)/2+pos.x) + "px", top: (pos.y + hexH * 0.3) + "px", transform: "translate(-50%, -50%)", animation: "popupFloat 0.8s ease-out forwards", fontSize: "14px", fontWeight: "900", color: "rgba(255,255,255,0.6)", textShadow: "0 1px 3px rgba(0,0,0,0.8)", pointerEvents: "none", zIndex: 100 }}>MISS</div>); })}
      {myPopups.filter(p => p.type === "spawn").map(p => { const pos = positions[p.slot]; if (!pos) return null; return (<div key={p.id} style={{ position: "absolute", left: ((totalWidth+8)/2+pos.x-HEX_W/2) + "px", top: pos.y + "px", width: HEX_W + "px", height: HEX_H + "px", pointerEvents: "none", zIndex: 99 }}><svg viewBox="0 0 88 76" width={HEX_W} height={HEX_H} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "spawnRing 0.4s ease-out forwards", transformOrigin: "center center" }}><polygon points="22,0 66,0 88,38 66,76 22,76 0,38" fill="none" stroke="rgba(255,180,60,0.75)" strokeWidth="3" /></svg></div>); })}
    </div>
  );
}

// ═══════════════════════════════════════════
//  WAZA PANEL
// ═══════════════════════════════════════════
const WAZA_DMG_DISPLAY = {
  fire1: (b) => "🔥 ヘルパー" + (3+b) + " / リーダー" + (2+b), fire3: (b) => "🔥 " + (5+b) + "ダメ / 自傷" + (3+b), fire4: (b) => "🔥 全体" + (2+b) + "ダメージ", fighter2: (b) => "👊 列" + (2+b) + "ダメージ", fighter3: (b) => "👊 " + (3+b) + " / ブロック" + (6+b), sword2: (b) => "⚔ " + (2+b) + "ダメ+隣接" + (1+b), leaf1: (b) => "🍃 合計" + (3+b) + "ダメ分配", tornado3: (b) => "🌪️ " + (2+b) + "ダメ×4回", stone3: (b) => "🪨 " + (6+b) + "ダメージ", beam1: (b) => "🔮 " + (2+b) + "ダメージ", beam2: () => "📡 使用コピー種類数ダメ分配", beam3: (b) => "🔮 列" + (3+b) + "ダメージ", bomb2: (b) => "💣 " + (2+b) + "ダメージ", bomb3: (b) => "💣 " + (5+b) + "+隣接" + (2+b), crash1: (b) => "💥 全体" + (5+b) + "ダメージ", spark2: (b) => "⚡ " + (2+b) + "ダメージ", cutter3: (b) => "✂️ " + (5+b) + "ダメージ",
};

function WazaPanel({ copy, stocks, mana, usedThisTurn, costOverrides, transformedThisTurn, leaderAtkBonus, sparkLaserDmg, linkBlueI, hammerFireDmg, linkRedII, wazaDmgBonus, heroShieldCooldown, ice3Cooldown, onSelect, onClose }) {
  if (!copy) return null;
  const copyColors = ATTR_COLORS[copy.attr] || ATTR_COLORS.Common;
  const b = wazaDmgBonus || 0;
  function getExtraDmgDisplay(w, canUse) { if (w.atk !== undefined) { const effectiveDmg = w.atk + leaderAtkBonus + (w.id === "fighter1" && linkRedII ? 2 : 0); const dmgColor = effectiveDmg > w.atk ? "#16A34A" : effectiveDmg < w.atk ? "#DC2626" : canUse ? "#555" : "#777"; return <div style={{ fontSize: "9px", fontWeight: "900", color: dmgColor, marginTop: "2px" }}>⚔ {effectiveDmg}ダメージ</div>; } if (w.id === "spark3" && sparkLaserDmg !== undefined) { const total = sparkLaserDmg + b; return <div style={{ fontSize: "9px", fontWeight: "900", color: total > 1 ? "#16A34A" : canUse ? "#555" : "#777", marginTop: "2px" }}>⚡ {total}ダメージ</div>; } if (w.id === "hammer2" && hammerFireDmg !== undefined) { const total = hammerFireDmg + b; return <div style={{ fontSize: "9px", fontWeight: "900", color: total > 1 ? "#16A34A" : canUse ? "#555" : "#777", marginTop: "2px" }}>🔥 {total}ダメージ</div>; } if (b > 0 && WAZA_DMG_DISPLAY[w.id]) { return <div style={{ fontSize: "9px", fontWeight: "900", color: "#16A34A", marginTop: "2px" }}>{WAZA_DMG_DISPLAY[w.id](b)}</div>; } return null; }
  return (
    <div style={{ display: "flex", gap: "6px", padding: "6px 8px", overflowX: "auto", maxWidth: "100%", WebkitOverflowScrolling: "touch", background: "rgba(0,0,0,0.4)", borderRadius: "10px", border: "1px solid " + copyColors.border + "66" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minWidth: "40px", gap: "2px" }}><div style={{ fontSize: "8px", color: copyColors.border, fontWeight: "800" }}>{copy.name}</div><div onClick={onClose} style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>✕閉じる</div></div>
      {copy.wazas.map((w, i) => { const stock = stocks[w.id] || 0; const isImpl = w.targetMode !== "not_implemented"; const cost = costOverrides[w.id] !== undefined ? costOverrides[w.id] : w.cost; const isReduced = cost < w.cost; const canUse = isImpl && !usedThisTurn && stock > 0 && cost <= mana && !(w.id === "beam3" && transformedThisTurn) && !(w.id === "cutter2" && transformedThisTurn) && !(w.id === "water1" && !linkBlueI) && !(w.id === "sword4" && heroShieldCooldown > 0) && !(w.id === "ice3" && ice3Cooldown > 0); return (<div key={w.id} onClick={() => canUse && onSelect(w.id)} style={{ width: "100px", minHeight: "80px", borderRadius: "8px", background: canUse ? "linear-gradient(140deg," + copyColors.light + "," + copyColors.border + ")" : "linear-gradient(140deg,#555,#333)", border: "2px solid " + (canUse ? copyColors.border : "#666"), cursor: canUse ? "pointer" : "default", padding: "5px", display: "flex", flexDirection: "column", fontSize: "8px", opacity: canUse ? 1 : 0.45, flexShrink: 0, position: "relative" }}><div style={{ position: "absolute", top: "-5px", left: "-5px", width: "18px", height: "18px", borderRadius: "50%", background: canUse ? "linear-gradient(135deg,#818CF8,#6366F1)" : "#666", color: isReduced ? "#4ADE80" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "900", border: "1.5px solid #fff" }}>{cost}</div><div style={{ fontWeight: "800", fontSize: "9px", color: canUse ? copyColors.bg : "#999", textAlign: "center", marginTop: "8px", lineHeight: 1.1 }}>{"①②③"[i]}{w.name}</div><div style={{ fontSize: "7px", color: canUse ? "#555" : "#777", textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-wrap", flex: 1, marginTop: "3px" }}>{w.desc}{getExtraDmgDisplay(w, canUse)}</div><div style={{ fontSize: "7px", color: canUse ? copyColors.bg : "#888", textAlign: "center", fontWeight: "700" }}>残{stock}/{w.maxStock}</div></div>); })}
    </div>
  );
}

function CardInHand({ card, index, isSelected, playState, effCost, friendlyDeathCount, onClick }) {
  const colors = ATTR_COLORS[card.attr] || ATTR_COLORS.Common; const isSpell = card.type === "spell";
  const lineageIcon = card.lineage ? LINEAGE_ICONS[card.lineage] : null;
  const hasCopy = card.lineage && LINEAGE_TO_COPY[card.lineage];
  const canInteract = playState !== "disabled"; const isCopyOnly = playState === "copyOnly"; const isDisabled = playState === "disabled";
  const rarity = CARD_RARITY[card.id]; const rarityInfo = rarity ? RARITY_LEVELS[rarity] : null;
  const borderColor = isSelected ? "#FFD700" : isDisabled ? "#999" : colors.border;
  const bgStyle = isSelected ? "linear-gradient(140deg," + colors.border + "," + colors.bg + ")" : isCopyOnly ? "linear-gradient(140deg,#aaa,#888)" : isDisabled ? "linear-gradient(140deg,#ddd,#aaa)" : "linear-gradient(140deg,#fff," + colors.light + ")";
  const glowClass = !isSelected && playState === "playable" ? "green" : !isSelected && isCopyOnly ? "blue" : "";
  const cardAnim = glowClass === "green" ? "cardGlowGreen 2s ease-in-out infinite" : glowClass === "blue" ? "cardGlowBlue 2s ease-in-out infinite" : rarity === "UR" && !isSelected ? "cardGlowUR 2.5s ease-in-out infinite" : "none";
  return (<div style={{ position: "relative", flexShrink: 0 }}><div onClick={onClick} style={{ width: "82px", height: "120px", borderRadius: "10px", background: bgStyle, border: "3px solid " + borderColor, ...(isSelected ? { boxShadow: "0 4px 16px " + colors.border + "88" } : glowClass ? {} : { boxShadow: "none" }), animation: cardAnim, cursor: canInteract ? "pointer" : "default", padding: "6px 5px", display: "flex", flexDirection: "column", fontSize: "9px", transition: "transform 0.15s, border-color 0.15s", transform: isSelected ? "translateY(-10px) scale(1.04)" : "none", userSelect: "none", position: "relative", flexShrink: 0, opacity: isDisabled ? 0.55 : 1 }}><div style={{ fontWeight: "800", fontSize: "10px", color: isSelected ? "#fff" : isCopyOnly ? "#555" : colors.bg, textAlign: "center", marginTop: "10px", lineHeight: 1.2 }}>{isSpell ? "📜 " : ""}{card.name}</div>{!isSpell && <div style={{ display: "flex", justifyContent: "center", gap: "8px", fontSize: "12px", fontWeight: "900", margin: "4px 0", color: isSelected ? "#fff" : isCopyOnly ? "#444" : "#333" }}><span style={{ color: (card.origAttack != null && card.attack > card.origAttack) ? "#FFD700" : undefined }}>⚔{card.attack}</span><span style={{ color: (card.origHp != null && card.hp > card.origHp) ? "#FFD700" : undefined }}>❤{card.hp}</span></div>}<div style={{ fontSize: "7.5px", color: isSelected ? "rgba(255,255,255,0.9)" : isCopyOnly ? "#666" : "#777", textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-wrap", flex: 1, overflow: "hidden" }}>{card.effect === "galactic_knight" ? card.desc + "\n（墓地" + (friendlyDeathCount || 0) + "枚）" : card.desc}</div>{rarityInfo && <div style={{ textAlign: "center", fontSize: "8px", color: rarityInfo.color, fontWeight: "900", letterSpacing: "1px", textShadow: rarity === "UR" ? "0 0 4px " + rarityInfo.color : "none" }}>{Array(rarityInfo.stars).fill("★").join("")}</div>}<div style={{ position: "absolute", top: "-7px", left: "-7px", width: "22px", height: "22px", borderRadius: "50%", background: isDisabled ? "#888" : isCopyOnly ? "#888" : effCost < card.cost ? "linear-gradient(135deg,#16A34A,#15803D)" : effCost > card.cost ? "linear-gradient(135deg,#DC2626,#B91C1C)" : "linear-gradient(135deg,#818CF8,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "900", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", zIndex: 3 }}>{effCost != null ? effCost : card.cost}</div>{lineageIcon && <div style={{ position: "absolute", top: "-5px", right: "-5px", width: "20px", height: "20px", borderRadius: "50%", background: hasCopy ? "linear-gradient(135deg,#FFD700,#F59E0B)" : "linear-gradient(135deg,#9CA3AF,#6B7280)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", border: "1.5px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", zIndex: 3 }}>{lineageIcon}</div>}</div></div>);
}

// ═══════════════════════════════════════════
//  MAIN GAME COMPONENT
// ═══════════════════════════════════════════
//  MULLIGAN SCREEN
// ═══════════════════════════════════════════
function MulliganScreen({ playerId, hand, onConfirm }) {
  const [flipped, setFlipped] = useState(new Set());
  const toggle = (origIdx) => setFlipped(prev => { const n = new Set(prev); n.has(origIdx) ? n.delete(origIdx) : n.add(origIdx); return n; });
  const colorEmoji = { Red: "🔴", Blue: "🔵", Green: "🟢", White: "⚪", Orange: "🟠", Common: "⚫", Purple: "🟣" };
  const selectableCards = hand.map((card, i) => ({ card, origIdx: i })).filter(({ card }) => card.id !== 857);
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", gap: "20px", padding: "24px" }}>
      <div style={{ fontSize: "36px" }}>🃏</div>
      <h2 style={{ fontSize: "20px", fontWeight: "900", textAlign: "center", margin: 0 }}>P{playerId === "p1" ? 1 : 2} マリガン</h2>
      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", textAlign: "center", margin: 0 }}>返すカードをタップ → 同じカードをもう一度タップでキャンセル</p>
      <p style={{ fontSize: "13px", color: flipped.size > 0 ? "#FF69B4" : "rgba(255,255,255,0.4)", fontWeight: "700", margin: 0 }}>{flipped.size > 0 ? `${flipped.size}枚を返す予定` : "返すカードなし"}</p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", maxWidth: "420px" }}>
        {selectableCards.map(({ card, origIdx }) => {
          const isFlipped = flipped.has(origIdx);
          const colors = ATTR_COLORS[card.attr] || ATTR_COLORS.Common;
          const rarity = CARD_RARITY[card.id];
          const rarityInfo = rarity ? RARITY_LEVELS[rarity] : null;
          return (
            <div key={origIdx} onClick={() => toggle(origIdx)} style={{ width: "82px", height: "120px", borderRadius: "10px", cursor: "pointer", position: "relative", transition: "transform 0.2s", transform: isFlipped ? "scale(0.93)" : "scale(1)" }}>
              {isFlipped ? (
                <div style={{ width: "100%", height: "100%", borderRadius: "10px", background: "linear-gradient(140deg,#1e293b,#0f172a)", border: "3px solid #475569", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <div style={{ fontSize: "28px" }}>🔄</div>
                  <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", textAlign: "center" }}>山札に戻す</div>
                </div>
              ) : (
                <div style={{ width: "100%", height: "100%", borderRadius: "10px", background: "linear-gradient(140deg,#fff," + colors.light + ")", border: "3px solid " + colors.border, padding: "6px 5px", display: "flex", flexDirection: "column", fontSize: "9px", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                  <div style={{ fontWeight: "800", fontSize: "10px", color: colors.bg, textAlign: "center", marginTop: "10px", lineHeight: 1.2 }}>{card.type === "spell" ? "📜 " : ""}{card.name}</div>
                  {card.type !== "spell" && <div style={{ display: "flex", justifyContent: "center", gap: "8px", fontSize: "12px", fontWeight: "900", margin: "4px 0", color: "#333" }}><span>⚔{card.attack}</span><span>❤{card.hp}</span></div>}
                  <div style={{ fontSize: "7.5px", color: "#777", textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-wrap", flex: 1, overflow: "hidden" }}>{card.desc}</div>
                  {rarityInfo && <div style={{ textAlign: "center", fontSize: "8px", color: rarityInfo.color, fontWeight: "900" }}>{Array(rarityInfo.stars).fill("★").join("")}</div>}
                  <div style={{ position: "absolute", top: "-7px", left: "-7px", width: "22px", height: "22px", borderRadius: "50%", background: "linear-gradient(135deg,#818CF8,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "900", border: "2px solid #fff", zIndex: 3 }}>{card.cost}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={() => onConfirm([...flipped])} style={{ padding: "16px 60px", fontSize: "17px", fontWeight: "900", background: "linear-gradient(135deg,#FF69B4,#FF1493)", border: "none", borderRadius: "30px", color: "#fff", cursor: "pointer", boxShadow: "0 4px 20px rgba(255,105,180,0.4)", marginTop: "8px" }}>
        決定 {flipped.size > 0 ? `（${flipped.size}枚入れ替え）` : "（そのまま）"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════
export default function KirbyCardGame() {
  const [gamePhase, setGamePhase] = useState("deckSelect");
  const [p1Color, setP1Color] = useState(null);
  const [p2Color, setP2Color] = useState(null);
  const [p1Support, setP1Support] = useState(undefined);
  const [p2Support, setP2Support] = useState(undefined);
  const [p1CustomDeck, setP1CustomDeck] = useState(null);
  const [p2CustomDeck, setP2CustomDeck] = useState(null);
  const [savedDecks, setSavedDecks] = useState([]);
  const [storageLoading, setStorageLoading] = useState(true);
  const [editingDeck, setEditingDeck] = useState(null);
  const [mulliganStep, setMulliganStep] = useState(null);
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [inspectedUnit, setInspectedUnit] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [popups, setPopups] = useState([]);
  const prevStateRef = useRef(null);

  useEffect(() => { if (!prevStateRef.current) { prevStateRef.current = state; return; } const prev = prevStateRef.current; prevStateRef.current = state; if (prev.phase !== "playing" && state.phase !== "playing") return; const newPopups = []; let pid = Date.now();
    if (state.galacticaMissSeq !== prev.galacticaMissSeq && state.galacticaLastMiss) { newPopups.push({ id: pid++, player: state.galacticaLastMiss.targetPlayerId, slot: state.galacticaLastMiss.slot, type: "miss" }); } ["p1", "p2"].forEach(playerId => { const prevLHp = prev.players[playerId].leaderHp; const currLHp = state.players[playerId].leaderHp; if (currLHp !== prevLHp) { newPopups.push({ id: pid++, player: playerId, slot: "leader", amount: Math.abs(currLHp - prevLHp), type: currLHp < prevLHp ? "damage" : "heal" }); } UNIT_SLOTS.forEach(slot => { const prevUnit = prev.players[playerId].board[slot]; const currUnit = state.players[playerId].board[slot]; if (!prevUnit && currUnit) { newPopups.push({ id: pid++, player: playerId, slot, type: "spawn" }); } if (prevUnit && currUnit && prevUnit.name === currUnit.name) { if (prevUnit.currentHp !== currUnit.currentHp) { newPopups.push({ id: pid++, player: playerId, slot, amount: Math.abs(currUnit.currentHp - prevUnit.currentHp), type: currUnit.currentHp < prevUnit.currentHp ? "damage" : "heal" }); } if (!prevUnit.hasAttacked && currUnit.hasAttacked) { newPopups.push({ id: pid++, player: playerId, slot, type: "attack" }); } } }); }); if (newPopups.length > 0) setPopups(p => [...p, ...newPopups]); }, [state]);
  useEffect(() => { if (popups.length === 0) return; const timer = setTimeout(() => setPopups([]), 800); return () => clearTimeout(timer); }, [popups]);
  useEffect(() => { if (!state.pendingSpread) return; const timer = setTimeout(() => dispatch({ type: "SPREAD_TICK" }), 200); return () => clearTimeout(timer); }, [state.pendingSpread]);
  useEffect(() => { if (!state.pendingGalactica) return; const timer = setTimeout(() => dispatch({ type: "GALACTICA_TICK" }), 200); return () => clearTimeout(timer); }, [state.pendingGalactica]);

  useEffect(() => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('deck:'));
      const decks = keys.map(key => { try { const deck = JSON.parse(localStorage.getItem(key)); deck._storageKey = key; return deck; } catch { return null; } }).filter(Boolean);
      decks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSavedDecks(decks);
    } catch (e) { console.error('Failed to load decks:', e); }
    setStorageLoading(false);
  }, []);

  const saveDeckToStorage = useCallback((deckData) => { const timestamp = Date.now(); const key = 'deck:' + timestamp; const toSave = { name: deckData.name, color: deckData.color, counts: deckData.counts, totalCards: deckData.totalCards, createdAt: timestamp }; try { localStorage.setItem(key, JSON.stringify(toSave)); } catch (e) { console.error('Failed to save deck:', e); } const withKey = { ...toSave, _storageKey: key }; setSavedDecks(prev => [withKey, ...prev]); }, []);
  const deleteDeckFromStorage = useCallback((storageKey) => { try { localStorage.removeItem(storageKey); } catch (e) { console.error('Failed to delete deck:', e); } setSavedDecks(prev => prev.filter(d => d._storageKey !== storageKey)); }, []);
  const updateDeckInStorage = useCallback((storageKey, deckData) => { const toSave = { name: deckData.name, color: deckData.color, counts: deckData.counts, totalCards: deckData.totalCards, createdAt: deckData.createdAt || Date.now() }; try { localStorage.setItem(storageKey, JSON.stringify(toSave)); } catch (e) { console.error('Failed to update deck:', e); } const withKey = { ...toSave, _storageKey: storageKey }; setSavedDecks(prev => prev.map(d => d._storageKey === storageKey ? withKey : d)); }, []);

  const screenBg = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", gap: "24px", padding: "24px" };
  const btnStyle = { padding: "16px 48px", fontSize: "17px", fontWeight: "900", background: "linear-gradient(135deg,#FF69B4,#FF1493)", border: "none", borderRadius: "30px", color: "#fff", cursor: "pointer", boxShadow: "0 4px 20px rgba(255,105,180,0.4)" };
  const ap = state.activePlayer; const player = state.players[ap]; const oppId = opponent(ap); const oppPlayer = state.players[oppId];

  useEffect(() => { if (gamePhase === "playing" && state.phase === "playing" && !state.turnStarted) dispatch({ type: "START_TURN" }); }, [gamePhase, state.phase, state.turnStarted]);

  function downloadBattleLog() {
    const data = {
      date: new Date().toISOString(),
      winner: state.winner,
      totalTurns: state.turn,
      p1: { color: state.players.p1.deckColor, finalHp: state.players.p1.leaderHp },
      p2: { color: state.players.p2.deckColor, finalHp: state.players.p2.leaderHp },
      log: state.fullLog || state.log,
    };
    const blob = new Blob(["\uFEFF" + JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "battle_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  useEffect(() => { if (state.phase === "gameOver") { downloadBattleLog(); } }, [state.phase]);
  const clearSelection = useCallback(() => { setSelectedCard(null); setSelectedUnit(null); }, []);
  const getEffCost = useCallback((card) => { let cost = card.cost; if (player.costReduction > 0) cost = Math.max(0, cost - player.costReduction); if (card.effect === "snowball_debuff" && UNIT_SLOTS.some(sl => player.board[sl] && player.board[sl].effect === "goliath")) cost = Math.max(0, cost - 1); if (card.effect === "gabriel") cost = Math.max(0, cost - (player.millCount || 0)); if (card.effect === "galactic_knight" && player.graveyard.length >= 20) cost = Math.max(0, cost - 20); return cost; }, [player.costReduction, player.board, player.millCount, player.graveyard]);
  const pending = state.pendingSummonEffect;

  const highlightSlots = useMemo(() => {
    if (gamePhase !== "playing") return []; const hl = [];
    if (state.pendingWaza) { const tm = state.pendingWaza.targetMode; if (tm === "attack") { const leaderTargets = getValidLeaderAttackTargets(state, ap); leaderTargets.forEach(t => { hl.push(t === "leader" ? oppId + "-leader" : oppId + "-" + t); }); } else if (tm === "enemy_any") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); hl.push(oppId + "-leader"); } if (tm === "enemy_helper") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } if (tm === "enemy_helper_atk3_or_less") { UNIT_SLOTS.forEach(s => { const u = oppPlayer.board[s]; if (u && getEffectiveAttack(u, state) <= 3) hl.push(oppId + "-" + s); }); } if (tm === "friendly_red_helper") { UNIT_SLOTS.forEach(s => { if (player.board[s] && player.board[s].attr === "Red") hl.push(ap + "-" + s); }); } if (tm === "friendly_helper") { UNIT_SLOTS.forEach(s => { if (player.board[s]) hl.push(ap + "-" + s); }); } if (tm === "friendly_empty") { getEmptyUnitSlots(state, ap).forEach(s => hl.push(ap + "-" + s)); } if (tm === "enemy_empty_slot") { getEmptyUnitSlots(state, oppId).forEach(s => hl.push(oppId + "-" + s)); } if (tm === "enemy_front_empty_slot") { ["frontLeft", "frontCenter", "frontRight"].forEach(s => { if (!oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } if (tm === "enemy_any_slot") { UNIT_SLOTS.forEach(s => hl.push(oppId + "-" + s)); } if (tm === "any_helper") { UNIT_SLOTS.forEach(s => { if (player.board[s]) hl.push(ap + "-" + s); if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } return hl; }
    if (selectedCard !== null) { const card = player.hand[selectedCard]; if (card && card.lineage && LINEAGE_TO_COPY[card.lineage] && !(player.currentCopy && player.currentCopy.id === "C14")) hl.push(ap + "-leader"); }
    if (pending) { const tm = pending.targetMode; if (tm === "enemy_any") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); hl.push(oppId + "-leader"); } if (tm === "enemy_helper") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } if (tm === "enemy_helper_atk3_or_less") { UNIT_SLOTS.forEach(s => { const u = oppPlayer.board[s]; if (u && getEffectiveAttack(u, state) <= 3) hl.push(oppId + "-" + s); }); } if (tm === "enemy_helper_damaged") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s] && oppPlayer.board[s].currentHp < oppPlayer.board[s].hp) hl.push(oppId + "-" + s); }); } if (tm === "friendly_red") { UNIT_SLOTS.forEach(s => { if (player.board[s] && player.board[s].attr === "Red") hl.push(ap + "-" + s); }); } if (tm === "friendly_any") { UNIT_SLOTS.forEach(s => { if (player.board[s]) hl.push(ap + "-" + s); }); hl.push(ap + "-leader"); } if (tm === "choice_dynablade") { hl.push(ap + "-leader"); if (pending.slot) hl.push(ap + "-" + pending.slot); } if (tm === "any_empty_slot") { getEmptyUnitSlots(state, ap).forEach(s => hl.push(ap + "-" + s)); getEmptyUnitSlots(state, oppId).forEach(s => hl.push(oppId + "-" + s)); } if (tm === "enemy_empty_slot") { getEmptyUnitSlots(state, oppId).forEach(s => hl.push(oppId + "-" + s)); } if (tm === "enemy_front_empty_slot") { ["frontLeft", "frontCenter", "frontRight"].forEach(s => { if (!oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } if (tm === "friendly_empty") { getEmptyUnitSlots(state, ap).forEach(s => hl.push(ap + "-" + s)); } return hl; }
    if (state.pendingKuu) { if (state.pendingKuu.phase === "selectHelper") { UNIT_SLOTS.forEach(s => { const u = player.board[s]; if (u) hl.push(ap + "-" + s); }); } if (state.pendingKuu.phase === "selectDest") { UNIT_SLOTS.forEach(s => { if (s !== state.pendingKuu.sourceSlot) hl.push(ap + "-" + s); }); } return hl; }
    if (selectedCard !== null) { const card = player.hand[selectedCard]; if (!card) return []; if (card.type === "helper" && getEffCost(card) <= player.mana) { getEmptyUnitSlots(state, ap).forEach(s => hl.push(ap + "-" + s)); } else if (card.type === "spell") { if (card.effect === "deal3_helper") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } else if (card.effect === "destroy_atk3_or_less") { UNIT_SLOTS.forEach(s => { const u = oppPlayer.board[s]; if (u && getEffectiveAttack(u, state) <= 3) hl.push(oppId + "-" + s); }); } else if (card.effect === "heal3" || card.effect === "heal5" || card.effect === "heal1") { UNIT_SLOTS.forEach(s => { if (player.board[s]) hl.push(ap + "-" + s); }); hl.push(ap + "-leader"); } else if (card.effect === "freeze" || card.effect === "snowball_debuff") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } } }
    if (selectedUnit) { getValidAttackTargets(state, selectedUnit.player, selectedUnit.slot).forEach(t => { hl.push(t === "leader" ? oppId + "-leader" : oppId + "-" + t); }); }
    return hl;
  }, [gamePhase, pending, selectedCard, selectedUnit, state, ap, oppId]);

  const handleSlotClick = useCallback((clickedPlayer, clickedSlot) => {
    if (state.phase !== "playing" || !state.turnStarted) return;
    if (state.pendingKain || state.pendingTwisterDiscard || state.pendingWaterDiscard) return;
    const isUnitSlot = UNIT_SLOTS.includes(clickedSlot);
    const clickedUnit = isUnitSlot ? state.players[clickedPlayer]?.board[clickedSlot] : null;
    if (state.pendingWaza) { const pw = state.pendingWaza; let valid = false; if (pw.targetMode === "attack") { const leaderTargets = getValidLeaderAttackTargets(state, ap); if (clickedPlayer === oppId && clickedSlot === "leader" && leaderTargets.includes("leader")) valid = true; if (clickedPlayer === oppId && isUnitSlot && leaderTargets.includes(clickedSlot)) valid = true; } else if (pw.targetMode === "enemy_any") { if (clickedPlayer === oppId && clickedSlot === "leader") valid = true; if (clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) valid = true; } else if (pw.targetMode === "enemy_helper") { if (clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) valid = true; } else if (pw.targetMode === "any_helper") { if (isUnitSlot && state.players[clickedPlayer]?.board[clickedSlot]) valid = true; } else if (pw.targetMode === "enemy_helper_atk3_or_less") { if (clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot] && getEffectiveAttack(oppPlayer.board[clickedSlot], state) <= 3) valid = true; } else if (pw.targetMode === "friendly_red_helper") { if (clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]?.attr === "Red") valid = true; } else if (pw.targetMode === "friendly_helper") { if (clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]) valid = true; } else if (pw.targetMode === "friendly_empty") { if (clickedPlayer === ap && isUnitSlot && !player.board[clickedSlot]) valid = true; } else if (pw.targetMode === "enemy_empty_slot") { if (clickedPlayer === oppId && isUnitSlot && !oppPlayer.board[clickedSlot]) valid = true; } else if (pw.targetMode === "enemy_front_empty_slot") { if (clickedPlayer === oppId && ["frontLeft", "frontCenter", "frontRight"].includes(clickedSlot) && !oppPlayer.board[clickedSlot]) valid = true; } else if (pw.targetMode === "enemy_any_slot") { if (clickedPlayer === oppId && isUnitSlot) valid = true; } if (valid) { dispatch({ type: "RESOLVE_WAZA_TARGET", targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); } return; }
    if (selectedCard !== null && clickedPlayer === ap && clickedSlot === "leader") { const card = player.hand[selectedCard]; if (card && card.lineage && LINEAGE_TO_COPY[card.lineage]) { dispatch({ type: "TRANSFORM", cardIndex: selectedCard }); clearSelection(); setInspectedUnit(null); return; } }
    if (clickedPlayer === ap && clickedSlot === "leader" && player.currentCopy && selectedCard === null && !selectedUnit && !pending) { dispatch({ type: "TOGGLE_WAZA_PANEL" }); clearSelection(); setInspectedUnit(null); return; }
    if (pending) { const tm = pending.targetMode; const isEH = clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]; const isEL = clickedPlayer === oppId && clickedSlot === "leader"; const isFR = clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]?.attr === "Red"; const isDE = isEH && oppPlayer.board[clickedSlot].currentHp < oppPlayer.board[clickedSlot].hp; let valid = false; if (tm === "enemy_any" && (isEH || isEL)) valid = true; if (tm === "enemy_helper" && isEH) valid = true; if (tm === "enemy_helper_damaged" && isDE) valid = true; if (tm === "friendly_red" && isFR) valid = true; if (tm === "friendly_any") { if (clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]) valid = true; if (clickedPlayer === ap && clickedSlot === "leader") valid = true; } if (tm === "choice_dynablade") { if (clickedPlayer === ap && clickedSlot === "leader") valid = true; if (clickedPlayer === ap && clickedSlot === pending.slot) valid = true; } if (tm === "any_empty_slot") { if (isUnitSlot && !state.players[clickedPlayer]?.board[clickedSlot]) valid = true; } if (tm === "enemy_empty_slot") { if (clickedPlayer === oppId && isUnitSlot && !oppPlayer.board[clickedSlot]) valid = true; } if (tm === "friendly_empty") { if (clickedPlayer === ap && isUnitSlot && !player.board[clickedSlot]) valid = true; } if (valid) { dispatch({ type: "RESOLVE_SUMMON_EFFECT", targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); } return; }
    if (state.pendingKuu) { if (state.pendingKuu.phase === "selectHelper") { if (clickedPlayer === ap && isUnitSlot && clickedUnit) { dispatch({ type: "RESOLVE_KUU_HELPER", slot: clickedSlot }); clearSelection(); setInspectedUnit(null); } } else if (state.pendingKuu.phase === "selectDest") { if (clickedPlayer === ap && isUnitSlot && clickedSlot !== state.pendingKuu.sourceSlot) { dispatch({ type: "RESOLVE_KUU_DEST", slot: clickedSlot }); clearSelection(); setInspectedUnit(null); } } return; }
    if (selectedCard !== null) { const card = player.hand[selectedCard]; if (card.type === "helper" && clickedPlayer === ap && isUnitSlot && !player.board[clickedSlot] && getEffCost(card) <= player.mana) { dispatch({ type: "SUMMON", cardIndex: selectedCard, slot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; } if (card.type === "spell") { if (card.effect === "deal3_helper" && clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; } if (card.effect === "destroy_atk3_or_less" && clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot] && getEffectiveAttack(oppPlayer.board[clickedSlot], state) <= 3) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; } if (card.effect === "heal3" || card.effect === "heal5" || card.effect === "heal1") { if (clickedSlot === "leader" && clickedPlayer === ap) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: "leader" }); clearSelection(); setInspectedUnit(null); return; } if (clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; } } if ((card.effect === "freeze" || card.effect === "snowball_debuff") && clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; } } clearSelection(); return; }
    if (selectedUnit) { if (clickedPlayer === selectedUnit.player && clickedSlot === selectedUnit.slot) { clearSelection(); return; } const targets = getValidAttackTargets(state, selectedUnit.player, selectedUnit.slot); if (clickedSlot === "leader" && clickedPlayer === oppId && targets.includes("leader")) { dispatch({ type: "ATTACK", attackerSlot: selectedUnit.slot, targetSlot: "leader" }); clearSelection(); setInspectedUnit(null); return; } if (clickedPlayer === oppId && targets.includes(clickedSlot)) { dispatch({ type: "ATTACK", attackerSlot: selectedUnit.slot, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; } if (clickedPlayer === ap && isUnitSlot && clickedUnit) { const u = clickedUnit; if (!u.hasAttacked && !u.frozen && !u.keywords.includes("immobile") && u.effect !== "no_attack" && !(u.effect === "no_atk_full_hp" && u.currentHp >= u.hp) && (!u.summonedThisTurn || u.keywords.includes("dash1") || u.keywords.includes("dash2"))) { setSelectedUnit({ player: clickedPlayer, slot: clickedSlot }); setSelectedCard(null); setInspectedUnit(null); return; } } clearSelection(); return; }
    if (clickedPlayer === ap && isUnitSlot && clickedUnit) { const u = clickedUnit; if (!u.hasAttacked && !u.frozen && !u.keywords.includes("immobile") && u.effect !== "no_attack" && !(u.effect === "no_atk_full_hp" && u.currentHp >= u.hp) && (!u.summonedThisTurn || u.keywords.includes("dash1") || u.keywords.includes("dash2"))) { setSelectedUnit({ player: clickedPlayer, slot: clickedSlot }); setSelectedCard(null); setInspectedUnit(null); return; } }
    if (clickedUnit) { if (inspectedUnit?.player === clickedPlayer && inspectedUnit?.slot === clickedSlot) { setInspectedUnit(null); } else { setInspectedUnit({ player: clickedPlayer, slot: clickedSlot }); } return; }
    clearSelection(); setInspectedUnit(null);
  }, [state, pending, selectedCard, selectedUnit, inspectedUnit, ap, oppId, player, oppPlayer, clearSelection, getEffCost]);

  const NO_TARGET_SPELLS = ["energy_drink", "rick_dmg", "kain_cycle", "kuu_move"];
  const handleCardClick = useCallback((index) => {
    if (state.phase !== "playing" || !state.turnStarted) return;
    if (state.pendingKain) { const card = player.hand[index]; if (card) { dispatch({ type: "RESOLVE_KAIN", cardIndex: index }); clearSelection(); setInspectedUnit(null); } return; }
    if (state.pendingTwisterDiscard) { const card = player.hand[index]; if (card) { dispatch({ type: "RESOLVE_TWISTER_DISCARD", cardIndex: index }); clearSelection(); setInspectedUnit(null); } return; }
    if (state.pendingWaterDiscard) { const card = player.hand[index]; if (card) { dispatch({ type: "RESOLVE_WATER_DISCARD", cardIndex: index }); clearSelection(); setInspectedUnit(null); } return; }
    if (pending || state.pendingWaza || state.pendingSpread || state.pendingGalactica) return;
    const card = player.hand[index]; if (!card) return;
    const canAfford = getEffCost(card) <= player.mana;
    const canTransform = card.lineage && LINEAGE_TO_COPY[card.lineage] && !(player.currentCopy && player.currentCopy.id === "C14");
    if (!canAfford && !canTransform) { if (selectedCard === index) clearSelection(); else { setSelectedCard(index); setSelectedUnit(null); setInspectedUnit(null); } return; }
    if (canAfford && card.type === "spell" && NO_TARGET_SPELLS.includes(card.effect)) { dispatch({ type: "CAST_SPELL", cardIndex: index, targetPlayer: ap, targetSlot: null }); clearSelection(); setInspectedUnit(null); return; }
    if (selectedCard === index) clearSelection(); else { setSelectedCard(index); setSelectedUnit(null); setInspectedUnit(null); }
  }, [state, pending, player, selectedCard, clearSelection, getEffCost, ap]);

  const inspectedData = inspectedUnit ? state.players[inspectedUnit.player]?.board[inspectedUnit.slot] : null;

  if (gamePhase === "deckSelect") { const currentPlayer = p1Color === null ? "P1" : "P2"; return (<DeckSelectScreen playerLabel={currentPlayer} savedDecks={savedDecks} loading={storageLoading} onSelectDefault={(color) => { if (p1Color === null) { setP1Color(color); setP1CustomDeck(null); } else { setP2Color(color); setP2CustomDeck(null); setGamePhase("supportSelect"); } }} onSelectCustom={(deck) => { if (p1Color === null) { setP1Color(deck.color); setP1CustomDeck(deck); } else { setP2Color(deck.color); setP2CustomDeck(deck); setGamePhase("supportSelect"); } }} onCreateNew={() => { setEditingDeck(null); setGamePhase("deckEdit"); }} onEditDeck={(deck) => { setEditingDeck(deck); setGamePhase("deckEdit"); }} onDeleteDeck={(storageKey) => { deleteDeckFromStorage(storageKey); }} />); }
  if (gamePhase === "deckEdit") { return (<DeckEditScreen initialData={editingDeck} onSave={(deckData) => { if (editingDeck && editingDeck._storageKey) { updateDeckInStorage(editingDeck._storageKey, { ...deckData, createdAt: editingDeck.createdAt }); } else { saveDeckToStorage(deckData); } setEditingDeck(null); setGamePhase("deckSelect"); }} onBack={() => { setEditingDeck(null); setGamePhase("deckSelect"); }} />); }
  if (gamePhase === "mulligan") {
    const colorEmoji2 = { Red: "🔴", Blue: "🔵", Green: "🟢", White: "⚪", Orange: "🟠" };
    const screenBg2 = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", gap: "24px", padding: "24px" };
    const btnStyle2 = { padding: "16px 48px", fontSize: "17px", fontWeight: "900", background: "linear-gradient(135deg,#FF69B4,#FF1493)", border: "none", borderRadius: "30px", color: "#fff", cursor: "pointer", boxShadow: "0 4px 20px rgba(255,105,180,0.4)" };
    if (mulliganStep === "p1_pass") return (<div style={screenBg2}><div style={{ fontSize: "56px" }}>🃏</div><h2 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center", lineHeight: 1.5 }}>プレイヤー1 に<br/>デバイスを渡してください</h2><div style={{ fontSize: "14px", opacity: 0.6 }}>{colorEmoji2[p1Color]} {p1Color} デッキ — マリガン準備</div><button onClick={() => setMulliganStep("p1_select")} style={btnStyle2}>準備OK！ →</button></div>);
    if (mulliganStep === "p1_select") return (<MulliganScreen playerId="p1" hand={state.players.p1.hand} onConfirm={(indices) => { if (indices.length > 0) dispatch({ type: "MULLIGAN", playerId: "p1", returnIndices: indices }); setMulliganStep("p2_pass"); }} />);
    if (mulliganStep === "p2_pass") return (<div style={screenBg2}><div style={{ fontSize: "56px" }}>🃏</div><h2 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center", lineHeight: 1.5 }}>プレイヤー2 に<br/>デバイスを渡してください</h2><div style={{ fontSize: "14px", opacity: 0.6 }}>{colorEmoji2[p2Color]} {p2Color} デッキ — マリガン準備</div><button onClick={() => setMulliganStep("p2_select")} style={btnStyle2}>準備OK！ →</button></div>);
    if (mulliganStep === "p2_select") return (<MulliganScreen playerId="p2" hand={state.players.p2.hand} onConfirm={(indices) => { if (indices.length > 0) dispatch({ type: "MULLIGAN", playerId: "p2", returnIndices: indices }); setMulliganStep(null); setGamePhase("playing"); }} />);
  }

  const colorEmoji = { Red: "🔴", Blue: "🔵", Green: "🟢", White: "⚪", Orange: "🟠" };

  if (gamePhase === "supportSelect") { const colorNames = { Red: "🔴 赤", Blue: "🔵 青", Green: "🟢 緑", White: "⚪ 白", Orange: "🟠 橙" }; const currentPick = p1Support === undefined ? "P1" : "P2"; const supportEmojis = { 191: "🐹", 192: "🐟", 193: "🦉" }; const handleSupportPick = (card) => { if (p1Support === undefined) { setP1Support(card); } else { setP2Support(card); dispatch({ type: "RESTART_WITH_COLORS", p1Color, p2Color, p1Support: p1Support, p2Support: card, p1Custom: p1CustomDeck, p2Custom: p2CustomDeck }); setMulliganStep("p1_pass"); setGamePhase("mulligan"); } }; return (<div style={screenBg}><div style={{ fontSize: "48px" }}>🐾</div><h2 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center" }}>{currentPick} のサポートカードを選んでください</h2><div style={{ fontSize: "13px", opacity: 0.6, textAlign: "center" }}>P1: {colorNames[p1Color]} / P2: {colorNames[p2Color]}{p1Support !== undefined && p1Support !== null ? <span> — P1サポート: {supportEmojis[p1Support.id]}{p1Support.name}</span> : p1Support === null ? <span> — P1サポート: なし</span> : null}</div><div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "320px", width: "100%" }}>{SUPPORT_CARDS.map(card => (<button key={card.id} onClick={() => handleSupportPick(card)} style={{ padding: "16px 18px", borderRadius: "14px", background: "linear-gradient(135deg, #1e293b, #334155)", border: "2px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", gap: "14px", boxShadow: "0 4px 16px rgba(0,0,0,0.3)", transition: "all 0.2s" }}><div style={{ fontSize: "32px", flexShrink: 0 }}>{supportEmojis[card.id]}</div><div style={{ textAlign: "left", flex: 1 }}><div style={{ fontSize: "16px", fontWeight: "900", color: "#fff" }}>{card.name}<span style={{ fontSize: "11px", fontWeight: "600", color: "#818CF8", marginLeft: "8px" }}>コスト {card.cost}</span></div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "4px", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{card.desc}</div></div></button>))}<button onClick={() => handleSupportPick(null)} style={{ padding: "16px 18px", borderRadius: "14px", background: "linear-gradient(135deg, #1e293b, #334155)", border: "2px solid rgba(255,255,255,0.1)", cursor: "pointer", display: "flex", alignItems: "center", gap: "14px", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}><div style={{ fontSize: "32px", flexShrink: 0 }}>✖️</div><div style={{ textAlign: "left", flex: 1 }}><div style={{ fontSize: "16px", fontWeight: "900", color: "#fff" }}>サポートなし</div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>サポートカードを使わずにプレイ</div></div></button></div></div>); }
  const pColor = player.deckColor; const oColor = oppPlayer.deckColor;

  if (state.phase === "passDevice") return (<div style={screenBg}><div style={{ fontSize: "56px" }}>🌟</div><h2 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center", lineHeight: 1.5 }}>プレイヤー {ap==="p1"?"1":"2"} に<br/>デバイスを渡してください</h2><div style={{ fontSize: "14px", opacity: 0.6 }}>{colorEmoji[state.players[ap].deckColor]} {state.players[ap].deckColor} デッキ</div><button onClick={() => dispatch({ type: "CONFIRM_PASS" })} style={btnStyle}>準備OK！ →</button></div>);
  if (state.phase === "gameOver") return (<div style={screenBg}><div style={{ fontSize: "64px" }}>🎉</div><h2 style={{ fontSize: "26px", fontWeight: "900" }}>プレイヤー {state.winner==="p1"?"1":"2"} の勝利！</h2><div style={{ fontSize: "14px", opacity: 0.6 }}>P1 {colorEmoji[state.players.p1.deckColor]} HP:{state.players.p1.leaderHp} / P2 {colorEmoji[state.players.p2.deckColor]} HP:{state.players.p2.leaderHp}</div><div style={{ fontSize: "13px", opacity: 0.5, marginTop: "4px" }}>ターン数: {state.turn}</div><button onClick={downloadBattleLog} style={{ ...btnStyle, background: "linear-gradient(135deg, #1e3a5f, #1e4d8c)", fontSize: "14px", marginBottom: "4px" }}>対戦ログをダウンロード</button><button onClick={() => { setGamePhase("deckSelect"); setP1Color(null); setP2Color(null); setP1Support(undefined); setP2Support(undefined); setP1CustomDeck(null); setP2CustomDeck(null); setEditingDeck(null); clearSelection(); setInspectedUnit(null); }} style={btnStyle}>もう一度遊ぶ</button></div>);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#0f172a 0%,#1e293b 40%,#0f3460 100%)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 4px", gap: "4px", overflowX: "hidden" }}>
      <style>{`@keyframes popupFloat { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); } 40% { opacity: 1; transform: translate(-50%, -100%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -160%) scale(0.7); } } @keyframes hexShake { 0% { transform: translate(0,0); } 15% { transform: translate(-4px,2px); } 30% { transform: translate(4px,-2px); } 45% { transform: translate(-3px,1px); } 60% { transform: translate(3px,-1px); } 75% { transform: translate(-1px,1px); } 100% { transform: translate(0,0); } } @keyframes spawnRing { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0.75; } 100% { transform: translate(-50%,-50%) scale(1.2); opacity: 0; } } @keyframes hexSpinY { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(180deg); } } @keyframes cardGlowGreen { 0%, 100% { box-shadow: 0 0 3px 1px rgba(16,185,129,0.3); } 50% { box-shadow: 0 0 8px 3px rgba(16,185,129,0.6), 0 0 16px 6px rgba(16,185,129,0.2); } } @keyframes cardGlowBlue { 0%, 100% { box-shadow: 0 0 3px 1px rgba(96,165,250,0.3); } 50% { box-shadow: 0 0 8px 3px rgba(96,165,250,0.6), 0 0 16px 6px rgba(96,165,250,0.2); } } @keyframes cardGlowUR { 0% { box-shadow: 0 0 4px 2px rgba(185,242,255,0.2), 0 0 8px 4px rgba(255,215,0,0.1); } 33% { box-shadow: 0 0 6px 3px rgba(255,215,0,0.3), 0 0 12px 6px rgba(185,242,255,0.15); } 66% { box-shadow: 0 0 6px 3px rgba(185,242,255,0.3), 0 0 12px 6px rgba(255,180,255,0.15); } 100% { box-shadow: 0 0 4px 2px rgba(185,242,255,0.2), 0 0 8px 4px rgba(255,215,0,0.1); } } @keyframes barrierPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
      {inspectedData && <CardInfoPanel unit={inspectedData} onClose={() => setInspectedUnit(null)} />}
      {selectedCard !== null && player.hand[selectedCard] && !inspectedData && <CardInfoPanel card={player.hand[selectedCard]} onClose={() => clearSelection()} />}
      <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 1000 }}>{!showResetConfirm ? <button onClick={() => setShowResetConfirm(true)} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", color: "rgba(255,255,255,0.5)", fontSize: "10px", cursor: "pointer" }}>🔄 リセット</button> : <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "rgba(0,0,0,0.8)", padding: "8px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)" }}><span style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)" }}>リセットする？</span><button onClick={() => { setShowResetConfirm(false); setGamePhase("deckSelect"); setP1Color(null); setP2Color(null); setP1Support(undefined); setP2Support(undefined); setP1CustomDeck(null); setP2CustomDeck(null); setEditingDeck(null); clearSelection(); setInspectedUnit(null); }} style={{ padding: "4px 10px", background: "#DC2626", border: "none", borderRadius: "6px", color: "#fff", fontSize: "10px", fontWeight: "700", cursor: "pointer" }}>はい</button><button onClick={() => setShowResetConfirm(false)} style={{ padding: "4px 10px", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "6px", color: "rgba(255,255,255,0.7)", fontSize: "10px", cursor: "pointer" }}>いいえ</button></div>}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 14px", background: "rgba(255,255,255,0.06)", borderRadius: "10px", fontSize: "12px", width: "100%", maxWidth: "380px", justifyContent: "space-between" }}><span style={{ fontWeight: "800", opacity: 0.6 }}>{colorEmoji[oColor]}P{oppId==="p1"?"1":"2"}</span><span>❤{oppPlayer.leaderHp}</span><span>💎{oppPlayer.mana}/{oppPlayer.maxMana}</span><span style={{ color: oppPlayer.hand.length >= 9 ? "#FF4444" : oppPlayer.hand.length >= 7 ? "#FB923C" : "inherit" }}>🃏{oppPlayer.hand.length}</span><span>📦{oppPlayer.deck.length}</span><span>💀{oppPlayer.graveyard.length}</span></div>
      <HoneycombBoard player={oppPlayer} playerId={oppId} state={state} selectedUnit={selectedUnit} highlightSlots={highlightSlots} onSlotClick={handleSlotClick} isFlipped={true} inspectedUnit={inspectedUnit} popups={popups} />
      <div style={{ width: "85%", maxWidth: "340px", height: "2px", background: "linear-gradient(90deg,transparent,rgba(255,105,180,0.5),transparent)", margin: "2px 0" }} />
      <HoneycombBoard player={player} playerId={ap} state={state} selectedUnit={selectedUnit} highlightSlots={highlightSlots} onSlotClick={handleSlotClick} isFlipped={false} inspectedUnit={inspectedUnit} popups={popups} />
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 14px", background: "rgba(255,105,180,0.12)", borderRadius: "10px", fontSize: "12px", width: "100%", maxWidth: "380px", justifyContent: "space-between", border: "1px solid rgba(255,105,180,0.2)" }}><span style={{ fontWeight: "900", color: "#FF69B4" }}>★{colorEmoji[pColor]}P{ap==="p1"?"1":"2"}</span><span>❤{player.leaderHp}</span><span>💎{player.mana}/{player.maxMana}</span><span>📦{player.deck.length}</span><span>💀{player.graveyard.length}</span><span style={{ color: player.hand.length >= 9 ? "#FF4444" : player.hand.length >= 7 ? "#FB923C" : "#fff" }}>🃏{player.hand.length}</span>{player.costReduction > 0 && <span style={{ color: "#A78BFA", fontSize: "10px" }}>次-{player.costReduction}</span>}<button onClick={() => { if (!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && !state.pendingSpread && !state.pendingGalactica) { dispatch({ type: "END_TURN" }); clearSelection(); setInspectedUnit(null); } }} style={{ padding: "5px 16px", background: (pending || state.pendingKain || state.pendingKuu || state.pendingTwisterDiscard || state.pendingWaza || state.pendingWaterDiscard || state.pendingSpread || state.pendingGalactica) ? "#666" : "linear-gradient(135deg,#FF69B4,#FF1493)", border: "none", borderRadius: "16px", color: "#fff", fontWeight: "900", fontSize: "11px", cursor: (pending || state.pendingKain || state.pendingKuu || state.pendingTwisterDiscard || state.pendingWaza || state.pendingWaterDiscard || state.pendingSpread || state.pendingGalactica) ? "not-allowed" : "pointer", boxShadow: (pending || state.pendingKain || state.pendingKuu || state.pendingTwisterDiscard || state.pendingWaza || state.pendingWaterDiscard || state.pendingSpread || state.pendingGalactica) ? "none" : "0 2px 8px rgba(255,20,147,0.3)" }}>ターン終了</button></div>
      {state.showWazaPanel && player.currentCopy && (() => { const co = {}; player.currentCopy.wazas.forEach(w => { let c = w.cost; if (w.id === "ice1" && checkLink(state, ap, "base", "White", 1)) c = Math.max(0, c - 1); co[w.id] = c; }); const atkBonus = (player.leaderAtkBonus || 0) + UNIT_SLOTS.filter(sl => player.board[sl] && player.board[sl].id === 402).length; const sparkLaserDmg = 1 + (player.sparkLaserBonus || 0); const linkBlueI = checkLink(state, ap, "base", "Blue", 1); const hammerFireDmg = player.hammerFireDmg || 1; const linkRedII = checkLink(state, ap, "base", "Red", 2); const wazaDmgBonus = getWazaDmgBonus(player); return <WazaPanel copy={player.currentCopy} stocks={player.wazaStocks} mana={player.mana} usedThisTurn={player.usedWazaThisTurn} costOverrides={co} transformedThisTurn={player.transformedThisTurn} leaderAtkBonus={atkBonus} sparkLaserDmg={sparkLaserDmg} linkBlueI={linkBlueI} hammerFireDmg={hammerFireDmg} linkRedII={linkRedII} wazaDmgBonus={wazaDmgBonus} heroShieldCooldown={player.heroShieldCooldown || 0} ice3Cooldown={player.ice3Cooldown || 0} onSelect={(wazaId) => { dispatch({ type: "USE_WAZA", wazaId }); clearSelection(); setInspectedUnit(null); }} onClose={() => dispatch({ type: "TOGGLE_WAZA_PANEL" })} />; })()}
      <div style={{ display: "flex", gap: "6px", padding: "8px 10px", overflowX: "auto", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>{player.hand.map((card, i) => { let ps; if (state.pendingKain) ps = "playable"; else if (state.pendingTwisterDiscard || state.pendingWaterDiscard) ps = "playable"; else if (getEffCost(card) <= player.mana) ps = "playable"; else if (card.lineage && LINEAGE_TO_COPY[card.lineage] && !(player.currentCopy && player.currentCopy.id === "C14")) ps = "copyOnly"; else ps = "disabled"; return <CardInHand key={i} card={card} index={i} isSelected={selectedCard===i} playState={ps} effCost={getEffCost(card)} friendlyDeathCount={player.graveyard.length} onClick={() => handleCardClick(i)} />; })}</div>
      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textAlign: "center", minHeight: "14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
        {pending && pending.targetMode === "choice_dynablade" && <span>🦅 リーダー=3枚ドロー / ダイナブレイド=HP+5</span>}
        {pending && pending.targetMode !== "choice_dynablade" && <span>{"🎯 " + pending.cardName + "の対象を選んでください"}</span>}
        {pending && <button onClick={() => { dispatch({ type: "CANCEL_SUMMON_EFFECT" }); clearSelection(); }} style={{ padding: "3px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", color: "rgba(255,255,255,0.6)", fontSize: "10px", cursor: "pointer" }}>⏩ スキップ</button>}
        {state.pendingKain && <span>🐟 デッキに戻すカードを手札から選んでください</span>}
        {state.pendingKain && <button onClick={() => { dispatch({ type: "CANCEL_KAIN" }); clearSelection(); }} style={{ padding: "3px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", color: "rgba(255,255,255,0.6)", fontSize: "10px", cursor: "pointer" }}>⏩ スキップ</button>}
        {state.pendingKuu?.phase === "selectHelper" && <span>🦉 移動する味方ヘルパーをタップ</span>}
        {state.pendingKuu?.phase === "selectDest" && <span>🦉 移動先のマスをタップ（味方と入れ替え可）</span>}
        {state.pendingKuu && <button onClick={() => { dispatch({ type: "CANCEL_KUU" }); clearSelection(); }} style={{ padding: "3px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", color: "rgba(255,255,255,0.6)", fontSize: "10px", cursor: "pointer" }}>⏩ スキップ</button>}
        {state.pendingTwisterDiscard && <span>🌪️ 捨てるカードを手札から選んでください</span>}
        {state.pendingTwisterDiscard && <button onClick={() => { dispatch({ type: "CANCEL_TWISTER_DISCARD" }); clearSelection(); }} style={{ padding: "3px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", color: "rgba(255,255,255,0.6)", fontSize: "10px", cursor: "pointer" }}>⏩ ランダムに捨てる</button>}
        {state.pendingWaza && <span>{"🎯 " + state.pendingWaza.waza.name + "の対象を選んでください"}</span>}
        {state.pendingWaza && <button onClick={() => { dispatch({ type: "CANCEL_WAZA" }); clearSelection(); }} style={{ padding: "3px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", color: "rgba(255,255,255,0.6)", fontSize: "10px", cursor: "pointer" }}>⏩ キャンセル</button>}
        {state.pendingWaterDiscard && <span>💧 捨てるカードを手札から選んでください</span>}
        {state.pendingWaterDiscard && <button onClick={() => { dispatch({ type: "CANCEL_WATER_DISCARD" }); clearSelection(); }} style={{ padding: "3px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", color: "rgba(255,255,255,0.6)", fontSize: "10px", cursor: "pointer" }}>⏩ スキップ</button>}
        {state.pendingSpread && <span>{state.pendingSpread.sourceEmoji} {state.pendingSpread.sourceName}: 残り{state.pendingSpread.remaining}ダメ分配中…</span>}
        {state.pendingGalactica && <span>🌌 ギャラクティックナイト: 残り{state.pendingGalactica.remaining}回…</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && !state.pendingSpread && !state.pendingGalactica && selectedCard !== null && player.hand[selectedCard]?.lineage && LINEAGE_TO_COPY[player.hand[selectedCard].lineage] && <span>🌟 リーダー(本陣)をタップで変身 / マスをタップで召喚</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && !state.pendingSpread && !state.pendingGalactica && selectedCard !== null && !player.hand[selectedCard]?.lineage && player.hand[selectedCard]?.type === "helper" && <span>📍 配置先のマスをタップ</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && !state.pendingSpread && !state.pendingGalactica && selectedCard !== null && player.hand[selectedCard]?.type === "spell" && <span>🎯 対象をタップ</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && !state.pendingSpread && !state.pendingGalactica && selectedUnit && <span>⚔️ 攻撃対象をタップ（赤ハイライト）</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && !state.pendingSpread && !state.pendingGalactica && !selectedCard && !selectedUnit && <span>{player.currentCopy ? "リーダーをタップでワザ / カードか味方をタップ" : "カードか味方ユニットをタップして操作"}</span>}
      </div>
      <div style={{ width: "100%", maxWidth: "380px", maxHeight: "70px", overflowY: "auto", background: "rgba(0,0,0,0.25)", borderRadius: "8px", padding: "5px 10px", fontSize: "10px", lineHeight: 1.5, color: "rgba(255,255,255,0.5)" }}>{state.log.map((l, i) => <div key={i} style={{ opacity: i===0?1:0.55 }}>{l}</div>)}</div>
    </div>
  );
}
