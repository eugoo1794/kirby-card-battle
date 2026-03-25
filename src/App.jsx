import { useState, useReducer, useCallback, useMemo, useEffect, useRef } from "react";

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

const KEYWORD_ICONS = { dash1: "⚡", dash2: "⚡⚡", block: "🛡️", flying1: "🪽", flying2: "🪽🪽", guard1: "🪨", guard2: "🪨🪨", immobile: "📌", pierce1: "🔱", stealth: "🫥" };

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

const CARD_RARITY = {
  // ── Common属性 ──
  1: "C", 2: "C", 4: "C", 5: "C", 6: "C", 7: "C", 9: "C", 10: "C", 12: "C", 13: "C", 18: "C", 21: "C", 23: "C", 27: "C",
  3: "R", 8: "R", 11: "R", 15: "R", 16: "R", 17: "R", 19: "R", 20: "R", 22: "R", 24: "R", 28: "R",
  14: "SR", 25: "SR", 26: "SR",
  // ── Red ──
  202: "C", 204: "C", 205: "C",
  201: "R", 203: "R",
  206: "SR", 207: "SR", 209: "SR",
  208: "UR", 210: "UR",
  211: "SR",
  // ── Blue ──
  301: "C", 302: "C", 304: "C", 308: "C", 313: "C",
  303: "R", 305: "R", 306: "R", 307: "R", 311: "R",
  309: "SR", 310: "SR", 312: "SR", 314: "SR",
  315: "UR",
  // ── Green ──
  402: "C", 403: "C", 407: "C", 409: "C",
  401: "R", 404: "R", 412: "R",
  405: "SR", 406: "SR", 408: "SR", 410: "SR",
  411: "UR",
  // ── White ──
  501: "C", 504: "C", 509: "C", 510: "C",
  502: "R", 503: "R", 506: "R", 507: "R",
  505: "SR", 508: "SR",
  511: "UR", 512: "UR",
  // ── Orange ──
  602: "C", 603: "C", 604: "C",
  601: "R", 605: "R", 606: "R",
  607: "SR", 608: "SR", 609: "SR",
  610: "UR", 611: "UR",
  // ── Purple ──
  701: "SR",
  // ── Black ──
  801: "SR",
  // ── Support ──
  191: "UR", 192: "UR", 193: "UR",
};

// ═══════════════════════════════════════════
//  TOKEN CARDS
// ═══════════════════════════════════════════
const TOKEN_WADDLE = { id: 851, name: "ワドルディ", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Common", keywords: [], desc: "", isToken: true };
const TOKEN_CAPPYBARE = { id: 853, name: "キャピィ(裸)", type: "helper", cost: 0, attack: 0, hp: 1, attr: "Common", keywords: [], desc: "帽子がとれたすがた", isToken: true };
const TOKEN_RANDIA2 = { id: 854, name: "ランディア(分)", type: "helper", cost: 0, attack: 3, hp: 2, attr: "Red", keywords: [], desc: "", isToken: true };
const TOKEN_BRONT = { id: 855, name: "ブロントバート", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["flying1"], desc: "🪽ふゆうI", isToken: true };
const TOKEN_STARBLOCK = { id: 856, name: "星ブロック", type: "helper", cost: 0, attack: 0, hp: 2, attr: "Common", keywords: ["immobile"], desc: "📌攻撃不可\nお互いのターン終了時\n自身に1ダメージ", effect: "endturn_starblock_decay", isToken: true };
const TOKEN_ENERGY = { id: 857, name: "エナジードリンク", type: "spell", cost: 0, attr: "Common", desc: "このターン中\n使えるPPが1増える", effect: "energy_drink", isToken: true };
const TOKEN_YELLOWSNAKE = { id: 858, name: "イエロースネーク", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: [], desc: "", isToken: true };
const TOKEN_DUBIAJR = { id: 859, name: "ドゥビアJr.", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["dash1"], desc: "⚡ダッシュI", isToken: true };
const TOKEN_FOOD = { id: 860, name: "たべもの", type: "spell", cost: 0, attr: "Common", desc: "キャラ1体の\nHPを1回復", effect: "heal1", isToken: true };
const TOKEN_WAPOD = { id: 861, name: "ワポッド", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: [], desc: "", isToken: true };
const TOKEN_BOMB = { id: 863, name: "ばくだん", type: "helper", cost: 0, attack: 1, hp: 2, attr: "Common", keywords: ["immobile"], desc: "📌攻撃不可\nお互いのターン終了時\n自身に1ダメージ\n死亡時:隣接全ヘルパーに\nATK分ダメージ", effect: "bomb_unit", isToken: true };
const TOKEN_SNOWBALL = { id: 864, name: "雪玉", type: "spell", cost: 2, attr: "White", desc: "敵ヘルパー1体を\n-2/-2する", effect: "snowball_debuff", isToken: true };

// ═══════════════════════════════════════════
//  SUPPORT CARDS (リック・カイン・クー)
// ═══════════════════════════════════════════
const SUPPORT_CARDS = [
  { id: 191, name: "リック", type: "spell", cost: 2, attr: "Common", desc: "ランダム敵ヘルパー1体に\n2ダメージ\n🔄2ターン後に手札に戻る", effect: "rick_dmg", isSupport: true },
  { id: 192, name: "カイン", type: "spell", cost: 1, attr: "Common", desc: "手札1枚をデッキに戻し\nカード1枚引く\n🔄2ターン後に手札に戻る", effect: "kain_cycle", isSupport: true },
  { id: 193, name: "クー", type: "spell", cost: 0, attr: "Common", desc: "味方ヘルパー1体を\n空きマスに移動 or\n味方と入れ替え\n🔄2ターン後に手札に戻る", effect: "kuu_move", isSupport: true },
];

// ═══════════════════════════════════════════
//  CARD POOL (flying → flying1/flying2)
// ═══════════════════════════════════════════
const CARD_POOL = [
  { id: 1, name: "ワドルディ", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Common", keywords: [], desc: "", lineage: "waddle" },
  { id: 2, name: "カブー", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["block"], desc: "🛡️ブロック" },
  { id: 3, name: "ブロントバート", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["flying1"], desc: "🪽ふゆうI\n召喚時: 敵味方いずれかの\n空きマスに星ブロック", effect: "summon_starblock", targetMode: "any_empty_slot" },
  { id: 4, name: "セルリアン", type: "helper", cost: 1, attack: 2, hp: 1, attr: "Common", keywords: ["flying1"], desc: "🪽ふゆうI" },
  { id: 201, name: "フレイマー", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Red", keywords: [], desc: "召喚時: 敵がいるなら\nもう1体出す", effect: "summon_copy_if_enemy", lineage: "fire" },
  { id: 301, name: "ハルトワーカーズ", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Blue", keywords: [], desc: "召喚時: 敵1体に\n1ダメージ", effect: "summon_1dmg", targetMode: "enemy_any", lineage: "spark" },
  { id: 302, name: "ウォルフ", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Blue", keywords: ["dash1"], desc: "⚡ダッシュI" },
  { id: 303, name: "プルイド", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Blue", keywords: [], desc: "召喚時: 山札2枚破棄\nプルイドをもう1体出す", effect: "summon_pruid", lineage: "water" },
  { id: 304, name: "クラビィ", type: "helper", cost: 2, attack: 1, hp: 3, attr: "Blue", keywords: [], desc: "正面にいない敵と\n交戦時、このターン中\n攻撃力+2", effect: "flank_atk2", lineage: "water" },
  { id: 305, name: "スターマン", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Blue", keywords: ["dash1"], desc: "⚡ダッシュI\n攻撃時: 自分の山札\n2枚破棄", effect: "attack_self_mill2" },
  { id: 308, name: "バラクー", type: "helper", cost: 3, attack: 3, hp: 1, attr: "Blue", keywords: [], desc: "召喚時＆捨てられた時:\nランダム敵ヘルパーに\n2ダメージ", effect: "summon_and_discard_2dmg", lineage: "water" },
  { id: 401, name: "エレック", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Green", keywords: [], desc: "召喚時: 味方1体に\n1ダメージを与え\nもう1体出す", effect: "summon_elec_dmg_copy", targetMode: "friendly_any", lineage: "spark" },
  { id: 5, name: "ボビー", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["flying2"], desc: "🪽🪽ふゆうII\n攻撃時反撃を受けない" },
  { id: 6, name: "キャピィ", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: [], desc: "死亡時: 0/1として\n復活する", effect: "death_revive" },
  { id: 7, name: "バブット", type: "helper", cost: 1, attack: 3, hp: 1, attr: "Common", keywords: [], desc: "" },
  { id: 8, name: "サンドバッグさん", type: "helper", cost: 1, attack: 0, hp: 3, attr: "Common", keywords: [], desc: "ダメージを受けるたび\nたべものを手札に加える", effect: "on_damage_food" },
  { id: 402, name: "ソドリィ", type: "helper", cost: 1, attack: 2, hp: 1, attr: "Green", keywords: [], desc: "味方リーダーの\n攻撃ダメージ+1\n(未実装:コピー必要)", effect: "", lineage: "sword" },
  { id: 9, name: "ヌラフ", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Common", keywords: ["dash1"], desc: "⚡ダッシュI" },
  { id: 202, name: "ホットヘッド", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Red", keywords: [], desc: "味方リーダーのワザの\nダメージ+1\n(こうげきは除く)", effect: "passive_waza_dmg_bonus", lineage: "fire" },
  { id: 203, name: "ガルボ", type: "helper", cost: 2, attack: 3, hp: 2, attr: "Red", keywords: [], desc: "死亡時: 全リーダーに\n2ダメージ", effect: "death_2dmg_leaders", lineage: "fire" },
  { id: 10, name: "スカーフィ", type: "helper", cost: 2, attack: 1, hp: 3, attr: "Common", keywords: [], desc: "ダメージ中\n攻撃力+3", effect: "enrage3" },
  { id: 307, name: "スクイッシー", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Blue", keywords: [], desc: "死亡時＆捨てられた時:\nカード1枚引く", effect: "death_and_discard_draw", lineage: "water" },
  { id: 601, name: "レーザーボール", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Orange", keywords: [], desc: "召喚時: 敵1体に\n1ダメージ", effect: "summon_1dmg", targetMode: "enemy_any", lineage: "spark" },
  { id: 602, name: "ピアス", type: "helper", cost: 2, attack: 2, hp: 3, attr: "Orange", keywords: ["pierce1"], desc: "🔱貫通I\n攻撃が後ろの敵にも\n貫通する", effect: "" },
  { id: 12, name: "サーキブル", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Common", keywords: [], desc: "召喚時: 相手山札\n2枚墓地へ", effect: "summon_mill2", lineage: "cutter" },
  { id: 403, name: "リーファン", type: "helper", cost: 2, attack: 1, hp: 3, attr: "Green", keywords: [], desc: "召喚時: すべての\n味方を2回復", effect: "summon_heal_all2", lineage: "leaf" },
  { id: 603, name: "ジェムラ", type: "helper", cost: 2, attack: 1, hp: 2, attr: "Orange", keywords: [], desc: "召喚時: 手札の橙\nヘルパーHP+1", effect: "summon_buff_orange_hand", lineage: "beam" },
  { id: 503, name: "スノウル", type: "helper", cost: 2, attack: 2, hp: 2, attr: "White", keywords: [], desc: "死亡時: ランダム敵\n-1/-1", effect: "death_debuff", lineage: "ice" },
  { id: 504, name: "ペンギー", type: "helper", cost: 2, attack: 2, hp: 2, attr: "White", keywords: ["block"], desc: "🛡️ブロック", lineage: "ice" },
  { id: 13, name: "ジャックル", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Common", keywords: [], desc: "ターン終了時:\n相手山札1枚破棄", effect: "endturn_mill1", lineage: "cutter" },
  { id: 11, name: "ハンタースカーフィ", type: "helper", cost: 2, attack: 1, hp: 3, attr: "Common", keywords: [], desc: "相手手札5枚以上で\n攻撃力+3", effect: "hunter_enrage3" },
  { id: 14, name: "ボンバー", type: "helper", cost: 2, attack: 4, hp: 1, attr: "Common", keywords: [], desc: "攻撃後に死亡する", effect: "bomber", lineage: "crash" },
  { id: 15, name: "ウォンキィ", type: "helper", cost: 2, attack: 3, hp: 2, attr: "Common", keywords: ["dash1"], desc: "⚡ダッシュI\n死亡時: 相手1枚引く", effect: "death_opp_draw" },
  { id: 204, name: "ヒートファンファン", type: "helper", cost: 2, attack: 3, hp: 2, attr: "Red", keywords: ["flying1"], desc: "🪽ふゆうI", lineage: "fire" },
  { id: 502, name: "モプー", type: "helper", cost: 2, attack: 1, hp: 1, attr: "White", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時: もう1体出す", effect: "summon_copy_always", lineage: "ice" },
  { id: 501, name: "ワポッドのつぼ", type: "helper", cost: 1, attack: 0, hp: 2, attr: "White", keywords: ["immobile"], desc: "📌攻撃不可\nターン終了時: 自身に\n1ダメ&ワポッド(1/1)を出す", effect: "endturn_spawn_wapod" },
  { id: 507, name: "ドゥビア", type: "helper", cost: 3, attack: 3, hp: 3, attr: "White", keywords: [], desc: "召喚時: ドゥビアJr.\n(1/1ダッシュI)を\n2体手札に加える", effect: "summon_dubia" },
  { id: 306, name: "ウォーターガルボ", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Blue", keywords: [], desc: "召喚時: 敵ヘルパー1体\nの攻撃力-1", effect: "summon_debuff_atk1", targetMode: "enemy_helper", lineage: "water" },
  { id: 604, name: "ワドルドゥ", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Orange", keywords: [], desc: "死亡時:\n【リンク:橙I】\nカード1枚引く", effect: "death_draw_link_o1", lineage: "beam" },
  { id: 605, name: "ウィッピィ", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Orange", keywords: [], desc: "死亡時: 相手手札から\nランダム1枚コピー", effect: "death_copy_opp_hand", lineage: "whip" },
  { id: 205, name: "ボボ", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Red", keywords: [], desc: "死亡時:\nカード1枚引く", effect: "death_draw", lineage: "fire" },
  { id: 16, name: "ブルームハッター", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Common", keywords: [], desc: "死亡時: 次に使う\nカードのコスト-1", effect: "death_cost_reduce" },
  { id: 17, name: "ハンターデグト", type: "helper", cost: 2, attack: 3, hp: 4, attr: "Common", keywords: [], desc: "ダメージを受けていない\n場合、攻撃できない", effect: "no_atk_full_hp" },
  { id: 18, name: "パラソルワドルディ", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Common", keywords: ["guard1"], desc: "🪨ガードI" },
  { id: 19, name: "サーチス", type: "helper", cost: 2, attack: 3, hp: 3, attr: "Common", keywords: [], desc: "次の自分のターン開始時\n全ヘルパー(自身含む)\nに3ダメージ", effect: "start_explode3", lineage: "crash" },
  { id: 404, name: "バルビィ", type: "helper", cost: 2, attack: 2, hp: 3, attr: "Green", keywords: ["stealth"], desc: "🫥せんぷく\n(攻撃するまで対象外)", effect: "", lineage: "leaf" },
  { id: 206, name: "バーニンレオ", type: "helper", cost: 3, attack: 2, hp: 2, attr: "Red", keywords: [], desc: "召喚時: 敵1体に\n2ダメージ", effect: "summon_2dmg_target", targetMode: "enemy_any", lineage: "fire" },
  { id: 207, name: "ナックルジョー", type: "helper", cost: 3, attack: 2, hp: 3, attr: "Red", keywords: [], desc: "召喚時: 赤属性の味方\n攻撃力+1", effect: "summon_buff_red", lineage: "fighter" },
  { id: 406, name: "スパーキー", type: "helper", cost: 3, attack: 3, hp: 3, attr: "Green", keywords: [], desc: "召喚時: 自身含む全\nヘルパーに1ダメージ", effect: "summon_aoe1_self", lineage: "spark" },
  { id: 407, name: "シェルト", type: "helper", cost: 3, attack: 2, hp: 2, attr: "Green", keywords: ["dash2"], desc: "⚡⚡ダッシュII\n召喚ターン中\nダメージを受けない", effect: "summon_immune" },
  { id: 408, name: "オウグルフ", type: "helper", cost: 3, attack: 2, hp: 3, attr: "Green", keywords: [], desc: "召喚時: ダメージ中の\n敵ヘルパー全てを\nHP-2する", effect: "summon_hp_reduce_all_damaged", lineage: "leaf" },
  { id: 606, name: "ロッキー", type: "helper", cost: 3, attack: 3, hp: 2, attr: "Orange", keywords: ["guard1"], desc: "🪨ガードI\n被ダメージ-1", lineage: "stone" },
  { id: 505, name: "チリー", type: "helper", cost: 3, attack: 2, hp: 2, attr: "White", keywords: [], desc: "召喚時: 敵1体を凍結\nヘルパー:行動不能\nリーダー:次ターンワザ不可", effect: "summon_freeze", targetMode: "enemy_any", lineage: "ice" },
  { id: 506, name: "ツイスター", type: "helper", cost: 3, attack: 2, hp: 3, attr: "White", keywords: [], desc: "召喚時: 2枚引いて\n1枚捨てる", effect: "summon_draw2_discard1", lineage: "tornado" },
  { id: 208, name: "デデデ大王", type: "helper", cost: 3, attack: 2, hp: 4, attr: "Red", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時: 残コスト全消費\n→Xダメ&攻撃力+X", effect: "summon_dedede", targetMode: "enemy_any", lineage: "hammer" },
  { id: 701, name: "ノディ", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Purple", keywords: ["immobile"], desc: "📌攻撃不可\n死亡時: 相手のコピー能力\nを「スリープ」にする", effect: "death_sleep_opponent", lineage: "sleep" },
  { id: 801, name: "シャドーカービィ", type: "helper", cost: 3, attack: 2, hp: 2, attr: "Black", keywords: ["guard1"], desc: "🪨ガードI\n召喚時: 敵ヘルパーの\nATK/HPをコピー", effect: "summon_copy_stats", targetMode: "enemy_helper" },
  { id: 607, name: "キングスドゥ", type: "helper", cost: 4, attack: 3, hp: 3, attr: "Orange", keywords: [], desc: "ターン終了時:\n【リンク:橙II】\n正面の敵全体に3ダメ", effect: "endturn_3dmg_facing_link_o2", lineage: "beam" },
  { id: 608, name: "Mr.ダウター", type: "helper", cost: 4, attack: 2, hp: 4, attr: "Orange", keywords: ["pierce1"], desc: "🔱貫通I\nターン終了時:\nイエロースネークを\nX体出す(X=敵ヘルパー数)", effect: "endturn_spawn_snakes" },
  { id: 409, name: "ギガントエッジ", type: "helper", cost: 4, attack: 3, hp: 5, attr: "Green", keywords: ["block"], desc: "🛡️ブロック", lineage: "sword" },
  { id: 22, name: "スフィアローパー", type: "helper", cost: 4, attack: 3, hp: 5, attr: "Common", keywords: ["flying1"], desc: "🪽ふゆうI" },
  { id: 309, name: "ウォーターガルボロス", type: "helper", cost: 4, attack: 3, hp: 4, attr: "Blue", keywords: [], desc: "召喚時: 敵ヘルパー\nの攻撃力-2", effect: "summon_debuff_atk2", targetMode: "enemy_helper", lineage: "water" },
  { id: 20, name: "パペットワドルディ", type: "helper", cost: 4, attack: 2, hp: 4, attr: "Common", keywords: [], desc: "死亡時: ワドルディ\n3体を手札に", effect: "death_waddle3", lineage: "waddle" },
  { id: 21, name: "ザンギブル", type: "helper", cost: 4, attack: 4, hp: 4, attr: "Common", keywords: [], desc: "攻撃時: 相手山札\n2枚墓地へ", effect: "attack_mill2", lineage: "cutter" },
  { id: 310, name: "ファッティバッファー", type: "helper", cost: 4, attack: 5, hp: 4, attr: "Blue", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時: 自分の山札を\n上から2枚破棄", effect: "summon_self_mill2", lineage: "water" },
  { id: 311, name: "巨大フロッツォ", type: "helper", cost: 5, attack: 5, hp: 7, attr: "Blue", keywords: ["block"], desc: "🛡️ブロック\nこのヘルパーは\nこうげきできない", effect: "no_attack" },
  { id: 312, name: "バルバル", type: "spell", cost: 4, attr: "Blue", desc: "攻撃力3以下の\n敵ヘルパー1体を\n消滅させる", effect: "destroy_atk3_or_less" },
  { id: 410, name: "スフィアローパー(緑)", type: "helper", cost: 4, attack: 3, hp: 5, attr: "Green", keywords: [], desc: "召喚時: ダメージ中の\n敵ヘルパーに2ダメ", effect: "summon_2dmg_damaged", targetMode: "enemy_helper_damaged", lineage: "spark" },
  { id: 209, name: "スフィアローパー(赤)", type: "helper", cost: 4, attack: 3, hp: 4, attr: "Red", keywords: ["flying1"], desc: "🪽ふゆうI\n召喚時: 赤味方1体\n攻撃力+2", effect: "summon_buff_red_atk2", targetMode: "friendly_red", lineage: "fire" },
  { id: 508, name: "スフィアローパー(白)", type: "helper", cost: 4, attack: 3, hp: 4, attr: "White", keywords: ["flying1"], desc: "🪽ふゆうI\n召喚時: 敵ヘルパー1体\nを-1/-1する", effect: "summon_debuff_1_1", targetMode: "enemy_helper", lineage: "ice" },
  { id: 509, name: "Mr.フロスティ", type: "helper", cost: 4, attack: 4, hp: 3, attr: "White", keywords: [], desc: "召喚時: スペル\n『雪玉』を手札に加える", effect: "summon_snowball", lineage: "ice" },
  { id: 510, name: "アーマーワドルディ", type: "helper", cost: 4, attack: 3, hp: 4, attr: "White", keywords: [], desc: "ダメージを受けるたび\nワドルディ1枚を\n手札に加える", effect: "on_damage_waddle" },
  { id: 609, name: "マウンデス", type: "helper", cost: 5, attack: 3, hp: 4, attr: "Orange", keywords: ["guard1"], desc: "🪨ガードI\nターン終了時: 手札の\n橙ヘルパー1体を+1/+1", effect: "endturn_buff_orange_hand", lineage: "stone" },
  { id: 610, name: "グランドローパー", type: "helper", cost: 6, attack: 5, hp: 4, attr: "Orange", keywords: ["flying1", "stealth"], desc: "🪽ふゆうI 🫥せんぷく\n召喚時: ランダム敵\nヘルパー2体に3ダメ", effect: "summon_random_3dmg_2" },
  { id: 23, name: "ゴルムルンバ", type: "helper", cost: 5, attack: 6, hp: 5, attr: "Common", keywords: [], desc: "", lineage: "beast" },
  { id: 405, name: "ウィスピーウッズ", type: "helper", cost: 2, attack: 0, hp: 6, attr: "Green", keywords: ["immobile"], desc: "📌攻撃不可\nターン開始時ランダム:\n①ワドルディ召喚\n②ブロントバート召喚\n③敵1体に1ダメ", effect: "start_whispy", lineage: "leaf" },
  { id: 210, name: "ランディア", type: "helper", cost: 7, attack: 5, hp: 5, attr: "Red", keywords: [], desc: "死亡時: 3/2の\nランディアを4体出す", effect: "death_randia", lineage: "fire" },
  { id: 211, name: "ボンカース", type: "helper", cost: 5, attack: 3, hp: 4, attr: "Red", keywords: [], desc: "召喚時: ランダムな敵の\n空きマス2つに「ばくだん」\nを設置する\n攻撃時: このターン中\n攻撃力+3", effect: "summon_bonkers", lineage: "hammer" },
  { id: 511, name: "白き翼ダイナブレイド", type: "helper", cost: 7, attack: 6, hp: 7, attr: "White", keywords: [], desc: "召喚時: 選択\n①3枚ドロー\n②このヘルパーのHP+5", effect: "summon_dynablade", targetMode: "choice_dynablade" },
  { id: 512, name: "ゴライアス", type: "helper", cost: 5, attack: 4, hp: 4, attr: "White", keywords: [], desc: "召喚時:雪玉2枚を手札に\n雪玉コスト-1(場にいる間)\nターン終了時\n【リンク:白IV】\nすべての敵に4ダメ", effect: "goliath", lineage: "ice" },
  { id: 24, name: "ゴルドー", type: "spell", cost: 2, attr: "Common", desc: "ヘルパー1体に\n3ダメージ", effect: "deal3_helper" },
  { id: 25, name: "マキシムトマト", type: "spell", cost: 2, attr: "Common", desc: "キャラ1体の\nHPを5回復", effect: "heal5" },
  { id: 26, name: "プロペラー", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: [], desc: "召喚時: 敵が前ターンに\nサポート使用なら\n+2/+2と⚡ダッシュI", effect: "summon_propeller" },
  { id: 27, name: "クレイン", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Common", keywords: ["stealth"], desc: "🫥せんぷく" },
  { id: 28, name: "ニードラス", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Common", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時: 自身を除く\nランダム1体に1ダメ", effect: "summon_needlous" },
  { id: 313, name: "ブリッパー", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Blue", keywords: [], desc: "捨てられた時:\nブリッパー1体を\n自分の場に出す", effect: "discard_spawn_self", lineage: "water" },
  { id: 314, name: "ポピーブラザーズJr.", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Blue", keywords: [], desc: "召喚時: 相手の空きマスに\n「ばくだん」を設置する", effect: "summon_place_bomb", targetMode: "enemy_empty_slot", lineage: "bomb" },
  { id: 315, name: "メタルジェネラル", type: "helper", cost: 6, attack: 4, hp: 6, attr: "Blue", keywords: ["block"], desc: "🛡️ブロック\n召喚時: 相手のランダムな\n空きマス3つにばくだん設置", effect: "summon_bombs_3", lineage: "bomb" },
  { id: 611, name: "バンダナワドルディ", type: "helper", cost: 3, attack: 2, hp: 3, attr: "Orange", keywords: ["pierce1"], desc: "🔱貫通I\n召喚時:デッキから\n橙カードを2枚引く", effect: "summon_draw_orange_lineage", lineage: "spear" },
  { id: 411, name: "メタナイト", type: "helper", cost: 3, attack: 5, hp: 5, attr: "Green", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時:相手手札の\n最大コストヘルパーを\n正面に出す", effect: "summon_metaknight", lineage: "sword" },
  { id: 412, name: "ブレイドナイト", type: "helper", cost: 2, attack: 2, hp: 3, attr: "Green", keywords: [], desc: "味方リーダーのこうげき時\n反撃ダメージ-2", effect: "passive_reduce_retaliation", lineage: "sword" },
];

// ═══════════════════════════════════════════
//  COPY ABILITIES（コピー能力定義）
// ═══════════════════════════════════════════
const LINEAGE_TO_COPY = {
  fire: "C01", fighter: "C02", sword: "C03", spark: "C04",
  leaf: "C05", ice: "C06", tornado: "C07", stone: "C08",
  beam: "C09", whip: "C10", bomb: "C11", water: "C12", hammer: "C13", sleep: "C14", crash: "C15",
};

const COPY_ABILITIES = {
  C01: { id: "C01", name: "ファイア", attr: "Red", wazas: [
    { id: "fire1", name: "火ふきこうげき", cost: 2, maxStock: 2, targetMode: "enemy_any", desc: "敵ヘルパーに3ダメ\n敵リーダーに2ダメ" },
    { id: "fire2", name: "火だるまぢごく", cost: 3, maxStock: 2, targetMode: "none", desc: "赤味方ランダムATK+2\nカード1枚引く" },
    { id: "fire3", name: "バーニングアタック", cost: 2, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパーに4ダメ\n自身にも2ダメ" },
    { id: "fire4", name: "かいてんひふき", cost: 4, maxStock: 2, targetMode: "none", desc: "すべての敵ヘルパーに\n2ダメージ" },
  ]},
  C02: { id: "C02", name: "ファイター", attr: "Red", wazas: [
    { id: "fighter1", name: "バルカンジャブ", cost: 1, maxStock: 2, targetMode: "attack", atk: 1, desc: "【こうげき】\nリンク赤II:追加2ダメ" },
    { id: "fighter2", name: "スマッシュパンチ", cost: 2, maxStock: 2, targetMode: "enemy_any", desc: "指定した縦1列の\n敵ヘルパー全てに2ダメ" },
    { id: "fighter3", name: "ライジンブレイク", cost: 3, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパーに3ダメ\nブロック持ちなら6ダメ" },
  ]},
  C03: { id: "C03", name: "ソード", attr: "Green", wazas: [
    { id: "sword1", name: "たてぎり", cost: 1, maxStock: 3, targetMode: "attack", atk: 2, desc: "【こうげき】" },
    { id: "sword2", name: "かいてんぎり", cost: 3, maxStock: 2, targetMode: "enemy_any", desc: "敵1体に2ダメ\n隣接の敵に1ダメ" },
    { id: "sword3", name: "エナジーソード", cost: 1, maxStock: 2, targetMode: "none", desc: "次のこうげき時\n攻撃力+2" },
  ]},
  C04: { id: "C04", name: "スパーク", attr: "Green", wazas: [
    { id: "spark1", name: "スパークバリア", cost: 1, maxStock: 4, targetMode: "none", desc: "次ターン中こうげき反撃1ダメ\nスパークレーザー+2ダメ\n(最大5ダメまで重複)" },
    { id: "spark2", name: "サンダーボルト", cost: 1, maxStock: 2, targetMode: "none", desc: "ダメージ中の\nランダム敵ヘルパーに2ダメ" },
    { id: "spark3", name: "スパークレーザー", cost: 2, maxStock: 2, targetMode: "enemy_any", desc: "指定した縦1列の\n敵ヘルパー全てにダメ\n使用後ダメージリセット" },
  ]},
  C05: { id: "C05", name: "リーフ", attr: "Green", wazas: [
    { id: "leaf1", name: "リーフカッター", cost: 2, maxStock: 3, targetMode: "none", desc: "ランダム敵に\n合計3ダメ分配" },
    { id: "leaf2", name: "リーフダンサー", cost: 4, maxStock: 2, targetMode: "none", desc: "2枚ドロー\nリーダーHP2回復\nリンク緑II:コスト-1" },
    { id: "leaf3", name: "アッパーリーフ", cost: 3, maxStock: 2, targetMode: "attack", atk: 4, desc: "【こうげき】" },
  ]},
  C06: { id: "C06", name: "アイス", attr: "White", wazas: [
    { id: "ice1", name: "こちこちといき", cost: 3, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパー1体を\n-2/-2する\nリンク白I:コスト-1" },
    { id: "ice2", name: "こちこちウォール", cost: 1, maxStock: 2, targetMode: "none", desc: "味方マスに\n氷柱(0/1ブロック)を出す" },
    { id: "ice3", name: "こちこちスプリンクラー", cost: 6, maxStock: 1, targetMode: "none", desc: "ランダムな敵ヘルパー\n4体を-2/-2する" },
  ]},
  C07: { id: "C07", name: "トルネイド", attr: "White", wazas: [
    { id: "tornado1", name: "トルネイドアタック", cost: 2, maxStock: 2, targetMode: "none", desc: "カードを2枚引き\nその後1枚捨てる" },
    { id: "tornado2", name: "スクリュータックル", cost: 3, maxStock: 2, targetMode: "enemy_helper_atk3_or_less", desc: "ATK3以下の敵ヘルパーを\n相手の手札に戻す" },
    { id: "tornado3", name: "ビッグトルネイド", cost: 7, maxStock: 1, targetMode: "none", desc: "ランダム敵ヘルパーに\n2ダメ×4回\nカード1枚引く" },
  ]},
  C08: { id: "C08", name: "ストーン", attr: "Orange", wazas: [
    { id: "stone1", name: "石ころへんしん", cost: 1, maxStock: 2, targetMode: "none", desc: "次に受けるダメージを\n0にする" },
    { id: "stone2", name: "石ころアッパーカット", cost: 3, maxStock: 2, targetMode: "attack", atk: 3, desc: "【こうげき】\n手札ランダム+1/+1" },
    { id: "stone3", name: "ヘビーおしつぶし", cost: 4, maxStock: 2, targetMode: "none", desc: "最もHPの高い\n敵ヘルパーに6ダメ" },
  ]},
  C09: { id: "C09", name: "ビーム", attr: "Orange", wazas: [
    { id: "beam1", name: "ビームウィップ", cost: 2, maxStock: 2, targetMode: "enemy_helper", desc: "敵ヘルパーに2ダメ\nリンク橙II:1枚引く" },
    { id: "beam2", name: "ビームマシンガン", cost: 1, maxStock: 2, targetMode: "not_implemented", desc: "（未実装）変身数参照" },
    { id: "beam3", name: "はどうビーム", cost: 3, maxStock: 2, targetMode: "enemy_any", desc: "指定した縦1列の\n敵ヘルパー全てに3ダメ" },
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
    { id: "water1", name: "ウェーブショット", cost: 2, maxStock: 2, targetMode: "attack", atk: 2, desc: "【こうげき】ATK2\nヘルパーならATK-2後\n攻撃する\n【リンク:青I】必須" },
    { id: "water2", name: "ウォータークラウン", cost: 2, maxStock: 2, targetMode: "none", desc: "手札1枚捨てて\nこのターン中PP+3" },
    { id: "water3", name: "レインボーレイン", cost: 3, maxStock: 2, targetMode: "none", desc: "手札1枚捨てて\nカードを3枚引く" },
  ]},
  C13: { id: "C13", name: "ハンマー", attr: "Red", wazas: [
    { id: "hammer1", name: "ハンマーたたき", cost: 1, maxStock: 3, targetMode: "attack", atk: 2, desc: "【こうげき】" },
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
};

// ★ 氷柱トークン: HP 2→1 にナーフ
const TOKEN_ICEPILLAR = { id: 862, name: "氷柱", type: "helper", cost: 0, attack: 0, hp: 1, attr: "White", keywords: ["immobile", "block"], desc: "📌攻撃不可 🛡️ブロック", effect: "", isToken: true };

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
    const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 4 + b);
    if (d > 0) ctx.addLog("🔥 バーニングアタック: " + name + "に" + d + "ダメ！");
    ctx.damageLeader(ctx.ap, 2 + b); ctx.addLog("🔥 バーニングアタック: 自身に" + (2+b) + "ダメ！");
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
    if (t) { const isBlock = t.keywords.includes("block"); const dmg = isBlock ? 6 + b : 3 + b; const name = t.name; const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, dmg); ctx.addLog("👊 ライジンブレイク: " + name + "に" + d + "ダメ！" + (isBlock ? "(ブロック特効)" : "")); }
  },
  sword2: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    const LEADER_ADJ = ["backLeft", "backRight", "midCenter"];
    if (ctx.targetSlot === "leader") {
      ctx.damageLeader(ctx.opp, 2 + b); ctx.addLog("⚔️ かいてんぎり: 敵リーダーに" + (2+b) + "ダメ！");
      LEADER_ADJ.forEach(sl => { const name = ctx.ep.board[sl]?.name; const d = ctx.dealDamage(ctx.opp, sl, 1 + b, true); if (d > 0) ctx.addLog("⚔️ かいてんぎり: " + name + "に" + d + "ダメ！"); });
      LEADER_ADJ.forEach(sl => ctx.checkDeath(ctx.opp, sl));
    } else {
      const name = ctx.ep.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.opp, ctx.targetSlot, 2 + b, true); if (d > 0) ctx.addLog("⚔️ かいてんぎり: " + name + "に" + d + "ダメ！");
      const adj = HEX_ADJACENCY[ctx.targetSlot] || [];
      adj.forEach(sl => { const n2 = ctx.ep.board[sl]?.name; const d2 = ctx.dealDamage(ctx.opp, sl, 1 + b, true); if (d2 > 0) ctx.addLog("⚔️ かいてんぎり: " + n2 + "に" + d2 + "ダメ！"); });
      if (LEADER_ADJ.includes(ctx.targetSlot)) { ctx.damageLeader(ctx.opp, 1 + b); ctx.addLog("⚔️ かいてんぎり: 敵リーダーに" + (1+b) + "ダメ！"); }
      [ctx.targetSlot, ...adj].forEach(sl => ctx.checkDeath(ctx.opp, sl));
    }
  },
  sword3: (ctx) => {
    ctx.player.leaderAtkBonus = 2;
    ctx.addLog("⚔️ エナジーソード: 次のこうげき時ATK+2！");
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
  leaf1: (ctx) => {
    const b = getWazaDmgBonus(ctx.player);
    let remaining = 3 + b;
    const allTargets = [...UNIT_SLOTS.filter(sl => ctx.ep.board[sl]), "leader"];
    for (let i = 0; i < remaining && allTargets.length > 0; i++) {
      const t = rand(allTargets);
      if (t === "leader") { ctx.damageLeader(ctx.opp, 1); ctx.addLog("🍃 リーフカッター: 敵リーダーに1ダメ！"); }
      else { ctx.dealDamage(ctx.opp, t, 1, true); }
    }
    UNIT_SLOTS.forEach(sl => ctx.checkDeath(ctx.opp, sl));
    ctx.addLog("🍃 リーフカッター: ランダムに" + remaining + "ダメ分配！");
  },
  leaf2: (ctx) => {
    let n = 0; for (let i = 0; i < 2; i++) { if (ctx.drawCard(ctx.ap)) n++; }
    ctx.player.leaderHp = Math.min(20, ctx.player.leaderHp + 2);
    ctx.addLog("🍃 リーフダンサー: " + n + "枚ドロー＆リーダーHP2回復！");
  },
  ice1: (ctx) => {
    const t = ctx.ep.board[ctx.targetSlot];
    if (t) { t.currentAttack = t.currentAttack - 2; t.hp = Math.max(0, t.hp - 2); t.currentHp -= 2; ctx.addLog("❄️ こちこちといき: " + t.name + "を-2/-2！"); ctx.checkDeath(ctx.opp, ctx.targetSlot); }
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
    targets.forEach(sl => { const u = ctx.ep.board[sl]; if (u) { u.currentAttack = u.currentAttack - 2; u.hp = Math.max(0, u.hp - 2); u.currentHp -= 2; } });
    targets.forEach(sl => ctx.checkDeath(ctx.opp, sl));
    ctx.addLog("❄️ こちこちスプリンクラー: ランダム敵" + targets.length + "体を-2/-2！");
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
    const helpers = UNIT_SLOTS.filter(sl => ctx.ep.board[sl]);
    for (let i = 0; i < 4 && helpers.length > 0; i++) {
      const t = rand(helpers);
      ctx.dealDamage(ctx.opp, t, 2 + b, true);
    }
    UNIT_SLOTS.forEach(sl => ctx.checkDeath(ctx.opp, sl));
    if (ctx.drawCard(ctx.ap)) ctx.addLog("🌪️ ビッグトルネイド: " + (2+b) + "ダメ×4＆1枚ドロー！");
    else ctx.addLog("🌪️ ビッグトルネイド: " + (2+b) + "ダメ×4！");
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
};

function resolveLeaderAttack(s, ap, opp, waza, targetSlot, addLog, triggerOnDamage, checkDeath) {
  const player = s.players[ap]; const ep = s.players[opp];
  let atkPower = waza.atk + (player.leaderAtkBonus || 0);
  UNIT_SLOTS.forEach(sl => { const u = player.board[sl]; if (u && u.effect === "" && u.id === 402) atkPower += 1; });
  player.leaderAtkBonus = 0;

  if (targetSlot === "leader") {
    if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: ダメージ無効化！"); }
    else { ep.leaderHp -= atkPower; addLog("⚔️ " + waza.name + ": 敵リーダーに" + atkPower + "ダメ！"); }
    if (waza.id === "fighter1" && checkLink(s, ap, "base", "Red", 2)) {
      if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: リンクダメージ無効化！"); }
      else { ep.leaderHp -= 2; addLog("👊 バルカンジャブ: 【リンク赤II】追加2ダメ！"); }
    }
  } else {
    const target = ep.board[targetSlot]; if (!target) return;
    const tgtPower = getEffectiveAttack(target, s);
    const dmgToTarget = applyGuard(target, atkPower);
    const bladeKnightCount = UNIT_SLOTS.filter(sl => player.board[sl] && player.board[sl].effect === "passive_reduce_retaliation").length;
    const dmgToLeader = Math.max(0, tgtPower - bladeKnightCount * 2);
    target.currentHp -= dmgToTarget;
    if (player.leaderShield) { player.leaderShield = false; addLog("🪨 石ころへんしん: 反撃ダメージ無効化！"); }
    else if (dmgToLeader <= 0) { addLog("🛡️ ブレイドナイト: 反撃ダメージを0に軽減！"); }
    else { player.leaderHp -= dmgToLeader; if (bladeKnightCount > 0) addLog("🛡️ ブレイドナイト: 反撃ダメージ-" + (bladeKnightCount * 2) + "！"); }
    addLog("⚔️ " + waza.name + "(" + dmgToTarget + ") ⇄ " + target.name + "(" + dmgToLeader + ")");
    if (dmgToTarget > 0) triggerOnDamage(opp, targetSlot);
    if (waza.id === "fighter1" && checkLink(s, ap, "base", "Red", 2)) {
      const bonus = applyGuard(target, 2); target.currentHp -= bonus;
      addLog("👊 バルカンジャブ: 【リンク赤II】追加" + bonus + "ダメ！");
      if (bonus > 0) triggerOnDamage(opp, targetSlot);
    }
    if (waza.id === "stone2") {
      const helpers = player.hand.filter(h => h.type === "helper");
      if (helpers.length > 0) { const pick = rand(helpers); pick.attack = (pick.attack||0)+1; pick.hp = (pick.hp||0)+1; addLog("🪨 石ころアッパーカット: " + pick.name + "を+1/+1！"); }
    }
    checkDeath(opp, targetSlot);
  }
  if (targetSlot === "leader" && ep.sparkBarrier) {
    const bladeKnightCount = UNIT_SLOTS.filter(sl => player.board[sl] && player.board[sl].effect === "passive_reduce_retaliation").length;
    const barrierDmg = Math.max(0, 1 - bladeKnightCount * 2);
    if (barrierDmg <= 0) { addLog("🛡️ ブレイドナイト: スパークバリア反撃を0に軽減！"); }
    else if (player.leaderShield) { player.leaderShield = false; addLog("🪨 石ころへんしん: スパークバリア反撃を無効化！"); }
    else { player.leaderHp -= barrierDmg; addLog("⚡ スパークバリア: こうげき反撃で" + barrierDmg + "ダメージ！"); }
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
  picked.forEach(c => { deck.push({...c, origAttack: c.attack, origHp: c.hp}, {...c, origAttack: c.attack, origHp: c.hp}); });
  if (supportCard) { deck.pop(); deck.push({...supportCard}); }
  return { deck: shuffle(deck), color: deckColor };
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

function applyGuard(unit, damage) {
  if (!unit || !unit.keywords) return damage;
  if (unit.immuneThisTurn) return 0;
  if (unit.keywords.includes("guard2")) return Math.max(0, damage - 2);
  if (unit.keywords.includes("guard1")) return Math.max(0, damage - 1);
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
function createPlayerState(color, supportCard) {
  const { deck, color: deckColor } = buildDeck(color, supportCard);
  let hand;
  if (supportCard) {
    const supIdx = deck.findIndex(c => c.isSupport);
    const sup = supIdx >= 0 ? deck.splice(supIdx, 1)[0] : null;
    hand = sup ? [sup, ...deck.splice(0, 2)] : deck.splice(0, 3);
  } else {
    hand = deck.splice(0, 3);
  }
  return { leaderHp: 20, mana: 0, maxMana: 0, hand, deck, board: Object.fromEntries(ALL_SLOTS.map(s => [s, null])), costReduction: 0, deckColor, supportCooldowns: [], usedSupportThisTurn: false, graveyard: [], currentCopy: null, wazaStocks: {}, usedWazaThisTurn: false, leaderAtkBonus: 0, leaderShield: false, transformedThisTurn: false, sparkBarrier: false, sparkLaserBonus: 0, hammerFireDmg: 1, sleepTurns: 0, leaderFrozen: false };
}

function createInitialState(p1Color, p2Color, p1Support, p2Support) {
  const p2 = createPlayerState(p2Color, p2Support);
  if (p2.deck.length > 0) p2.hand.push(p2.deck.shift());
  p2.hand.push({...TOKEN_ENERGY});
  return { phase: "playing", turn: 0, activePlayer: "p1", winner: null, players: { p1: createPlayerState(p1Color, p1Support), p2: p2 }, log: ["🌟 ゲーム開始！ P2に手札+1&エナジードリンクを付与"], turnStarted: false, pendingSummonEffect: null, pendingKain: false, pendingKuu: null, pendingTwisterDiscard: false, pendingWaza: null, pendingWaterDiscard: null, showWazaPanel: false };
}

// ═══════════════════════════════════════════
//  HANDLER FACTORY FUNCTIONS
// ═══════════════════════════════════════════
// ターゲットダメージ系: 「敵1体（リーダー含む）にNダメ」
function makeDamageHandler(dmg, label) {
  return (ctx) => {
    if (ctx.targetSlot === "leader") { ctx.damageLeader(ctx.targetPlayer, dmg); ctx.addLog(label + " 敵リーダーに" + dmg + "ダメージ！"); }
    else { const name = ctx.tp.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.targetPlayer, ctx.targetSlot, dmg); if (d > 0) ctx.addLog(label + " " + name + "に" + d + "ダメ！"); }
  };
}
// ATKデバフ系: 「敵ヘルパーのATK-N」
function makeDebuffAtkHandler(amount, label) {
  return (ctx) => { const t = ctx.tp.board[ctx.targetSlot]; if (t) { t.currentAttack -= amount; ctx.addLog(label + " " + t.name + "の攻撃力-" + amount + "！"); } };
}
// 山札破棄系: 「対象の山札N枚破棄」
function makeMillHandler(targetFn, count, label) {
  return (ctx) => { const n = ctx.millCards(targetFn(ctx), count); if (n > 0) ctx.addLog(label + n + "枚破棄！"); };
}
// 列ダメージ共通処理
function doColumnDamage(ctx, dmg, label) {
  const col = ctx.targetSlot === "leader" ? "center" : getColumn(ctx.targetSlot);
  if (!col) return;
  const colSlots = col === "left" ? LEFT_SLOTS : col === "center" ? CENTER_SLOTS : RIGHT_SLOTS;
  const oppSlots = colSlots.filter(sl => ctx.ep.board[sl]);
  oppSlots.forEach(sl => { const name = ctx.ep.board[sl]?.name; const d = ctx.dealDamage(ctx.opp, sl, dmg, true); ctx.addLog(label + " " + name + "に" + d + "ダメ！"); });
  oppSlots.forEach(sl => ctx.checkDeath(ctx.opp, sl));
}
// 列ダメージワザファクトリ（ホットヘッドボーナス込み）
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
  summon_2dmg_leader: (ctx) => { ctx.damageLeader(ctx.opp, 2); ctx.addLog("🔥 ホットヘッド: 敵リーダーに2ダメージ！"); },
  summon_aoe1: makeSummonAoeHandler(false),
  summon_aoe1_self: makeSummonAoeHandler(true),
  summon_buff_red: (ctx) => {
    UNIT_SLOTS.forEach(sl => { const u = ctx.player.board[sl]; if (u && u.attr === "Red" && sl !== ctx.slot) { u.currentAttack += 1; ctx.addLog("💪 " + u.name + " 攻撃力+1！"); } });
    if (ctx.player.currentCopy && ctx.player.currentCopy.attr === "Red") {
      ctx.player.leaderAtkBonus = (ctx.player.leaderAtkBonus || 0) + 1;
      ctx.addLog("💪 リーダー(コピー) 攻撃力+1！");
    }
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
  summon_copy_if_enemy: (ctx) => { if (hasEnemyHelpers(ctx.s, ctx.ap)) { const sl = ctx.spawnUnit(ctx.ap, ctx.card); if (sl) ctx.addLog("✨ フレイマーがもう1体！"); } },
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
  death_2dmg_leaders: (ctx) => { ctx.damageLeader("p1", 2); ctx.damageLeader("p2", 2); ctx.addLog("🔥 ガルボ: 全リーダーに2ダメージ！"); },
  death_draw: (ctx) => { if (ctx.drawCard(ctx.owner)) ctx.addLog("📥 " + ctx.unit.name + ": カード1枚引いた！"); },
  death_and_discard_draw: (ctx) => { if (ctx.drawCard(ctx.owner)) ctx.addLog("📥 " + ctx.unit.name + ": カード1枚引いた！"); },
  death_opp_draw: (ctx) => { if (ctx.drawCard(ctx.oppOf)) ctx.addLog("📥 ウォンキィ: 相手が1枚引いた！"); },
  death_debuff: (ctx) => { const es = UNIT_SLOTS.filter(sl => ctx.s.players[ctx.oppOf].board[sl]); if (es.length > 0) { const t = rand(es); const tgt = ctx.s.players[ctx.oppOf].board[t]; tgt.currentAttack = tgt.currentAttack - 1; tgt.hp = Math.max(0, tgt.hp - 1); tgt.currentHp -= 1; ctx.addLog("❄️ スノウル: " + tgt.name + "を-1/-1！"); if (tgt.currentHp <= 0) ctx.checkDeath(ctx.oppOf, t); } },
  death_waddle3: (ctx) => { let n = 0; for (let i = 0; i < 3 && ctx.s.players[ctx.owner].hand.length < 8; i++) { ctx.s.players[ctx.owner].hand.push({ ...TOKEN_WADDLE }); n++; } if (n > 0) ctx.addLog("🎁 パペットワドルディ: ワドルディ" + n + "体を手札に！"); },
  death_revive: (ctx) => { const sl = ctx.spawnUnit(ctx.p, TOKEN_CAPPYBARE, ctx.slot); if (sl) ctx.addLog("🔄 キャピィが0/1で復活！"); },
  death_copy_opp_hand: (ctx) => { const oppHand = ctx.s.players[ctx.oppOf].hand; if (oppHand.length > 0 && ctx.s.players[ctx.owner].hand.length < 8) { const copied = { ...rand(oppHand) }; ctx.s.players[ctx.owner].hand.push(copied); ctx.addLog("🔮 ウィッピィ: 相手の" + copied.name + "をコピー！"); } },
  death_cost_reduce: (ctx) => { ctx.s.players[ctx.owner].costReduction += 1; ctx.addLog("💜 ブルームハッター: 次のカードコスト-1！"); },
  death_randia: (ctx) => { let spawned = 0; for (let i = 0; i < 4; i++) { const sl = ctx.spawnUnit(ctx.owner, TOKEN_RANDIA2); if (sl) spawned++; } if (spawned > 0) ctx.addLog("🐉 ランディア: 3/2を" + spawned + "体召喚！"); },
  death_draw_link_o1: (ctx) => { if (!checkLink(ctx.s, ctx.owner, ctx.slot, "Orange", 1)) { ctx.addLog("🔗 ワドルドゥ: リンク不成立"); return; } if (ctx.drawCard(ctx.owner)) ctx.addLog("📥 ワドルドゥ: 【リンク:橙I】カード1枚引いた！"); },
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
  summon_1dmg: makeDamageHandler(1, "💥"),
  summon_2dmg_target: makeDamageHandler(2, "🔥 バーニンレオ:"),
  summon_2dmg_damaged: (ctx) => { const name = ctx.tp.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.targetPlayer, ctx.targetSlot, 2); if (d > 0) ctx.addLog("💚 スフィアローパー(緑): " + name + "に" + d + "ダメ！"); },
  summon_debuff_atk2: makeDebuffAtkHandler(2, "💧 ウォーターガルボロス:"),
  summon_debuff_atk1: makeDebuffAtkHandler(1, "💧 ウォーターガルボ:"),
  summon_debuff_1_1: (ctx) => { const t = ctx.tp.board[ctx.targetSlot]; if (t) { t.currentAttack = t.currentAttack - 1; t.hp = Math.max(0, t.hp - 1); t.currentHp -= 1; ctx.addLog("❄️ スフィアローパー(白): " + t.name + "を-1/-1！"); ctx.checkDeath(ctx.targetPlayer, ctx.targetSlot); } },
  summon_freeze: (ctx) => { if (ctx.targetSlot === "leader") { ctx.tp.leaderFrozen = true; ctx.addLog("🧊 チリー: 敵リーダーを凍結！次ターンワザ使用不可！"); } else { const t = ctx.tp.board[ctx.targetSlot]; if (t) { t.frozen = true; ctx.addLog("🧊 チリー: " + t.name + "を凍結！"); } } },
  summon_copy_stats: (ctx) => { const t = ctx.tp.board[ctx.targetSlot]; const self = ctx.player.board[ctx.summonSlot]; if (t && self) { const effectiveAtk = getEffectiveAttack(t, ctx.s); self.currentAttack = effectiveAtk; self.currentHp = t.currentHp; self.hp = t.currentHp; ctx.addLog("🖤 シャドーカービィ: " + t.name + "をコピー(" + effectiveAtk + "/" + t.currentHp + ")！"); } },
  summon_dedede: (ctx) => { const remaining = ctx.player.mana; if (remaining > 0) { ctx.player.mana = 0; if (ctx.targetSlot === "leader") { ctx.damageLeader(ctx.targetPlayer, remaining); ctx.addLog("🔨 デデデ大王: 敵リーダーに" + remaining + "ダメ！"); } else { const name = ctx.tp.board[ctx.targetSlot]?.name; const d = ctx.dealDamage(ctx.targetPlayer, ctx.targetSlot, remaining); ctx.addLog("🔨 デデデ大王: " + name + "に" + d + "ダメ！"); } const self = ctx.player.board[ctx.summonSlot]; if (self) self.currentAttack += remaining; ctx.addLog("🔨 デデデ大王: 攻撃力+" + remaining + "！"); } },
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
};

// ═══════════════════════════════════════════
//  ENDTURN EFFECT HANDLERS
// ═══════════════════════════════════════════
const ENDTURN_EFFECT_HANDLERS = {
  endturn_mill1: makeMillHandler(ctx => ctx.opp, 1, "📤 ジャックル: 相手山札"),
  endturn_3dmg_facing: (ctx) => { const facing = getFacingEnemySlots(ctx.s, ctx.ap, ctx.sl); if (facing.length > 0) { facing.forEach(t => { const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 3, true); ctx.addLog("⚡ キングスドゥ: " + name + "に" + d + "ダメ！"); }); facing.forEach(t => ctx.checkDeath(ctx.opp, t)); } },
  endturn_buff_orange_hand: (ctx) => { const oranges = ctx.player.hand.filter(h => h.attr === "Orange" && h.type === "helper"); if (oranges.length > 0) { const pick = rand(oranges); pick.attack = (pick.attack || 0) + 1; pick.hp = (pick.hp || 0) + 1; ctx.addLog("🟠 マウンデス: 手札の" + pick.name + "を+1/+1！"); } },
  endturn_spawn_wapod: (ctx) => { const sl2 = ctx.spawnUnit(ctx.ap, TOKEN_WAPOD); if (sl2) ctx.addLog("🏺 ワポッドのつぼ: ワポッド(1/1)を召喚！"); ctx.u.currentHp -= 1; ctx.addLog("🏺 ワポッドのつぼ: 自身に1ダメージ(HP" + ctx.u.currentHp + ")"); if (ctx.u.currentHp <= 0) ctx.checkDeath(ctx.ap, ctx.sl); },
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
  heal5: (ctx) => { if (ctx.targetSlot === "leader") { ctx.s.players[ctx.targetPlayer].leaderHp = Math.min(20, ctx.s.players[ctx.targetPlayer].leaderHp + 5); ctx.addLog("💖 マキシムトマト → リーダー5回復！"); } else { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.currentHp = Math.min(t.hp, t.currentHp + 5); ctx.addLog("💖 マキシムトマト → " + t.name + "5回復！"); } } },
  heal1: (ctx) => { if (ctx.targetSlot === "leader") { ctx.s.players[ctx.targetPlayer].leaderHp = Math.min(20, ctx.s.players[ctx.targetPlayer].leaderHp + 1); ctx.addLog("🍎 たべもの → リーダー1回復！"); } else { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.currentHp = Math.min(t.hp, t.currentHp + 1); ctx.addLog("🍎 たべもの → " + t.name + "1回復！"); } } },
  freeze: (ctx) => { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.frozen = true; ctx.addLog("🧊 雪玉 → " + t.name + "を凍結！"); } },
  snowball_debuff: (ctx) => { const t = ctx.s.players[ctx.targetPlayer].board[ctx.targetSlot]; if (t) { t.currentAttack = t.currentAttack - 2; t.hp = Math.max(0, t.hp - 2); t.currentHp -= 2; ctx.addLog("❄️ 雪玉 → " + t.name + "を-2/-2！"); ctx.checkDeath(ctx.targetPlayer, ctx.targetSlot); } },
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
  start_whispy: (ctx) => { const roll = Math.floor(Math.random() * 3); if (roll === 0) { const sl = ctx.spawnUnit(ctx.ap, TOKEN_WADDLE); if (sl) ctx.addLog("🌳 ウィスピー: ワドルディ召喚！"); else ctx.addLog("🌳 ウィスピー: 盤面が埋まっている…"); } else if (roll === 1) { const sl = ctx.spawnUnit(ctx.ap, TOKEN_BRONT); if (sl) ctx.addLog("🌳 ウィスピー: ブロントバート召喚！"); else ctx.addLog("🌳 ウィスピー: 盤面が埋まっている…"); } else { const es = getEnemyHelperSlots(ctx.s, ctx.ap); const targets = [...es, "leader"]; const t = rand(targets); if (t === "leader") { ctx.damageLeader(ctx.opp, 1); ctx.addLog("🌳 ウィスピー: 敵リーダーに1ダメ！"); } else { const name = ctx.ep.board[t]?.name; const d = ctx.dealDamage(ctx.opp, t, 1); ctx.addLog("🌳 ウィスピー: " + name + "に" + d + "ダメ！"); } } },
  start_explode3: (ctx) => { if (!ctx.u.readyToExplode) return; ctx.addLog("💥 サーチス: 全ヘルパーに3ダメージ！"); [ctx.ap, ctx.opp].forEach(pid => { UNIT_SLOTS.forEach(sl => { ctx.dealDamage(pid, sl, 3, true); }); }); [ctx.ap, ctx.opp].forEach(pid => { UNIT_SLOTS.forEach(sl => ctx.checkDeath(pid, sl)); }); },
};

// ═══════════════════════════════════════════
//  ATTACK EFFECT HANDLERS
// ═══════════════════════════════════════════
const PRE_ATTACK_EFFECT_HANDLERS = {
  flank_atk2: (ctx) => { if (ctx.targetSlot !== "leader" && !isFacing(ctx.attackerSlot, ctx.targetSlot)) { ctx.addLog("🦀 クラビィ: 正面にいない敵との交戦で攻撃力+2！"); return 2; } return 0; },
  attack_mill2: (ctx) => { const n = ctx.millCards(ctx.opp, 2); if (n > 0) ctx.addLog("📤 ザンギブル: 相手山札" + n + "枚墓地へ！"); return 0; },
  attack_self_mill2: (ctx) => { const n = ctx.millCards(ctx.ap, 2); if (n > 0) ctx.addLog("📤 スターマン: 自分の山札" + n + "枚破棄！"); return 0; },
  summon_bonkers: (ctx) => { ctx.addLog("🔨 ボンカース: 攻撃時ATK+3！"); return 3; },
};

const POST_ATTACK_EFFECT_HANDLERS = {
  bomber: (ctx) => { if (ctx.player.board[ctx.attackerSlot]) { ctx.player.board[ctx.attackerSlot].currentHp = 0; ctx.addLog("💣 ボンバー: 攻撃後に自壊！"); ctx.checkDeath(ctx.ap, ctx.attackerSlot); } },
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

  const addLog = (m) => { s.log = [m, ...s.log].slice(0, 40); };
  const damageLeader = (targetPlayerId, amount) => { const tp = s.players[targetPlayerId]; if (tp.leaderShield) { tp.leaderShield = false; addLog("🪨 石ころへんしん: ダメージ無効化！"); return 0; } tp.leaderHp -= amount; return amount; };
  const drawCard = (p) => { const pl = s.players[p]; if (pl.deck.length > 0 && pl.hand.length < 8) { pl.hand.push(pl.deck.shift()); return true; } return false; };
  const triggerOnDamage = (pid, slot) => { const u = s.players[pid].board[slot]; if (!u) return; if (u.effect === "on_damage_food" && s.players[pid].hand.length < 8) { s.players[pid].hand.push({...TOKEN_FOOD}); addLog("🍎 サンドバッグさん: たべものを手札に！"); } if (u.effect === "on_damage_waddle" && s.players[pid].hand.length < 8) { s.players[pid].hand.push({...TOKEN_WADDLE}); addLog("🛡️ アーマーワドルディ: ワドルディを手札に！"); } };
  const SPAWN_PRIORITY = ["frontCenter", "frontLeft", "frontRight", "midCenter", "backLeft", "backRight"];
  const spawnUnit = (p, card, targetSlot) => { if (targetSlot) { if (s.players[p].board[targetSlot]) return null; } else { targetSlot = SPAWN_PRIORITY.find(sl => !s.players[p].board[sl]); if (!targetSlot) return null; } s.players[p].board[targetSlot] = { ...card, currentHp: card.hp, currentAttack: card.attack, baseAttack: card.origAttack ?? card.attack, baseHp: card.origHp ?? card.hp, hasAttacked: false, summonedThisTurn: true, canAttackLeader: false, frozen: false, hasActed: false }; return targetSlot; };
  const millCards = (targetPlayer, count) => {
    const pl = s.players[targetPlayer]; const oppOfTarget = opponent(targetPlayer); let n = 0;
    for (let i = 0; i < count && pl.deck.length > 0; i++) {
      const card = pl.deck.shift(); n++;
      addToGraveyard(targetPlayer, card);
      if (card.effect === "summon_and_discard_2dmg" || card.effect === "death_and_discard_draw" || card.effect === "discard_spawn_self") { triggerDiscardEffect(card, targetPlayer, "破棄"); }
    }
    return n;
  };

  function checkDeath(p, slot) {
    const unit = s.players[p].board[slot]; if (!unit || unit.currentHp > 0) return;
    const owner = p; const oppOf = opponent(p);
    s.players[p].board[slot] = null;
    addLog("💀 " + unit.name + " が倒れた！");
    addToGraveyard(p, unit);
    const handler = DEATH_EFFECT_HANDLERS[unit.effect];
    if (handler) { handler({ s, p, slot, unit, owner, oppOf, addLog, drawCard, spawnUnit, checkDeath, triggerOnDamage, dealDamage, checkLink, damageLeader }); }
  }

  // ── 墓地追加の共通処理 ──
  function addToGraveyard(pid, card) {
    s.players[pid].graveyard.push({ id: card.id, name: card.name, attr: card.attr, type: card.type, isToken: card.isToken || false });
  }

  function checkWin() { if (s.players.p1.leaderHp <= 0) { s.phase = "gameOver"; s.winner = "p2"; } if (s.players.p2.leaderHp <= 0) { s.phase = "gameOver"; s.winner = "p1"; } }

  // ── 共通ダメージ関数 ──
  function dealDamage(pid, slot, amount, skipDeath) {
    const u = s.players[pid].board[slot];
    if (!u) return 0;
    const d = applyGuard(u, amount);
    u.currentHp -= d;
    if (d > 0) triggerOnDamage(pid, slot);
    if (!skipDeath) checkDeath(pid, slot);
    return d;
  }

  // ── 破棄時効果の共通処理 ──
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

  function hasValidTargets(card) { const tm = card.targetMode; if (!tm) return false; if (tm === "enemy_any") return true; if (tm === "enemy_helper") return getEnemyHelperSlots(s, ap).length > 0; if (tm === "enemy_helper_damaged") return UNIT_SLOTS.some(sl => ep.board[sl] && ep.board[sl].currentHp < ep.board[sl].hp); if (tm === "friendly_red") return UNIT_SLOTS.some(sl => player.board[sl] && player.board[sl].attr === "Red"); if (tm === "friendly_any") return true; if (tm === "choice_dynablade") return true; if (tm === "any_empty_slot") return getEmptyUnitSlots(s, ap).length > 0 || getEmptyUnitSlots(s, opp).length > 0; if (tm === "enemy_empty_slot") return getEmptyUnitSlots(s, opp).length > 0; return false; }

  function resolveTargetedEffect(effect, summonSlot, targetPlayer, targetSlot) { const handler = TARGETED_SUMMON_EFFECT_HANDLERS[effect]; if (handler) { const tp = s.players[targetPlayer]; handler({ s, ap, player, tp, targetPlayer, targetSlot, summonSlot, addLog, drawCard, checkDeath, triggerOnDamage, dealDamage, spawnUnit, checkLink, damageLeader }); } }

  switch (action.type) {
    case "START_TURN": {
      s.turn += 1; player.maxMana = Math.min(8, player.maxMana + 1); player.mana = player.maxMana; player.usedSupportThisTurn = false; player.usedWazaThisTurn = false; player.transformedThisTurn = false; player.sparkBarrier = false; if (player.leaderFrozen) { player.usedWazaThisTurn = true; player.leaderFrozen = false; addLog("🧊 リーダーの凍結！このターンはワザを使えない"); } s.showWazaPanel = false;
      if (player.supportCooldowns) { const returning = []; player.supportCooldowns = player.supportCooldowns.filter(cd => { cd.turnsLeft -= 1; if (cd.turnsLeft <= 0) { returning.push(cd.card); return false; } return true; }); returning.forEach(c => { if (player.hand.length < 8) { player.hand.push(c); addLog("🔄 " + c.name + " が手札に戻った！"); } else { addLog("🔄 " + c.name + ": 手札上限で戻れず！"); } }); }
      if (player.deck.length > 0) { if (!drawCard(ap)) addLog("💨 手札上限！"); else addLog("📥 P" + (ap==="p1"?1:2) + " がカードを引いた"); } else { s.phase = "gameOver"; s.winner = opp; addLog("⚠️ デッキ切れ！"); }
      UNIT_SLOTS.forEach(slot => { const u = player.board[slot]; if (u) { u.hasAttacked = false; if (u.summonedThisTurn && u.keywords.includes("dash1")) { u.canAttackLeader = true; } u.summonedThisTurn = false; } });
      UNIT_SLOTS.forEach(slot => { const u = player.board[slot]; if (!u) return; const startHandler = STARTTURN_EFFECT_HANDLERS[u.effect]; if (startHandler) { startHandler({ s, ap, opp, slot, u, player, ep, addLog, spawnUnit, checkDeath, triggerOnDamage, dealDamage, checkLink, damageLeader }); } });
      s.turnStarted = true; addLog("── ターン" + s.turn + ": P" + (ap==="p1"?1:2) + " ──"); checkWin(); return s;
    }
    case "SUMMON": {
      const { cardIndex, slot } = action; const card = player.hand[cardIndex]; if (!card || card.type !== "helper") return state;
      let cost = card.cost; if (player.costReduction > 0) { cost = Math.max(0, cost - player.costReduction); player.costReduction = 0; }
      if (cost > player.mana) return state; if (!UNIT_SLOTS.includes(slot) || player.board[slot]) return state;
      player.mana -= cost; player.hand.splice(cardIndex, 1);
      player.board[slot] = { ...card, currentHp: card.hp, currentAttack: card.attack, baseAttack: card.origAttack ?? card.attack, baseHp: card.origHp ?? card.hp, hasAttacked: false, summonedThisTurn: true, canAttackLeader: false, frozen: false, hasActed: false, readyToExplode: card.effect === "start_explode3", immuneThisTurn: card.effect === "summon_immune" };
      addLog("✨ " + card.name + " を " + SLOT_LABELS[slot] + " に召喚！" + (cost < card.cost ? "(コスト" + cost + "に軽減)" : ""));
      applySummonEffects(card, slot);
      if (card.targetMode && hasValidTargets(card) && !(card.effect === "summon_dedede" && player.mana === 0)) { s.pendingSummonEffect = { effect: card.effect, slot, targetMode: card.targetMode, cardName: card.name }; addLog("🎯 " + card.name + "の対象を選んでください"); } else if (card.targetMode && !(card.effect === "summon_dedede")) { addLog("❌ " + card.name + ": 有効な対象なし"); }
      checkWin(); return s;
    }
    case "RESOLVE_SUMMON_EFFECT": { const { targetPlayer, targetSlot } = action; const pending = s.pendingSummonEffect; if (!pending) return state; resolveTargetedEffect(pending.effect, pending.slot, targetPlayer, targetSlot); s.pendingSummonEffect = null; checkWin(); return s; }
    case "CANCEL_SUMMON_EFFECT": { s.pendingSummonEffect = null; addLog("⏩ 効果をスキップ"); return s; }
    case "ATTACK": {
      const { attackerSlot, targetSlot } = action; const attacker = player.board[attackerSlot];
      if (!attacker || attacker.hasAttacked || attacker.frozen) return state;
      if (attacker.summonedThisTurn && !attacker.keywords.includes("dash1") && !attacker.keywords.includes("dash2")) return state;
      if (attacker.keywords.includes("immobile")) return state;
      if (attacker.effect === "no_attack") return state;
      if (attacker.effect === "no_atk_full_hp" && attacker.currentHp >= attacker.hp) return state;
      let atkPower = getEffectiveAttack(attacker, s); attacker.hasActed = true;
      const preAtkHandler = PRE_ATTACK_EFFECT_HANDLERS[attacker.effect];
      if (preAtkHandler) { atkPower += preAtkHandler({ s, ap, opp, player, ep, attacker, attackerSlot, targetSlot, addLog, checkDeath, millCards, checkLink }); }
      if (targetSlot === "leader") {
        if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: ダメージ無効化！"); }
        else { ep.leaderHp -= atkPower; addLog("⚔️ " + attacker.name + " → 敵リーダーに" + atkPower + "ダメ！"); }
        attacker.hasAttacked = true;
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
        target.currentHp -= dmgToTarget; attacker.currentHp -= dmgToAttacker;
        if (unitHasFlying2(attacker)) { addLog("⚔️ " + attacker.name + "(" + dmgToTarget + ") → " + target.name + " (🪽🪽反撃なし)"); }
        else { addLog("⚔️ " + attacker.name + "(" + dmgToTarget + ") ⇄ " + target.name + "(" + dmgToAttacker + ")"); }
        attacker.hasAttacked = true;
        if (dmgToTarget > 0) triggerOnDamage(opp, targetSlot);
        if (dmgToAttacker > 0) triggerOnDamage(ap, attackerSlot);
        if (attacker.keywords.includes("pierce1")) { const behindSlot = BEHIND_MAP[targetSlot]; if (behindSlot) { if (behindSlot === "base") { if (ep.leaderShield) { ep.leaderShield = false; addLog("🪨 石ころへんしん: 貫通ダメージ無効化！"); } else { ep.leaderHp -= dmgToTarget; addLog("🔱 貫通: 敵リーダーにも" + dmgToTarget + "ダメ！"); } } else if (ep.board[behindSlot]) { const behindName = ep.board[behindSlot].name; const pierceDmg = dealDamage(opp, behindSlot, dmgToTarget); addLog("🔱 貫通: " + behindName + "にも" + pierceDmg + "ダメ！"); } } }
        checkDeath(opp, targetSlot); checkDeath(ap, attackerSlot);
      }
      const postAtkHandler = POST_ATTACK_EFFECT_HANDLERS[attacker.effect];
      if (postAtkHandler) { postAtkHandler({ s, ap, opp, player, ep, attacker, attackerSlot, targetSlot, addLog, checkDeath, checkLink, damageLeader }); }
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
    case "RESOLVE_TWISTER_DISCARD": { if (!s.pendingTwisterDiscard) return state; const { cardIndex } = action; const card = player.hand[cardIndex]; if (!card) return state; player.hand.splice(cardIndex, 1); addToGraveyard(ap, card); addLog("🌪️ ツイスター: " + card.name + "を捨てた！"); triggerDiscardEffect(card, ap, "捨"); s.pendingTwisterDiscard = false; checkWin(); return s; }
    case "CANCEL_TWISTER_DISCARD": { if (s.pendingTwisterDiscard && player.hand.length > 0) { const di = Math.floor(Math.random() * player.hand.length); const dc = player.hand.splice(di, 1)[0]; addToGraveyard(ap, dc); addLog("🌪️ ツイスター: " + dc.name + "をランダムに捨てた"); triggerDiscardEffect(dc, ap, "捨"); } s.pendingTwisterDiscard = false; return s; }
    case "END_TURN": {
      UNIT_SLOTS.forEach(sl => { const u = player.board[sl]; if (u && u.frozen) { u.frozen = false; addLog("🧊 " + u.name + "の凍結が解けた"); } if (u && u.immuneThisTurn) { u.immuneThisTurn = false; } });
      UNIT_SLOTS.forEach(sl => { const u = player.board[sl]; if (!u) return; const endHandler = ENDTURN_EFFECT_HANDLERS[u.effect]; if (endHandler) { endHandler({ s, ap, opp, sl, u, player, ep, addLog, spawnUnit, checkDeath, triggerOnDamage, dealDamage, millCards, checkLink, damageLeader }); } });
      [ap, opp].forEach(pid => { UNIT_SLOTS.forEach(sl => { const u = s.players[pid].board[sl]; if (u && u.effect === "endturn_starblock_decay") { u.currentHp -= 1; if (u.currentHp <= 0) { addToGraveyard(pid, u); s.players[pid].board[sl] = null; addLog("⭐ 星ブロックが崩れた"); } } if (u && u.effect === "bomb_unit") { u.currentHp -= 1; addLog("💣 ばくだん: 自身に1ダメージ(HP" + u.currentHp + ")"); if (u.currentHp <= 0) checkDeath(pid, sl); } }); });
      if (player.currentCopy && player.currentCopy.id === "C13") { player.hammerFireDmg = (player.hammerFireDmg || 1) + 1; addLog("🔨 おにごろし火炎ハンマー: ダメージが" + player.hammerFireDmg + "に上昇！"); }
      if (player.currentCopy && player.currentCopy.id === "C14") { player.sleepTurns -= 1; if (player.sleepTurns <= 0) { player.currentCopy = null; player.wazaStocks = {}; player.sleepTurns = 0; addLog("💤 スリープ: 目が覚めた！コピー能力が解除された"); } else { addLog("💤 スリープ: あと" + player.sleepTurns + "ターン…Zzz"); } }
      s.phase = "passDevice"; s.activePlayer = opp; s.turnStarted = false; addLog("🔄 ターン終了 → P" + (opp==="p1"?1:2) + "の番"); return s;
    }
    case "CONFIRM_PASS": { s.phase = "playing"; return s; }
    case "TRANSFORM": { const { cardIndex } = action; const card = player.hand[cardIndex]; if (!card || !card.lineage) return state; if (player.currentCopy && player.currentCopy.id === "C14") { addLog("💤 スリープ中は変身できない！"); return s; } const copyId = LINEAGE_TO_COPY[card.lineage]; if (!copyId) { addLog("❌ この系統にはコピー能力がありません"); return s; } const ability = COPY_ABILITIES[copyId]; if (!ability) return state; player.hand.splice(cardIndex, 1); player.currentCopy = { ...ability }; const stocks = {}; ability.wazas.forEach(w => { stocks[w.id] = w.maxStock; }); player.wazaStocks = stocks; player.transformedThisTurn = true; player.sparkLaserBonus = 0; player.hammerFireDmg = 1; if (copyId === "C14") { player.sleepTurns = 2; } s.showWazaPanel = false; addLog("🌟 " + card.name + " をコピー！→【" + ability.name + "】に変身！"); checkWin(); return s; }
    case "TOGGLE_WAZA_PANEL": { s.showWazaPanel = !s.showWazaPanel; return s; }
    case "USE_WAZA": {
      const { wazaId } = action; if (!player.currentCopy || player.usedWazaThisTurn) return state;
      const waza = player.currentCopy.wazas.find(w => w.id === wazaId); if (!waza) return state;
      if ((player.wazaStocks[wazaId] || 0) <= 0) return state;
      let cost = waza.cost;
      if (wazaId === "ice1" && checkLink(s, ap, "base", "White", 1)) cost = Math.max(0, cost - 1);
      if (wazaId === "leaf2" && checkLink(s, ap, "base", "Green", 2)) cost = Math.max(0, cost - 1);
      if (cost > player.mana) return state;
      if (waza.targetMode === "not_implemented") { addLog("❌ このワザは未実装です"); return s; }
      if (wazaId === "beam3" && player.transformedThisTurn) { addLog("❌ はどうビーム: コピーしたターン中は使用できない！"); return s; }
      if (wazaId === "water1" && !checkLink(s, ap, "base", "Blue", 1)) { addLog("❌ ウェーブショット: 【リンク:青I】が必要！"); return s; }
      if (waza.targetMode === "enemy_helper" && getEnemyHelperSlots(s, ap).length === 0) { addLog("❌ " + waza.name + ": 対象となる敵ヘルパーがいない！"); return s; }
      if (waza.targetMode === "enemy_helper_atk3_or_less" && !UNIT_SLOTS.some(sl => ep.board[sl] && getEffectiveAttack(ep.board[sl], s) <= 3)) { addLog("❌ " + waza.name + ": ATK3以下の敵ヘルパーがいない！"); return s; }
      if (waza.targetMode === "enemy_empty_slot" && getEmptyUnitSlots(s, opp).length === 0) { addLog("❌ " + waza.name + ": 相手の空きマスがない！"); return s; }
      if (waza.targetMode === "enemy_front_empty_slot" && !["frontLeft", "frontCenter", "frontRight"].some(sl => !ep.board[sl])) { addLog("❌ " + waza.name + ": 相手の前列に空きマスがない！"); return s; }
      if (waza.targetMode === "attack" && getValidLeaderAttackTargets(s, ap).length === 0) { addLog("❌ " + waza.name + ": 攻撃対象がいない！"); return s; }
      player.mana -= cost; player.wazaStocks[wazaId] -= 1; player.usedWazaThisTurn = true; s.showWazaPanel = false;
      if (waza.targetMode === "none") { const handler = WAZA_HANDLERS[wazaId]; if (handler) handler({ s, ap, opp, player, ep, addLog, drawCard, checkDeath, triggerOnDamage, dealDamage, spawnUnit, millCards, checkLink, damageLeader }); }
      else if (waza.targetMode === "attack") { s.pendingWaza = { wazaId, waza, targetMode: "attack" }; addLog("🎯 " + waza.name + "の攻撃対象を選んでください"); }
      else { s.pendingWaza = { wazaId, waza, targetMode: waza.targetMode }; addLog("🎯 " + waza.name + "の対象を選んでください"); }
      checkWin(); return s;
    }
    case "RESOLVE_WAZA_TARGET": { const { targetPlayer, targetSlot } = action; const pending = s.pendingWaza; if (!pending) return state; if (pending.targetMode === "attack") { if (pending.wazaId === "water1" && targetSlot !== "leader") { const t = ep.board[targetSlot]; if (t) { t.currentAttack = t.currentAttack - 2; addLog("💧 ウェーブショット: " + t.name + "のATK-2！"); } } resolveLeaderAttack(s, ap, opp, pending.waza, targetSlot, addLog, triggerOnDamage, checkDeath); } else { const handler = WAZA_HANDLERS[pending.wazaId]; if (handler) handler({ s, ap, opp, player, ep, targetPlayer, targetSlot, addLog, drawCard, checkDeath, triggerOnDamage, dealDamage, spawnUnit, millCards, checkLink, damageLeader }); } s.pendingWaza = null; checkWin(); return s; }
    case "CANCEL_WAZA": { s.pendingWaza = null; addLog("⏩ ワザをキャンセル"); return s; }
    case "RESOLVE_WATER_DISCARD": {
      if (!s.pendingWaterDiscard) return state; const { cardIndex } = action; const card = player.hand[cardIndex]; if (!card) return state;
      player.hand.splice(cardIndex, 1); addToGraveyard(ap, card);
      triggerDiscardEffect(card, ap, "捨");
      if (s.pendingWaterDiscard.waza === "water2") { player.mana += 3; addLog("💧 ウォータークラウン: " + card.name + "を捨ててPP+3！"); }
      else if (s.pendingWaterDiscard.waza === "water3") { let n = 0; for (let i = 0; i < 3; i++) { if (drawCard(ap)) n++; } addLog("💧 レインボーレイン: " + card.name + "を捨てて" + n + "枚ドロー！"); }
      s.pendingWaterDiscard = null; checkWin(); return s;
    }
    case "CANCEL_WATER_DISCARD": { s.pendingWaterDiscard = null; addLog("⏩ スキップ"); return s; }
    case "RESTART": { return createInitialState(); }
    case "RESTART_WITH_COLORS": { return createInitialState(action.p1Color, action.p2Color, action.p1Support, action.p2Support); }
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
//  HEX SLOT
// ═══════════════════════════════════════════
const HEX_W = 88; const HEX_H = 76;
const LEADER_HEX_H = 57;
const hexClip = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
const leaderHexClip = "polygon(25% 0%, 75% 0%, 100% 66.7%, 87.5% 100%, 12.5% 100%, 0% 66.7%)";
const leaderHexClipFlipped = "polygon(12.5% 0%, 87.5% 0%, 100% 33.3%, 75% 100%, 25% 100%, 0% 33.3%)";

function HexSlot({ unit, slotId, isHighlighted, isSelected, onClick, isLeader, leaderHp, leaderFrozen, isBuildingSlot, gameState, attackGlow, isInspected, shaking, spinning, copyAbility, isFlipped }) {
  const isEmpty = !unit && !isLeader;
  const colors = unit ? ATTR_COLORS[unit.attr] || ATTR_COLORS.Common : null;
  const label = SLOT_LABELS[slotId] || "";
  const baseHex = { width: HEX_W + "px", height: HEX_H + "px", clipPath: hexClip, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: onClick ? "pointer" : "default", transition: "all 0.2s", fontSize: "10px", fontWeight: "bold", userSelect: "none", flexShrink: 0 };
  const shakeOnly = shaking ? { animation: "hexShake 0.3s ease-out" } : {};
  const spinStyle = spinning ? { animation: "hexSpinY 0.2s ease-in-out" } : {};

  if (isLeader) {
    const copyColors = copyAbility ? ATTR_COLORS[copyAbility.attr] || ATTR_COLORS.Common : null;
    const leaderBg = isHighlighted ? "linear-gradient(135deg,#FF6B6B,#FF2222)" : leaderFrozen ? "linear-gradient(135deg,#A5F3FC,#67E8F9)" : copyColors ? "linear-gradient(135deg," + copyColors.light + "," + copyColors.border + ")" : "linear-gradient(135deg,#FFD1DC,#FF69B4)";
    const leaderShadow = isHighlighted ? "0 0 18px rgba(255,0,0,0.6)" : leaderFrozen ? "0 2px 10px rgba(103,232,249,0.4)" : copyColors ? "0 2px 10px " + copyColors.bg + "44" : "0 2px 10px rgba(255,105,180,0.25)";
    const clip = isFlipped ? leaderHexClipFlipped : leaderHexClip;
    return (<div onClick={onClick} style={{ width: HEX_W + "px", height: LEADER_HEX_H + "px", clipPath: clip, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: onClick ? "pointer" : "default", transition: "all 0.2s", fontSize: "10px", fontWeight: "bold", userSelect: "none", flexShrink: 0, background: leaderBg, boxShadow: leaderShadow, ...(shaking ? { animation: "hexShake 0.3s ease-out" } : {}) }}>{leaderFrozen && <div style={{ fontSize: "10px", lineHeight: 1 }}>🧊</div>}{copyAbility && !leaderFrozen ? <div style={{ fontSize: "8px", color: copyColors?.bg || "#fff", fontWeight: "800", lineHeight: 1.1 }}>{copyAbility.name}</div> : !leaderFrozen && <div style={{ fontSize: "14px", lineHeight: 1 }}>⭐</div>}<div style={{ color: leaderFrozen ? "#0891B2" : "#fff", fontSize: "11px", fontWeight: "900", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>HP {leaderHp}</div><div style={{ fontSize: "7px", color: leaderFrozen ? "#0891B2" : "rgba(255,255,255,0.7)" }}>{leaderFrozen ? "凍結中" : copyAbility ? "コピー中" : "リーダー"}</div></div>);
  }
  if (isEmpty) return (<div onClick={onClick} style={{ ...baseHex, background: isHighlighted ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.07)", boxShadow: isHighlighted ? "0 0 14px rgba(74,222,128,0.4)" : "none" }}>{isHighlighted ? <div style={{ color: "#4ADE80", fontSize: "22px", lineHeight: 1 }}>＋</div> : <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", textAlign: "center" }}>{label}{isBuildingSlot && <div style={{ fontSize: "7px", marginTop: "1px", color: "rgba(255,200,100,0.3)" }}>建物可</div>}</div>}</div>);

  const effectiveAtk = getEffectiveAttack(unit, gameState);
  const isDamaged = unit.currentHp < unit.hp;
  const kwIcons = unit.keywords.map(k => KEYWORD_ICONS[k] || "").join("");
  const isFrozen = unit.frozen;
  const glowColor = attackGlow === "all" ? "rgba(0,200,150,0.7)" : attackGlow === "helperOnly" ? "rgba(250,204,21,0.7)" : null;

  const hexBg = isFrozen ? "linear-gradient(160deg,#A5F3FC,#67E8F9)" : isSelected ? "linear-gradient(160deg," + colors.border + "," + colors.bg + ")" : isHighlighted ? "linear-gradient(160deg,#FF6B6B,#CC2222)" : "linear-gradient(160deg," + colors.light + "," + colors.border + ")";
  const hexShadow = isSelected ? "0 0 16px " + colors.border : isHighlighted ? "0 0 16px rgba(255,60,60,0.5)" : "0 2px 6px rgba(0,0,0,0.12)";

  return (
    <div style={{ position: "relative", width: HEX_W + "px", height: HEX_H + "px", ...shakeOnly }}>
      {glowColor && <div style={{ position: "absolute", top: "-3px", left: "-3px", width: (HEX_W+6) + "px", height: (HEX_H+6) + "px", filter: "blur(3px)", zIndex: 0, pointerEvents: "none" }}><div style={{ width: "100%", height: "100%", clipPath: hexClip, background: glowColor }} /></div>}
      {isInspected && <div style={{ position: "absolute", top: "-3px", left: "-3px", width: (HEX_W+6) + "px", height: (HEX_H+6) + "px", filter: "blur(2px)", zIndex: 0, pointerEvents: "none" }}><div style={{ width: "100%", height: "100%", clipPath: hexClip, background: "rgba(255,215,0,0.8)" }} /></div>}
      <div style={{ ...baseHex, position: "absolute", top: 0, left: 0, zIndex: 1, background: hexBg, boxShadow: hexShadow, ...spinStyle }} />
      <div onClick={onClick} style={{ ...baseHex, position: "relative", zIndex: 2, background: "transparent" }}>
        <div style={{ fontSize: "9px", color: isSelected||isHighlighted||isFrozen ? "#fff" : colors.bg, lineHeight: 1.1, textAlign: "center", maxWidth: "72px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", textShadow: isFrozen ? "0 1px 2px rgba(0,0,0,0.5)" : "none" }}>{kwIcons}{unit.name}</div>
        <div style={{ display: "flex", gap: "5px", marginTop: "3px", fontSize: "12px", fontWeight: "900", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}><span style={{ color: effectiveAtk > (unit.baseAttack ?? unit.attack) ? "#FFD700" : effectiveAtk < (unit.baseAttack ?? unit.attack) ? "#FF6B6B" : "#fff" }}>⚔{effectiveAtk}</span><span style={{ color: isDamaged ? "#FF6B6B" : unit.hp > (unit.baseHp ?? unit.hp) ? "#FFD700" : "#fff" }}>❤{unit.currentHp}</span></div>
        {isFrozen && <div style={{ fontSize: "7px", color: "#0e7490" }}>🧊凍結</div>}
        {!isFrozen && unit.hasAttacked && <div style={{ fontSize: "7px", color: "rgba(255,255,255,0.65)" }}>行動済</div>}
        {!isFrozen && unit.summonedThisTurn && !unit.keywords.includes("dash1") && !unit.keywords.includes("dash2") && <div style={{ fontSize: "7px", color: "rgba(255,255,255,0.65)" }}>酔い</div>}
      </div>
    </div>
  );
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

  function getAttackGlow(unit) {
    if (!isActive || !unit) return null;
    if (unit.hasAttacked || unit.frozen) return null;
    if (unit.keywords.includes("immobile")) return null;
    if (unit.effect === "no_attack") return null;
    if (unit.summonedThisTurn && !unit.keywords.includes("dash1") && !unit.keywords.includes("dash2")) return null;
    if (unit.effect === "no_atk_full_hp" && unit.currentHp >= unit.hp) return null;
    if (unit.keywords.includes("dash2") && unit.summonedThisTurn) return "all";
    if (unit.keywords.includes("dash1") && unit.summonedThisTurn) return "helperOnly";
    if (unit.keywords.includes("dash1") && !unit.canAttackLeader) return "helperOnly";
    return "all";
  }

  const myPopups = popups.filter(p => p.player === playerId);
  const shakingSlots = new Set(myPopups.filter(p => p.type === "damage").map(p => p.slot === "leader" ? "base" : p.slot));
  const spinningSlots = new Set(myPopups.filter(p => p.type === "attack").map(p => p.slot));

  return (
    <div style={{ position: "relative", width: (totalWidth+8) + "px", height: totalHeight + "px", margin: "0 auto" }}>
      {ALL_SLOTS.map(slotId => { const pos = positions[slotId]; if (!pos) return null; const isLeader = slotId === "base"; const unit = isLeader ? null : player.board[slotId]; const isSelectedUnit = selectedUnit?.player === playerId && selectedUnit?.slot === slotId; const hlKey = isLeader ? playerId + "-leader" : playerId + "-" + slotId; const glow = isLeader ? null : getAttackGlow(unit); const isInsp = inspectedUnit?.player === playerId && inspectedUnit?.slot === slotId;
        return (<div key={slotId} style={{ position: "absolute", left: ((totalWidth+8)/2+pos.x-HEX_W/2) + "px", top: pos.y + "px" }}><HexSlot unit={unit} slotId={slotId} isSelected={isSelectedUnit} isHighlighted={highlightSlots.includes(hlKey)} isLeader={isLeader} leaderHp={player.leaderHp} leaderFrozen={player.leaderFrozen} isBuildingSlot={BUILDING_SLOTS.includes(slotId)} gameState={state} attackGlow={glow} isInspected={isInsp} shaking={shakingSlots.has(slotId)} spinning={spinningSlots.has(slotId)} copyAbility={isLeader ? player.currentCopy : null} isFlipped={isFlipped} onClick={() => onSlotClick(playerId, isLeader ? "leader" : slotId)} /></div>);
      })}
      {myPopups.filter(p => p.type === "damage" || p.type === "heal").map(p => {
        const slotId = p.slot === "leader" ? "base" : p.slot; const pos = positions[slotId]; if (!pos) return null; const isDmg = p.type === "damage"; const hexH = slotId === "base" ? LEADER_HEX_H : HEX_H;
        return (<div key={p.id} style={{ position: "absolute", left: ((totalWidth+8)/2+pos.x) + "px", top: (pos.y + hexH * 0.3) + "px", transform: "translate(-50%, -50%)", animation: "popupFloat 0.8s ease-out forwards", fontSize: "24px", fontWeight: "900", color: isDmg ? "#FF4444" : "#44FFAA", textShadow: "0 0 10px " + (isDmg ? "rgba(255,0,0,0.6)" : "rgba(0,255,100,0.6)") + ", 0 2px 4px rgba(0,0,0,0.7)", pointerEvents: "none", zIndex: 100 }}>{isDmg ? "-" : "+"}{p.amount}</div>);
      })}
      {myPopups.filter(p => p.type === "spawn").map(p => {
        const pos = positions[p.slot]; if (!pos) return null;
        return (<div key={p.id} style={{ position: "absolute", left: ((totalWidth+8)/2+pos.x-HEX_W/2) + "px", top: pos.y + "px", width: HEX_W + "px", height: HEX_H + "px", pointerEvents: "none", zIndex: 99 }}>
          <svg viewBox="0 0 88 76" width={HEX_W} height={HEX_H} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "spawnRing 0.4s ease-out forwards", transformOrigin: "center center" }}><polygon points="22,0 66,0 88,38 66,76 22,76 0,38" fill="none" stroke="rgba(255,180,60,0.75)" strokeWidth="3" /></svg>
        </div>);
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
//  WAZA PANEL
// ═══════════════════════════════════════════
// ワザダメージ表示テーブル: [アイコン, テンプレート関数]
// b=wazaDmgBonus, sl=sparkLaserDmg, hf=hammerFireDmg
const WAZA_DMG_DISPLAY = {
  fire1:    (b) => "🔥 ヘルパー" + (3+b) + " / リーダー" + (2+b),
  fire3:    (b) => "🔥 " + (4+b) + "ダメ / 自傷" + (2+b),
  fire4:    (b) => "🔥 全体" + (2+b) + "ダメージ",
  fighter2: (b) => "👊 列" + (2+b) + "ダメージ",
  fighter3: (b) => "👊 " + (3+b) + " / ブロック" + (6+b),
  sword2:   (b) => "⚔ " + (2+b) + "ダメ+隣接" + (1+b),
  leaf1:    (b) => "🍃 合計" + (3+b) + "ダメ分配",
  tornado3: (b) => "🌪️ " + (2+b) + "ダメ×4回",
  stone3:   (b) => "🪨 " + (6+b) + "ダメージ",
  beam1:    (b) => "🔮 " + (2+b) + "ダメージ",
  beam3:    (b) => "🔮 列" + (3+b) + "ダメージ",
  bomb2:    (b) => "💣 " + (2+b) + "ダメージ",
  bomb3:    (b) => "💣 " + (5+b) + "+隣接" + (2+b),
  crash1:   (b) => "💥 全体" + (5+b) + "ダメージ",
  spark2:   (b) => "⚡ " + (2+b) + "ダメージ",
};

function WazaPanel({ copy, stocks, mana, usedThisTurn, costOverrides, transformedThisTurn, leaderAtkBonus, sparkLaserDmg, linkBlueI, hammerFireDmg, linkRedII, wazaDmgBonus, onSelect, onClose }) {
  if (!copy) return null;
  const copyColors = ATTR_COLORS[copy.attr] || ATTR_COLORS.Common;
  const b = wazaDmgBonus || 0;

  function getExtraDmgDisplay(w, canUse) {
    // こうげきワザのATK表示
    if (w.atk !== undefined) {
      const effectiveDmg = w.atk + leaderAtkBonus + (w.id === "fighter1" && linkRedII ? 2 : 0);
      const dmgColor = effectiveDmg > w.atk ? "#16A34A" : effectiveDmg < w.atk ? "#DC2626" : canUse ? "#555" : "#777";
      return <div style={{ fontSize: "9px", fontWeight: "900", color: dmgColor, marginTop: "2px" }}>⚔ {effectiveDmg}ダメージ</div>;
    }
    // スパークレーザー（可変ダメージ）
    if (w.id === "spark3" && sparkLaserDmg !== undefined) {
      const total = sparkLaserDmg + b;
      return <div style={{ fontSize: "9px", fontWeight: "900", color: total > 1 ? "#16A34A" : canUse ? "#555" : "#777", marginTop: "2px" }}>⚡ {total}ダメージ</div>;
    }
    // おにごろし火炎ハンマー（蓄積ダメージ）
    if (w.id === "hammer2" && hammerFireDmg !== undefined) {
      const total = hammerFireDmg + b;
      return <div style={{ fontSize: "9px", fontWeight: "900", color: total > 1 ? "#16A34A" : canUse ? "#555" : "#777", marginTop: "2px" }}>🔥 {total}ダメージ</div>;
    }
    // ホットヘッドボーナス表示（テーブル駆動）
    if (b > 0 && WAZA_DMG_DISPLAY[w.id]) {
      return <div style={{ fontSize: "9px", fontWeight: "900", color: "#16A34A", marginTop: "2px" }}>{WAZA_DMG_DISPLAY[w.id](b)}</div>;
    }
    return null;
  }

  return (
    <div style={{ display: "flex", gap: "6px", padding: "6px 8px", overflowX: "auto", maxWidth: "100%", WebkitOverflowScrolling: "touch", background: "rgba(0,0,0,0.4)", borderRadius: "10px", border: "1px solid " + copyColors.border + "66" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minWidth: "40px", gap: "2px" }}>
        <div style={{ fontSize: "8px", color: copyColors.border, fontWeight: "800" }}>{copy.name}</div>
        <div onClick={onClose} style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>✕閉じる</div>
      </div>
      {copy.wazas.map((w, i) => {
        const stock = stocks[w.id] || 0; const isImpl = w.targetMode !== "not_implemented";
        const cost = costOverrides[w.id] !== undefined ? costOverrides[w.id] : w.cost;
        const isReduced = cost < w.cost; const canUse = isImpl && !usedThisTurn && stock > 0 && cost <= mana && !(w.id === "beam3" && transformedThisTurn) && !(w.id === "water1" && !linkBlueI);
        return (
          <div key={w.id} onClick={() => canUse && onSelect(w.id)} style={{ width: "100px", minHeight: "80px", borderRadius: "8px", background: canUse ? "linear-gradient(140deg," + copyColors.light + "," + copyColors.border + ")" : "linear-gradient(140deg,#555,#333)", border: "2px solid " + (canUse ? copyColors.border : "#666"), cursor: canUse ? "pointer" : "default", padding: "5px", display: "flex", flexDirection: "column", fontSize: "8px", opacity: canUse ? 1 : 0.45, flexShrink: 0, position: "relative" }}>
            <div style={{ position: "absolute", top: "-5px", left: "-5px", width: "18px", height: "18px", borderRadius: "50%", background: canUse ? "linear-gradient(135deg,#818CF8,#6366F1)" : "#666", color: isReduced ? "#4ADE80" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "900", border: "1.5px solid #fff" }}>{cost}</div>
            <div style={{ fontWeight: "800", fontSize: "9px", color: canUse ? copyColors.bg : "#999", textAlign: "center", marginTop: "8px", lineHeight: 1.1 }}>{"①②③"[i]}{w.name}</div>
            <div style={{ fontSize: "7px", color: canUse ? "#555" : "#777", textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-wrap", flex: 1, marginTop: "3px" }}>{w.desc}{getExtraDmgDisplay(w, canUse)}</div>
            <div style={{ fontSize: "7px", color: canUse ? copyColors.bg : "#888", textAlign: "center", fontWeight: "700" }}>残{stock}/{w.maxStock}</div>
          </div>
        );
      })}
    </div>
  );
}

function CardInHand({ card, index, isSelected, playState, effCost, onClick }) {
  const colors = ATTR_COLORS[card.attr] || ATTR_COLORS.Common; const isSpell = card.type === "spell";
  const lineageIcon = card.lineage ? LINEAGE_ICONS[card.lineage] : null;
  const hasCopy = card.lineage && LINEAGE_TO_COPY[card.lineage];
  const canInteract = playState !== "disabled";
  const isCopyOnly = playState === "copyOnly";
  const isDisabled = playState === "disabled";
  const rarity = CARD_RARITY[card.id];
  const rarityInfo = rarity ? RARITY_LEVELS[rarity] : null;
  const borderColor = isSelected ? "#FFD700" : isDisabled ? "#999" : colors.border;
  const bgStyle = isSelected ? "linear-gradient(140deg," + colors.border + "," + colors.bg + ")" : isCopyOnly ? "linear-gradient(140deg,#aaa,#888)" : isDisabled ? "linear-gradient(140deg,#ddd,#aaa)" : "linear-gradient(140deg,#fff," + colors.light + ")";
  const glowClass = !isSelected && playState === "playable" ? "green" : !isSelected && isCopyOnly ? "blue" : "";
  const cardAnim = glowClass === "green" ? "cardGlowGreen 2s ease-in-out infinite" : glowClass === "blue" ? "cardGlowBlue 2s ease-in-out infinite" : rarity === "UR" && !isSelected ? "cardGlowUR 2.5s ease-in-out infinite" : "none";
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div onClick={onClick} style={{ width: "82px", height: "120px", borderRadius: "10px", background: bgStyle, border: "3px solid " + borderColor, ...(isSelected ? { boxShadow: "0 4px 16px " + colors.border + "88" } : glowClass ? {} : { boxShadow: "none" }), animation: cardAnim, cursor: canInteract ? "pointer" : "default", padding: "6px 5px", display: "flex", flexDirection: "column", fontSize: "9px", transition: "transform 0.15s, border-color 0.15s", transform: isSelected ? "translateY(-10px) scale(1.04)" : "none", userSelect: "none", position: "relative", flexShrink: 0, opacity: isDisabled ? 0.55 : 1 }}>
        <div style={{ fontWeight: "800", fontSize: "10px", color: isSelected ? "#fff" : isCopyOnly ? "#555" : colors.bg, textAlign: "center", marginTop: "10px", lineHeight: 1.2 }}>{isSpell ? "📜 " : ""}{card.name}</div>
        {!isSpell && <div style={{ display: "flex", justifyContent: "center", gap: "8px", fontSize: "12px", fontWeight: "900", margin: "4px 0", color: isSelected ? "#fff" : isCopyOnly ? "#444" : "#333" }}><span style={{ color: (card.origAttack != null && card.attack > card.origAttack) ? "#FFD700" : undefined }}>⚔{card.attack}</span><span style={{ color: (card.origHp != null && card.hp > card.origHp) ? "#FFD700" : undefined }}>❤{card.hp}</span></div>}
        <div style={{ fontSize: "7.5px", color: isSelected ? "rgba(255,255,255,0.9)" : isCopyOnly ? "#666" : "#777", textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-wrap", flex: 1, overflow: "hidden" }}>{card.desc}</div>
        {rarityInfo && <div style={{ textAlign: "center", fontSize: "8px", color: rarityInfo.color, fontWeight: "900", letterSpacing: "1px", textShadow: rarity === "UR" ? "0 0 4px " + rarityInfo.color : "none" }}>{Array(rarityInfo.stars).fill("★").join("")}</div>}
        <div style={{ position: "absolute", top: "-7px", left: "-7px", width: "22px", height: "22px", borderRadius: "50%", background: isDisabled ? "#888" : isCopyOnly ? "#888" : effCost < card.cost ? "linear-gradient(135deg,#16A34A,#15803D)" : effCost > card.cost ? "linear-gradient(135deg,#DC2626,#B91C1C)" : "linear-gradient(135deg,#818CF8,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "900", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", zIndex: 3 }}>{effCost != null ? effCost : card.cost}</div>
        {lineageIcon && <div style={{ position: "absolute", top: "-5px", right: "-5px", width: "20px", height: "20px", borderRadius: "50%", background: hasCopy ? "linear-gradient(135deg,#FFD700,#F59E0B)" : "linear-gradient(135deg,#9CA3AF,#6B7280)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", border: "1.5px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", zIndex: 3 }}>{lineageIcon}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  MAIN GAME COMPONENT
// ═══════════════════════════════════════════
export default function KirbyCardGame() {
  const [gamePhase, setGamePhase] = useState("colorSelect");
  const [p1Color, setP1Color] = useState(null);
  const [p2Color, setP2Color] = useState(null);
  const [p1Support, setP1Support] = useState(null);
  const [p2Support, setP2Support] = useState(null);
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [inspectedUnit, setInspectedUnit] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [popups, setPopups] = useState([]);
  const prevStateRef = useRef(null);

  useEffect(() => {
    if (!prevStateRef.current) { prevStateRef.current = state; return; }
    const prev = prevStateRef.current; prevStateRef.current = state;
    if (prev.phase !== "playing") return;
    const newPopups = []; let pid = Date.now();
    ["p1", "p2"].forEach(playerId => {
      const prevLHp = prev.players[playerId].leaderHp; const currLHp = state.players[playerId].leaderHp;
      if (currLHp !== prevLHp) { newPopups.push({ id: pid++, player: playerId, slot: "leader", amount: Math.abs(currLHp - prevLHp), type: currLHp < prevLHp ? "damage" : "heal" }); }
      UNIT_SLOTS.forEach(slot => {
        const prevUnit = prev.players[playerId].board[slot]; const currUnit = state.players[playerId].board[slot];
        if (!prevUnit && currUnit) { newPopups.push({ id: pid++, player: playerId, slot, type: "spawn" }); }
        if (prevUnit && currUnit && prevUnit.name === currUnit.name) {
          if (prevUnit.currentHp !== currUnit.currentHp) { newPopups.push({ id: pid++, player: playerId, slot, amount: Math.abs(currUnit.currentHp - prevUnit.currentHp), type: currUnit.currentHp < prevUnit.currentHp ? "damage" : "heal" }); }
          if (!prevUnit.hasAttacked && currUnit.hasAttacked) { newPopups.push({ id: pid++, player: playerId, slot, type: "attack" }); }
        }
      });
    });
    if (newPopups.length > 0) setPopups(p => [...p, ...newPopups]);
  }, [state]);

  useEffect(() => { if (popups.length === 0) return; const timer = setTimeout(() => setPopups([]), 800); return () => clearTimeout(timer); }, [popups]);

  const screenBg = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", gap: "24px", padding: "24px" };
  const btnStyle = { padding: "16px 48px", fontSize: "17px", fontWeight: "900", background: "linear-gradient(135deg,#FF69B4,#FF1493)", border: "none", borderRadius: "30px", color: "#fff", cursor: "pointer", boxShadow: "0 4px 20px rgba(255,105,180,0.4)" };
  const ap = state.activePlayer; const player = state.players[ap]; const oppId = opponent(ap); const oppPlayer = state.players[oppId];

  useEffect(() => { if (gamePhase === "playing" && state.phase === "playing" && !state.turnStarted) dispatch({ type: "START_TURN" }); }, [gamePhase, state.phase, state.turnStarted]);
  const clearSelection = useCallback(() => { setSelectedCard(null); setSelectedUnit(null); }, []);
  const getEffCost = useCallback((card) => { let cost = card.cost; if (player.costReduction > 0) cost = Math.max(0, cost - player.costReduction); if (card.effect === "snowball_debuff" && UNIT_SLOTS.some(sl => player.board[sl] && player.board[sl].effect === "goliath")) cost = Math.max(0, cost - 1); return cost; }, [player.costReduction, player.board]);
  const pending = state.pendingSummonEffect;

  const highlightSlots = useMemo(() => {
    if (gamePhase !== "playing") return []; const hl = [];
    if (state.pendingWaza) { const tm = state.pendingWaza.targetMode; if (tm === "attack") { const leaderTargets = getValidLeaderAttackTargets(state, ap); leaderTargets.forEach(t => { hl.push(t === "leader" ? oppId + "-leader" : oppId + "-" + t); }); } else if (tm === "enemy_any") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); hl.push(oppId + "-leader"); } if (tm === "enemy_helper") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } if (tm === "enemy_helper_atk3_or_less") { UNIT_SLOTS.forEach(s => { const u = oppPlayer.board[s]; if (u && getEffectiveAttack(u, state) <= 3) hl.push(oppId + "-" + s); }); } if (tm === "friendly_red_helper") { UNIT_SLOTS.forEach(s => { if (player.board[s] && player.board[s].attr === "Red") hl.push(ap + "-" + s); }); } if (tm === "friendly_empty") { getEmptyUnitSlots(state, ap).forEach(s => hl.push(ap + "-" + s)); } if (tm === "enemy_empty_slot") { getEmptyUnitSlots(state, oppId).forEach(s => hl.push(oppId + "-" + s)); } if (tm === "enemy_front_empty_slot") { ["frontLeft", "frontCenter", "frontRight"].forEach(s => { if (!oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } if (tm === "enemy_any_slot") { UNIT_SLOTS.forEach(s => hl.push(oppId + "-" + s)); } return hl; }
    if (selectedCard !== null) { const card = player.hand[selectedCard]; if (card && card.lineage && LINEAGE_TO_COPY[card.lineage] && !(player.currentCopy && player.currentCopy.id === "C14")) hl.push(ap + "-leader"); }
    if (pending) { const tm = pending.targetMode;
      if (tm === "enemy_any") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); hl.push(oppId + "-leader"); }
      if (tm === "enemy_helper") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } if (tm === "enemy_helper_atk3_or_less") { UNIT_SLOTS.forEach(s => { const u = oppPlayer.board[s]; if (u && getEffectiveAttack(u, state) <= 3) hl.push(oppId + "-" + s); }); }
      if (tm === "enemy_helper_damaged") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s] && oppPlayer.board[s].currentHp < oppPlayer.board[s].hp) hl.push(oppId + "-" + s); }); }
      if (tm === "friendly_red") { UNIT_SLOTS.forEach(s => { if (player.board[s] && player.board[s].attr === "Red") hl.push(ap + "-" + s); }); }
      if (tm === "friendly_any") { UNIT_SLOTS.forEach(s => { if (player.board[s]) hl.push(ap + "-" + s); }); hl.push(ap + "-leader"); }
      if (tm === "choice_dynablade") { hl.push(ap + "-leader"); if (pending.slot) hl.push(ap + "-" + pending.slot); }
      if (tm === "any_empty_slot") { getEmptyUnitSlots(state, ap).forEach(s => hl.push(ap + "-" + s)); getEmptyUnitSlots(state, oppId).forEach(s => hl.push(oppId + "-" + s)); }
      if (tm === "enemy_empty_slot") { getEmptyUnitSlots(state, oppId).forEach(s => hl.push(oppId + "-" + s)); } if (tm === "enemy_front_empty_slot") { ["frontLeft", "frontCenter", "frontRight"].forEach(s => { if (!oppPlayer.board[s]) hl.push(oppId + "-" + s); }); }
      return hl;
    }
    if (state.pendingKuu) { if (state.pendingKuu.phase === "selectHelper") { UNIT_SLOTS.forEach(s => { const u = player.board[s]; if (u) hl.push(ap + "-" + s); }); } if (state.pendingKuu.phase === "selectDest") { UNIT_SLOTS.forEach(s => { if (s !== state.pendingKuu.sourceSlot) hl.push(ap + "-" + s); }); } return hl; }
    if (selectedCard !== null) { const card = player.hand[selectedCard]; if (!card) return [];
      if (card.type === "helper" && getEffCost(card) <= player.mana) { getEmptyUnitSlots(state, ap).forEach(s => hl.push(ap + "-" + s)); }
      else if (card.type === "spell") { if (card.effect === "deal3_helper") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } else if (card.effect === "destroy_atk3_or_less") { UNIT_SLOTS.forEach(s => { const u = oppPlayer.board[s]; if (u && getEffectiveAttack(u, state) <= 3) hl.push(oppId + "-" + s); }); } else if (card.effect === "heal5" || card.effect === "heal1") { UNIT_SLOTS.forEach(s => { if (player.board[s]) hl.push(ap + "-" + s); }); hl.push(ap + "-leader"); } else if (card.effect === "freeze" || card.effect === "snowball_debuff") { UNIT_SLOTS.forEach(s => { if (oppPlayer.board[s]) hl.push(oppId + "-" + s); }); } }
    }
    if (selectedUnit) { getValidAttackTargets(state, selectedUnit.player, selectedUnit.slot).forEach(t => { hl.push(t === "leader" ? oppId + "-leader" : oppId + "-" + t); }); }
    return hl;
  }, [gamePhase, pending, selectedCard, selectedUnit, state, ap, oppId]);

  const handleSlotClick = useCallback((clickedPlayer, clickedSlot) => {
    if (state.phase !== "playing" || !state.turnStarted) return;
    if (state.pendingKain || state.pendingTwisterDiscard || state.pendingWaterDiscard) return;
    const isUnitSlot = UNIT_SLOTS.includes(clickedSlot);
    const clickedUnit = isUnitSlot ? state.players[clickedPlayer]?.board[clickedSlot] : null;

    if (state.pendingWaza) {
      const pw = state.pendingWaza; let valid = false;
      if (pw.targetMode === "attack") { const leaderTargets = getValidLeaderAttackTargets(state, ap); if (clickedPlayer === oppId && clickedSlot === "leader" && leaderTargets.includes("leader")) valid = true; if (clickedPlayer === oppId && isUnitSlot && leaderTargets.includes(clickedSlot)) valid = true; }
      else if (pw.targetMode === "enemy_any") { if (clickedPlayer === oppId && clickedSlot === "leader") valid = true; if (clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) valid = true; }
      else if (pw.targetMode === "enemy_helper") { if (clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) valid = true; }
      else if (pw.targetMode === "enemy_helper_atk3_or_less") { if (clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot] && getEffectiveAttack(oppPlayer.board[clickedSlot], state) <= 3) valid = true; }
      else if (pw.targetMode === "friendly_red_helper") { if (clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]?.attr === "Red") valid = true; }
      else if (pw.targetMode === "friendly_empty") { if (clickedPlayer === ap && isUnitSlot && !player.board[clickedSlot]) valid = true; }
      else if (pw.targetMode === "enemy_empty_slot") { if (clickedPlayer === oppId && isUnitSlot && !oppPlayer.board[clickedSlot]) valid = true; }
      else if (pw.targetMode === "enemy_front_empty_slot") { if (clickedPlayer === oppId && ["frontLeft", "frontCenter", "frontRight"].includes(clickedSlot) && !oppPlayer.board[clickedSlot]) valid = true; }
      else if (pw.targetMode === "enemy_any_slot") { if (clickedPlayer === oppId && isUnitSlot) valid = true; }
      if (valid) { dispatch({ type: "RESOLVE_WAZA_TARGET", targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); }
      return;
    }

    if (selectedCard !== null && clickedPlayer === ap && clickedSlot === "leader") { const card = player.hand[selectedCard]; if (card && card.lineage && LINEAGE_TO_COPY[card.lineage]) { dispatch({ type: "TRANSFORM", cardIndex: selectedCard }); clearSelection(); setInspectedUnit(null); return; } }
    if (clickedPlayer === ap && clickedSlot === "leader" && player.currentCopy && selectedCard === null && !selectedUnit && !pending) { dispatch({ type: "TOGGLE_WAZA_PANEL" }); clearSelection(); setInspectedUnit(null); return; }

    if (pending) {
      const tm = pending.targetMode;
      const isEH = clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot];
      const isEL = clickedPlayer === oppId && clickedSlot === "leader";
      const isFR = clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]?.attr === "Red";
      const isDE = isEH && oppPlayer.board[clickedSlot].currentHp < oppPlayer.board[clickedSlot].hp;
      let valid = false;
      if (tm === "enemy_any" && (isEH || isEL)) valid = true;
      if (tm === "enemy_helper" && isEH) valid = true;
      if (tm === "enemy_helper_damaged" && isDE) valid = true;
      if (tm === "friendly_red" && isFR) valid = true;
      if (tm === "friendly_any") { if (clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]) valid = true; if (clickedPlayer === ap && clickedSlot === "leader") valid = true; }
      if (tm === "choice_dynablade") { if (clickedPlayer === ap && clickedSlot === "leader") valid = true; if (clickedPlayer === ap && clickedSlot === pending.slot) valid = true; }
      if (tm === "any_empty_slot") { if (isUnitSlot && !state.players[clickedPlayer]?.board[clickedSlot]) valid = true; }
      if (tm === "enemy_empty_slot") { if (clickedPlayer === oppId && isUnitSlot && !oppPlayer.board[clickedSlot]) valid = true; }
      if (valid) { dispatch({ type: "RESOLVE_SUMMON_EFFECT", targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); }
      return;
    }
    if (state.pendingKuu) {
      if (state.pendingKuu.phase === "selectHelper") { if (clickedPlayer === ap && isUnitSlot && clickedUnit) { dispatch({ type: "RESOLVE_KUU_HELPER", slot: clickedSlot }); clearSelection(); setInspectedUnit(null); } }
      else if (state.pendingKuu.phase === "selectDest") { if (clickedPlayer === ap && isUnitSlot && clickedSlot !== state.pendingKuu.sourceSlot) { dispatch({ type: "RESOLVE_KUU_DEST", slot: clickedSlot }); clearSelection(); setInspectedUnit(null); } }
      return;
    }
    if (selectedCard !== null) {
      const card = player.hand[selectedCard];
      if (card.type === "helper" && clickedPlayer === ap && isUnitSlot && !player.board[clickedSlot] && getEffCost(card) <= player.mana) { dispatch({ type: "SUMMON", cardIndex: selectedCard, slot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; }
      if (card.type === "spell") {
        if (card.effect === "deal3_helper" && clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; }
        if (card.effect === "destroy_atk3_or_less" && clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot] && getEffectiveAttack(oppPlayer.board[clickedSlot], state) <= 3) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; }
        if (card.effect === "heal5" || card.effect === "heal1") { if (clickedSlot === "leader" && clickedPlayer === ap) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: "leader" }); clearSelection(); setInspectedUnit(null); return; } if (clickedPlayer === ap && isUnitSlot && player.board[clickedSlot]) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; } }
        if ((card.effect === "freeze" || card.effect === "snowball_debuff") && clickedPlayer === oppId && isUnitSlot && oppPlayer.board[clickedSlot]) { dispatch({ type: "CAST_SPELL", cardIndex: selectedCard, targetPlayer: clickedPlayer, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; }
      }
      clearSelection(); return;
    }
    if (selectedUnit) {
      if (clickedPlayer === selectedUnit.player && clickedSlot === selectedUnit.slot) { clearSelection(); return; }
      const targets = getValidAttackTargets(state, selectedUnit.player, selectedUnit.slot);
      if (clickedSlot === "leader" && clickedPlayer === oppId && targets.includes("leader")) { dispatch({ type: "ATTACK", attackerSlot: selectedUnit.slot, targetSlot: "leader" }); clearSelection(); setInspectedUnit(null); return; }
      if (clickedPlayer === oppId && targets.includes(clickedSlot)) { dispatch({ type: "ATTACK", attackerSlot: selectedUnit.slot, targetSlot: clickedSlot }); clearSelection(); setInspectedUnit(null); return; }
      if (clickedPlayer === ap && isUnitSlot && clickedUnit) { const u = clickedUnit; if (!u.hasAttacked && !u.frozen && !u.keywords.includes("immobile") && u.effect !== "no_attack" && !(u.effect === "no_atk_full_hp" && u.currentHp >= u.hp) && (!u.summonedThisTurn || u.keywords.includes("dash1") || u.keywords.includes("dash2"))) { setSelectedUnit({ player: clickedPlayer, slot: clickedSlot }); setSelectedCard(null); setInspectedUnit(null); return; } }
      clearSelection(); return;
    }
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
    if (pending || state.pendingWaza) return;
    const card = player.hand[index]; if (!card) return;
    const canAfford = getEffCost(card) <= player.mana;
    const canTransform = card.lineage && LINEAGE_TO_COPY[card.lineage] && !(player.currentCopy && player.currentCopy.id === "C14");
    if (!canAfford && !canTransform) { if (selectedCard === index) clearSelection(); else { setSelectedCard(index); setSelectedUnit(null); setInspectedUnit(null); } return; }
    if (canAfford && card.type === "spell" && NO_TARGET_SPELLS.includes(card.effect)) { dispatch({ type: "CAST_SPELL", cardIndex: index, targetPlayer: ap, targetSlot: null }); clearSelection(); setInspectedUnit(null); return; }
    if (selectedCard === index) clearSelection(); else { setSelectedCard(index); setSelectedUnit(null); setInspectedUnit(null); }
  }, [state, pending, player, selectedCard, clearSelection, getEffCost, ap]);

  const inspectedData = inspectedUnit ? state.players[inspectedUnit.player]?.board[inspectedUnit.slot] : null;

  if (gamePhase === "colorSelect") {
    const colorNames = { Red: "🔴 赤 (ファイア)", Blue: "🔵 青 (ウォーター)", Green: "🟢 緑 (リーフ)", White: "⚪ 白 (アイス)", Orange: "🟠 橙 (ビーム)" };
    const currentPick = p1Color === null ? "P1" : "P2";
    const handleColorPick = (color) => { if (p1Color === null) { setP1Color(color); } else { setP2Color(color); setGamePhase("supportSelect"); } };
    return (<div style={screenBg}><div style={{ fontSize: "48px" }}>⭐</div><h2 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center" }}>{currentPick} のデッキカラーを選んでください</h2>{p1Color && <div style={{ fontSize: "14px", opacity: 0.6 }}>P1: {colorNames[p1Color]}</div>}<div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center", maxWidth: "340px" }}>{DECK_COLORS.map(color => { const c = ATTR_COLORS[color]; const cardCount = CARD_POOL.filter(card => card.attr === color).length; return (<button key={color} onClick={() => handleColorPick(color)} style={{ width: "140px", padding: "14px 10px", borderRadius: "14px", background: "linear-gradient(135deg, " + c.light + ", " + c.border + ")", border: "3px solid " + c.border, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", boxShadow: "0 4px 12px " + c.bg + "44" }}><span style={{ fontSize: "16px", fontWeight: "900", color: c.bg }}>{colorNames[color]}</span><span style={{ fontSize: "11px", color: c.bg, opacity: 0.7 }}>{cardCount}種のカード</span></button>); })}</div></div>);
  }

  const colorEmoji = { Red: "🔴", Blue: "🔵", Green: "🟢", White: "⚪", Orange: "🟠" };

  if (gamePhase === "supportSelect") {
    const colorNames = { Red: "🔴 赤", Blue: "🔵 青", Green: "🟢 緑", White: "⚪ 白", Orange: "🟠 橙" };
    const currentPick = p1Support === null ? "P1" : "P2";
    const supportEmojis = { 191: "🐹", 192: "🐟", 193: "🦉" };
    const handleSupportPick = (card) => { if (p1Support === null) { setP1Support(card); } else { setP2Support(card); dispatch({ type: "RESTART_WITH_COLORS", p1Color, p2Color, p1Support: p1Support, p2Support: card }); setGamePhase("playing"); } };
    return (
      <div style={screenBg}><div style={{ fontSize: "48px" }}>🐾</div>
        <h2 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center" }}>{currentPick} のサポートカードを選んでください</h2>
        <div style={{ fontSize: "13px", opacity: 0.6, textAlign: "center" }}>P1: {colorNames[p1Color]} / P2: {colorNames[p2Color]}{p1Support && <span> — P1サポート: {supportEmojis[p1Support.id]}{p1Support.name}</span>}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "320px", width: "100%" }}>
          {SUPPORT_CARDS.map(card => (<button key={card.id} onClick={() => handleSupportPick(card)} style={{ padding: "16px 18px", borderRadius: "14px", background: "linear-gradient(135deg, #1e293b, #334155)", border: "2px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", gap: "14px", boxShadow: "0 4px 16px rgba(0,0,0,0.3)", transition: "all 0.2s" }}>
            <div style={{ fontSize: "32px", flexShrink: 0 }}>{supportEmojis[card.id]}</div>
            <div style={{ textAlign: "left", flex: 1 }}><div style={{ fontSize: "16px", fontWeight: "900", color: "#fff" }}>{card.name}<span style={{ fontSize: "11px", fontWeight: "600", color: "#818CF8", marginLeft: "8px" }}>コスト {card.cost}</span></div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "4px", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{card.desc}</div></div>
          </button>))}
        </div>
      </div>
    );
  }
  const pColor = player.deckColor; const oColor = oppPlayer.deckColor;

  if (state.phase === "passDevice") return (<div style={screenBg}><div style={{ fontSize: "56px" }}>🌟</div><h2 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center", lineHeight: 1.5 }}>プレイヤー {ap==="p1"?"1":"2"} に<br/>デバイスを渡してください</h2><div style={{ fontSize: "14px", opacity: 0.6 }}>{colorEmoji[state.players[ap].deckColor]} {state.players[ap].deckColor} デッキ</div><button onClick={() => dispatch({ type: "CONFIRM_PASS" })} style={btnStyle}>準備OK！ →</button></div>);
  if (state.phase === "gameOver") return (<div style={screenBg}><div style={{ fontSize: "64px" }}>🎉</div><h2 style={{ fontSize: "26px", fontWeight: "900" }}>プレイヤー {state.winner==="p1"?"1":"2"} の勝利！</h2><div style={{ fontSize: "14px", opacity: 0.6 }}>P1 {colorEmoji[state.players.p1.deckColor]} HP:{state.players.p1.leaderHp} / P2 {colorEmoji[state.players.p2.deckColor]} HP:{state.players.p2.leaderHp}</div><button onClick={() => { setGamePhase("colorSelect"); setP1Color(null); setP2Color(null); setP1Support(null); setP2Support(null); clearSelection(); setInspectedUnit(null); }} style={btnStyle}>もう一度遊ぶ</button></div>);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#0f172a 0%,#1e293b 40%,#0f3460 100%)", fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 4px", gap: "4px", overflowX: "hidden" }}>
      <style>{`@keyframes popupFloat { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); } 40% { opacity: 1; transform: translate(-50%, -100%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -160%) scale(0.7); } } @keyframes hexShake { 0% { transform: translate(0,0); } 15% { transform: translate(-4px,2px); } 30% { transform: translate(4px,-2px); } 45% { transform: translate(-3px,1px); } 60% { transform: translate(3px,-1px); } 75% { transform: translate(-1px,1px); } 100% { transform: translate(0,0); } } @keyframes spawnRing { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0.75; } 100% { transform: translate(-50%,-50%) scale(1.2); opacity: 0; } } @keyframes hexSpinY { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(180deg); } } @keyframes cardGlowGreen { 0%, 100% { box-shadow: 0 0 3px 1px rgba(16,185,129,0.3); } 50% { box-shadow: 0 0 8px 3px rgba(16,185,129,0.6), 0 0 16px 6px rgba(16,185,129,0.2); } } @keyframes cardGlowBlue { 0%, 100% { box-shadow: 0 0 3px 1px rgba(96,165,250,0.3); } 50% { box-shadow: 0 0 8px 3px rgba(96,165,250,0.6), 0 0 16px 6px rgba(96,165,250,0.2); } } @keyframes cardGlowUR { 0% { box-shadow: 0 0 4px 2px rgba(185,242,255,0.2), 0 0 8px 4px rgba(255,215,0,0.1); } 33% { box-shadow: 0 0 6px 3px rgba(255,215,0,0.3), 0 0 12px 6px rgba(185,242,255,0.15); } 66% { box-shadow: 0 0 6px 3px rgba(185,242,255,0.3), 0 0 12px 6px rgba(255,180,255,0.15); } 100% { box-shadow: 0 0 4px 2px rgba(185,242,255,0.2), 0 0 8px 4px rgba(255,215,0,0.1); } }`}</style>
      {inspectedData && <CardInfoPanel unit={inspectedData} onClose={() => setInspectedUnit(null)} />}
      {selectedCard !== null && player.hand[selectedCard] && !inspectedData && <CardInfoPanel card={player.hand[selectedCard]} onClose={() => clearSelection()} />}
      <div style={{ position: "fixed", top: "10px", right: "10px", zIndex: 1000 }}>
        {!showResetConfirm ? <button onClick={() => setShowResetConfirm(true)} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", color: "rgba(255,255,255,0.5)", fontSize: "10px", cursor: "pointer" }}>🔄 リセット</button>
        : <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "rgba(0,0,0,0.8)", padding: "8px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)" }}>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)" }}>リセットする？</span>
          <button onClick={() => { setShowResetConfirm(false); setGamePhase("colorSelect"); setP1Color(null); setP2Color(null); setP1Support(null); setP2Support(null); clearSelection(); setInspectedUnit(null); }} style={{ padding: "4px 10px", background: "#DC2626", border: "none", borderRadius: "6px", color: "#fff", fontSize: "10px", fontWeight: "700", cursor: "pointer" }}>はい</button>
          <button onClick={() => setShowResetConfirm(false)} style={{ padding: "4px 10px", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "6px", color: "rgba(255,255,255,0.7)", fontSize: "10px", cursor: "pointer" }}>いいえ</button>
        </div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 14px", background: "rgba(255,255,255,0.06)", borderRadius: "10px", fontSize: "12px", width: "100%", maxWidth: "380px", justifyContent: "space-between" }}><span style={{ fontWeight: "800", opacity: 0.6 }}>{colorEmoji[oColor]}P{oppId==="p1"?"1":"2"}</span><span>❤{oppPlayer.leaderHp}</span><span>💎{oppPlayer.mana}/{oppPlayer.maxMana}</span><span style={{ color: oppPlayer.hand.length >= 9 ? "#FF4444" : oppPlayer.hand.length >= 7 ? "#FB923C" : "inherit" }}>🃏{oppPlayer.hand.length}</span><span>📦{oppPlayer.deck.length}</span><span>💀{oppPlayer.graveyard.length}</span></div>
      <HoneycombBoard player={oppPlayer} playerId={oppId} state={state} selectedUnit={selectedUnit} highlightSlots={highlightSlots} onSlotClick={handleSlotClick} isFlipped={true} inspectedUnit={inspectedUnit} popups={popups} />
      <div style={{ width: "85%", maxWidth: "340px", height: "2px", background: "linear-gradient(90deg,transparent,rgba(255,105,180,0.5),transparent)", margin: "2px 0" }} />
      <HoneycombBoard player={player} playerId={ap} state={state} selectedUnit={selectedUnit} highlightSlots={highlightSlots} onSlotClick={handleSlotClick} isFlipped={false} inspectedUnit={inspectedUnit} popups={popups} />
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 14px", background: "rgba(255,105,180,0.12)", borderRadius: "10px", fontSize: "12px", width: "100%", maxWidth: "380px", justifyContent: "space-between", border: "1px solid rgba(255,105,180,0.2)" }}><span style={{ fontWeight: "900", color: "#FF69B4" }}>★{colorEmoji[pColor]}P{ap==="p1"?"1":"2"}</span><span>❤{player.leaderHp}</span><span>💎{player.mana}/{player.maxMana}</span><span>📦{player.deck.length}</span><span>💀{player.graveyard.length}</span><span style={{ color: player.hand.length >= 9 ? "#FF4444" : player.hand.length >= 7 ? "#FB923C" : "#fff" }}>🃏{player.hand.length}</span>{player.costReduction > 0 && <span style={{ color: "#A78BFA", fontSize: "10px" }}>次-{player.costReduction}</span>}<button onClick={() => { if (!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard) { dispatch({ type: "END_TURN" }); clearSelection(); setInspectedUnit(null); } }} style={{ padding: "5px 16px", background: (pending || state.pendingKain || state.pendingKuu || state.pendingTwisterDiscard || state.pendingWaza || state.pendingWaterDiscard) ? "#666" : "linear-gradient(135deg,#FF69B4,#FF1493)", border: "none", borderRadius: "16px", color: "#fff", fontWeight: "900", fontSize: "11px", cursor: (pending || state.pendingKain || state.pendingKuu || state.pendingTwisterDiscard || state.pendingWaza || state.pendingWaterDiscard) ? "not-allowed" : "pointer", boxShadow: (pending || state.pendingKain || state.pendingKuu || state.pendingTwisterDiscard || state.pendingWaza || state.pendingWaterDiscard) ? "none" : "0 2px 8px rgba(255,20,147,0.3)" }}>ターン終了</button></div>
      {state.showWazaPanel && player.currentCopy && (() => { const co = {}; player.currentCopy.wazas.forEach(w => { let c = w.cost; if (w.id === "ice1" && checkLink(state, ap, "base", "White", 1)) c = Math.max(0, c - 1); if (w.id === "leaf2" && checkLink(state, ap, "base", "Green", 2)) c = Math.max(0, c - 1); co[w.id] = c; }); const atkBonus = (player.leaderAtkBonus || 0) + UNIT_SLOTS.filter(sl => player.board[sl] && player.board[sl].id === 402).length; const sparkLaserDmg = 1 + (player.sparkLaserBonus || 0); const linkBlueI = checkLink(state, ap, "base", "Blue", 1); const hammerFireDmg = player.hammerFireDmg || 1; const linkRedII = checkLink(state, ap, "base", "Red", 2); const wazaDmgBonus = getWazaDmgBonus(player); return <WazaPanel copy={player.currentCopy} stocks={player.wazaStocks} mana={player.mana} usedThisTurn={player.usedWazaThisTurn} costOverrides={co} transformedThisTurn={player.transformedThisTurn} leaderAtkBonus={atkBonus} sparkLaserDmg={sparkLaserDmg} linkBlueI={linkBlueI} hammerFireDmg={hammerFireDmg} linkRedII={linkRedII} wazaDmgBonus={wazaDmgBonus} onSelect={(wazaId) => { dispatch({ type: "USE_WAZA", wazaId }); clearSelection(); setInspectedUnit(null); }} onClose={() => dispatch({ type: "TOGGLE_WAZA_PANEL" })} />; })()}
      <div style={{ display: "flex", gap: "6px", padding: "8px 10px", overflowX: "auto", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>{player.hand.map((card, i) => { let ps; if (state.pendingKain) ps = "playable"; else if (state.pendingTwisterDiscard || state.pendingWaterDiscard) ps = "playable"; else if (getEffCost(card) <= player.mana) ps = "playable"; else if (card.lineage && LINEAGE_TO_COPY[card.lineage] && !(player.currentCopy && player.currentCopy.id === "C14")) ps = "copyOnly"; else ps = "disabled"; return <CardInHand key={i} card={card} index={i} isSelected={selectedCard===i} playState={ps} effCost={getEffCost(card)} onClick={() => handleCardClick(i)} />; })}</div>
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
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && selectedCard !== null && player.hand[selectedCard]?.lineage && LINEAGE_TO_COPY[player.hand[selectedCard].lineage] && <span>🌟 リーダー(本陣)をタップで変身 / マスをタップで召喚</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && selectedCard !== null && !player.hand[selectedCard]?.lineage && player.hand[selectedCard]?.type === "helper" && <span>📍 配置先のマスをタップ</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && selectedCard !== null && player.hand[selectedCard]?.type === "spell" && <span>🎯 対象をタップ</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && selectedUnit && <span>⚔️ 攻撃対象をタップ（赤ハイライト）</span>}
        {!pending && !state.pendingKain && !state.pendingKuu && !state.pendingTwisterDiscard && !state.pendingWaza && !state.pendingWaterDiscard && !selectedCard && !selectedUnit && <span>{player.currentCopy ? "リーダーをタップでワザ / カードか味方をタップ" : "カードか味方ユニットをタップして操作"}</span>}
      </div>
      <div style={{ width: "100%", maxWidth: "380px", maxHeight: "70px", overflowY: "auto", background: "rgba(0,0,0,0.25)", borderRadius: "8px", padding: "5px 10px", fontSize: "10px", lineHeight: 1.5, color: "rgba(255,255,255,0.5)" }}>{state.log.map((l, i) => <div key={i} style={{ opacity: i===0?1:0.55 }}>{l}</div>)}</div>
    </div>
  );
}
