// ═══════════════════════════════════════════
//  RARITY SYSTEM
// ═══════════════════════════════════════════
export const CARD_RARITY = {
  // ── Common属性 ──
  1: "C", 2: "C", 4: "C", 5: "C", 6: "C", 7: "C", 9: "C", 10: "C", 12: "C", 13: "C", 18: "C", 21: "C", 23: "C", 27: "C", 29: "C", 30: "C",
  3: "R", 8: "R", 11: "R", 15: "R", 16: "R", 17: "R", 19: "R", 20: "R", 22: "R", 24: "R", 28: "R",
  14: "SR", 25: "SR", 26: "SR",
  // ── Red ──
  202: "C", 204: "C", 205: "C",
  201: "R", 203: "R",
  206: "SR", 207: "SR", 209: "SR",
  208: "UR", 210: "UR",
  211: "SR", 212: "SR",
  // ── Blue ──
  301: "C", 302: "C", 304: "C", 308: "C", 313: "C",
  303: "R", 305: "R", 306: "R", 307: "R", 311: "R",
  309: "SR", 310: "SR", 312: "SR", 314: "SR",
  315: "UR",
  316: "UR", 317: "SR",
  // ── Green ──
  402: "C", 403: "C", 407: "C", 409: "C",
  401: "R", 404: "R", 412: "R",
  405: "SR", 406: "SR", 408: "SR", 410: "SR",
  411: "UR", 413: "UR",
  // ── White ──
  501: "C", 504: "C", 509: "C", 510: "C",
  502: "R", 503: "R", 506: "R", 507: "R",
  505: "SR", 508: "SR",
  511: "UR", 512: "UR", 513: "UR",
  // ── Orange ──
  602: "C", 603: "C", 604: "C",
  601: "R", 605: "R", 606: "R",
  607: "SR", 608: "SR", 609: "SR",
  610: "UR", 611: "UR",
  // ── Purple ──
  701: "SR",
  // ── Black ──
  801: "SR", 802: "UR",
  // ── Support ──
  191: "UR", 192: "UR", 193: "UR",
};

// ═══════════════════════════════════════════
//  TOKEN CARDS
// ═══════════════════════════════════════════
export const TOKEN_CAPPYBARE = { id: 853, name: "キャピィ(裸)", type: "helper", cost: 0, attack: 0, hp: 1, attr: "Common", keywords: [], desc: "帽子がとれたすがた", isToken: true };
export const TOKEN_RANDIA2 = { id: 854, name: "ランディア(分)", type: "helper", cost: 0, attack: 3, hp: 2, attr: "Red", keywords: [], desc: "", isToken: true };
export const TOKEN_STARBLOCK = { id: 856, name: "星ブロック", type: "helper", cost: 0, attack: 0, hp: 2, attr: "Common", keywords: ["immobile"], desc: "📌攻撃不可\nお互いのターン終了時\n自身に1ダメージ", effect: "endturn_starblock_decay", isToken: true };
export const TOKEN_ENERGY = { id: 857, name: "エナジードリンク", type: "spell", cost: 0, attr: "Common", desc: "このターン中\n使えるPPが1増える", effect: "energy_drink", isToken: true };
export const TOKEN_YELLOWSNAKE = { id: 858, name: "イエロースネーク", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Orange", keywords: [], desc: "", isToken: true };
export const TOKEN_DUBIAJR = { id: 859, name: "ドゥビアJr.", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["dash1"], desc: "⚡ダッシュI", isToken: true };
export const TOKEN_FOOD = { id: 860, name: "たべもの", type: "spell", cost: 0, attr: "Common", desc: "キャラ1体の\nHPを1回復", effect: "heal1", isToken: true };
export const TOKEN_WAPOD = { id: 861, name: "ワポッド", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: [], desc: "", isToken: true };
export const TOKEN_BOMB = { id: 863, name: "ばくだん", type: "helper", cost: 0, attack: 1, hp: 2, attr: "Common", keywords: ["immobile"], desc: "📌攻撃不可\nお互いのターン終了時\n自身に1ダメージ\n死亡時:隣接全ヘルパーに\nATK分ダメージ", effect: "bomb_unit", isToken: true };
export const TOKEN_SNOWBALL = { id: 864, name: "雪玉", type: "spell", cost: 2, attr: "White", desc: "敵ヘルパー1体を\n-2/-2する", effect: "snowball_debuff", isToken: true };
export const TOKEN_DARKMIRROR = { id: 870, name: "邪悪な鏡像", type: "helper", cost: 1, attack: 0, hp: 2, attr: "Black", keywords: [], desc: "死亡時:敵リーダーに1ダメ\n本体が潜むなら本体を出す\n相手ターン終了時:破壊", effect: "death_dark_mirror", isToken: true };

// ═══════════════════════════════════════════
//  SUPPORT CARDS (リック・カイン・クー)
// ═══════════════════════════════════════════
export const SUPPORT_CARDS = [
  { id: 191, name: "リック", type: "spell", cost: 2, attr: "Common", desc: "ランダム敵ヘルパー1体に\n2ダメージ\n🔄2ターン後に手札に戻る", effect: "rick_dmg", isSupport: true },
  { id: 192, name: "カイン", type: "spell", cost: 1, attr: "Common", desc: "手札1枚をデッキに戻し\nカード1枚引く\n🔄2ターン後に手札に戻る", effect: "kain_cycle", isSupport: true },
  { id: 193, name: "クー", type: "spell", cost: 0, attr: "Common", desc: "味方ヘルパー1体を\n空きマスに移動 or\n味方と入れ替え\n🔄2ターン後に手札に戻る", effect: "kuu_move", isSupport: true },
];

// ═══════════════════════════════════════════
//  CARD POOL
// ═══════════════════════════════════════════
export const CARD_POOL = [
  { id: 1, name: "ワドルディ", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Common", keywords: [], desc: "", lineage: "waddle" },
  { id: 2, name: "カブー", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["block"], desc: "🛡️ブロック" },
  { id: 3, name: "ブロントバート", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: ["flying1"], desc: "🪽ふゆうI\n召喚時: 敵味方いずれかの\n空きマスに星ブロック", effect: "summon_starblock", targetMode: "any_empty_slot" },
  { id: 4, name: "セルリアン", type: "helper", cost: 1, attack: 2, hp: 1, attr: "Common", keywords: ["flying1"], desc: "🪽ふゆうI" },
  { id: 201, name: "フレイマー", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Red", keywords: [], desc: "召喚時: 味方リーダーが\nダメージを受けているなら\nもう1体出す", effect: "summon_copy_if_leader_damaged", lineage: "fire" },
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
  { id: 601, name: "レーザーボール", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Orange", keywords: [], desc: "召喚時: 敵1体に\n1ダメージ", effect: "summon_1dmg", targetMode: "enemy_any", lineage: "beam" },
  { id: 602, name: "ピアス", type: "helper", cost: 2, attack: 2, hp: 3, attr: "Orange", keywords: ["pierce1"], desc: "🔱貫通I\n攻撃が後ろの敵にも\n貫通する", effect: "", lineage: "spear" },
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
  { id: 604, name: "ワドルドゥ", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Orange", keywords: [], desc: "死亡時:\n【リンクII】\nカード1枚引く", effect: "death_draw_link_2", lineage: "beam" },
  { id: 605, name: "ウィッピィ", type: "helper", cost: 2, attack: 2, hp: 2, attr: "Orange", keywords: [], desc: "死亡時: 相手手札から\nランダム1枚コピー", effect: "death_copy_opp_hand", lineage: "whip" },
  { id: 205, name: "ボボ", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Red", keywords: [], desc: "死亡時:\nカード1枚引いて\n敵リーダーに1ダメ", effect: "death_bobo", lineage: "fire" },
  { id: 16, name: "ブルームハッター", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Common", keywords: [], desc: "死亡時: 次に使う\nカードのコスト-1", effect: "death_cost_reduce" },
  { id: 17, name: "ハンターデグト", type: "helper", cost: 2, attack: 3, hp: 4, attr: "Common", keywords: [], desc: "ダメージを受けていない\n場合、攻撃できない", effect: "no_atk_full_hp" },
  { id: 18, name: "パラソルワドルディ", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Common", keywords: ["guard1"], desc: "🪨ガードI" },
  { id: 19, name: "サーチス", type: "helper", cost: 2, attack: 3, hp: 3, attr: "Common", keywords: [], desc: "次の自分のターン開始時\n全ヘルパー(自身含む)\nに3ダメージ", effect: "start_explode3", lineage: "crash" },
  { id: 404, name: "バルビィ", type: "helper", cost: 2, attack: 2, hp: 3, attr: "Green", keywords: ["stealth"], desc: "🫥せんぷく\n(攻撃するまで対象外)", effect: "", lineage: "leaf" },
  { id: 206, name: "バーニンレオ", type: "helper", cost: 3, attack: 2, hp: 2, attr: "Red", keywords: [], desc: "召喚時: 敵1体に\n2ダメージ", effect: "summon_2dmg_target", targetMode: "enemy_any", lineage: "fire" },
  { id: 207, name: "ナックルジョー", type: "helper", cost: 3, attack: 2, hp: 3, attr: "Red", keywords: [], desc: "召喚時: 赤属性の味方\n攻撃力+1", effect: "summon_buff_red", lineage: "fighter" },
  { id: 406, name: "スパーキー", type: "helper", cost: 3, attack: 3, hp: 3, attr: "Green", keywords: [], desc: "召喚時: 自身含む全\nヘルパーに1ダメージ", effect: "summon_aoe1_self", lineage: "spark" },
  { id: 407, name: "シェルト", type: "helper", cost: 3, attack: 2, hp: 2, attr: "Green", keywords: ["dash2"], desc: "⚡⚡ダッシュII\n召喚ターン中\nダメージを受けない", effect: "summon_immune" },
  { id: 408, name: "オウグルフ", type: "helper", cost: 3, attack: 2, hp: 3, attr: "Green", keywords: [], desc: "召喚時: ダメージ中の\n敵ヘルパー全てを\nHP-2する", effect: "summon_hp_reduce_all_damaged" },
  { id: 606, name: "ロッキー", type: "helper", cost: 3, attack: 3, hp: 2, attr: "Orange", keywords: ["guard1"], desc: "🪨ガードI", lineage: "stone" },
  { id: 505, name: "チリー", type: "helper", cost: 3, attack: 2, hp: 2, attr: "White", keywords: [], desc: "召喚時: 敵1体を凍結\nヘルパー:行動不能\nリーダー:次ターンワザ不可", effect: "summon_freeze", targetMode: "enemy_any", lineage: "ice" },
  { id: 506, name: "ツイスター", type: "helper", cost: 3, attack: 2, hp: 3, attr: "White", keywords: [], desc: "召喚時: 2枚引いて\n1枚捨てる", effect: "summon_draw2_discard1", lineage: "tornado" },
  { id: 208, name: "デデデ大王", type: "helper", cost: 3, attack: 2, hp: 4, attr: "Red", keywords: [], desc: "召喚時: 残コスト全消費\n→Xダメ&攻撃力+X\n【リンク赤I】ダッシュIを得る", effect: "summon_dedede", targetMode: "enemy_any", lineage: "hammer", linkKeywords: [{ attr: "Red", count: 1, keyword: "dash1" }] },
  { id: 701, name: "ノディ", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Purple", keywords: ["immobile"], desc: "📌攻撃不可\n死亡時: 相手のコピー能力\nを「スリープ」にする", effect: "death_sleep_opponent", lineage: "sleep" },
  { id: 801, name: "シャドーカービィ", type: "helper", cost: 3, attack: 2, hp: 2, attr: "Black", keywords: ["guard1"], desc: "🪨ガードI\n召喚時: 敵ヘルパーの\nATK/HPをコピー", effect: "summon_copy_stats", targetMode: "enemy_helper" },
  { id: 802, name: "ダークメタナイト", type: "helper", cost: 5, attack: 4, hp: 3, attr: "Black", keywords: ["flying2"], desc: "🪽🪽ふゆうII\n召喚時: ランダムな味方マスに\n邪悪な鏡像を3体出す\nそのうち1体に潜む", effect: "summon_dark_meta" },
  { id: 607, name: "キングスドゥ", type: "helper", cost: 4, attack: 3, hp: 3, attr: "Orange", keywords: ["pierce1"], desc: "🔱貫通I\nターン終了時:\n【リンク:橙II】\n正面の敵全体に3ダメ", effect: "endturn_3dmg_facing_link_o2", lineage: "beam" },
  { id: 608, name: "Mr.ダウター", type: "helper", cost: 4, attack: 2, hp: 4, attr: "Orange", keywords: ["pierce1"], desc: "🔱貫通I\nターン終了時:\nイエロースネークを\nX体出す(X=敵ヘルパー数)", effect: "endturn_spawn_snakes" },
  { id: 409, name: "ギガントエッジ", type: "helper", cost: 4, attack: 3, hp: 5, attr: "Green", keywords: ["block"], desc: "🛡️ブロック", lineage: "sword" },
  { id: 22, name: "スフィアローパー", type: "helper", cost: 4, attack: 3, hp: 5, attr: "Common", keywords: ["flying1"], desc: "🪽ふゆうI" },
  { id: 309, name: "ウォーターガルボロス", type: "helper", cost: 4, attack: 3, hp: 4, attr: "Blue", keywords: [], desc: "召喚時: 敵ヘルパー\nの攻撃力-2", effect: "summon_debuff_atk2", targetMode: "enemy_helper", lineage: "water" },
  { id: 20, name: "パペットワドルディ", type: "helper", cost: 4, attack: 2, hp: 4, attr: "Common", keywords: [], desc: "死亡時: ワドルディ\n3体を手札に", effect: "death_waddle3", lineage: "waddle" },
  { id: 21, name: "ザンギブル", type: "helper", cost: 4, attack: 4, hp: 4, attr: "Common", keywords: [], desc: "攻撃時: 相手山札\n2枚墓地へ", effect: "attack_mill2", lineage: "cutter" },
  { id: 310, name: "ファッティバッファー", type: "helper", cost: 4, attack: 5, hp: 3, attr: "Blue", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時: 自分の山札を\n上から2枚破棄", effect: "summon_self_mill2", lineage: "water" },
  { id: 311, name: "巨大フロッツォ", type: "helper", cost: 5, attack: 5, hp: 7, attr: "Blue", keywords: ["block"], desc: "🛡️ブロック\nこのヘルパーは\nこうげきできない", effect: "no_attack" },
  { id: 312, name: "バルバル", type: "spell", cost: 4, attr: "Blue", desc: "攻撃力3以下の\n敵ヘルパー1体を\n消滅させる", effect: "destroy_atk3_or_less" },
  { id: 410, name: "スフィアローパー(緑)", type: "helper", cost: 4, attack: 3, hp: 4, attr: "Green", keywords: [], desc: "召喚時: ダメージ中の\n敵ヘルパーに3ダメ", effect: "summon_3dmg_damaged", targetMode: "enemy_helper_damaged", lineage: "spark" },
  { id: 209, name: "スフィアローパー(赤)", type: "helper", cost: 4, attack: 3, hp: 4, attr: "Red", keywords: ["flying1"], desc: "🪽ふゆうI\n召喚時: 赤味方1体\n攻撃力+2", effect: "summon_buff_red_atk2", targetMode: "friendly_red", lineage: "fire" },
  { id: 508, name: "スフィアローパー(白)", type: "helper", cost: 4, attack: 3, hp: 4, attr: "White", keywords: ["flying1"], desc: "🪽ふゆうI\n召喚時: 敵ヘルパー1体\nを-1/-1する", effect: "summon_debuff_1_1", targetMode: "enemy_helper", lineage: "ice" },
  { id: 509, name: "Mr.フロスティ", type: "helper", cost: 4, attack: 4, hp: 3, attr: "White", keywords: [], desc: "召喚時: スペル\n『雪玉』を手札に加える", effect: "summon_snowball", lineage: "ice" },
  { id: 510, name: "アーマーワドルディ", type: "helper", cost: 4, attack: 3, hp: 4, attr: "White", keywords: ["block"], desc: "🛡️ブロックI\nダメージを受けるたび\nワドルディ1枚を\n手札に加える", effect: "on_damage_waddle" },
  { id: 609, name: "マウンデス", type: "helper", cost: 5, attack: 3, hp: 5, attr: "Orange", keywords: ["guard1"], desc: "🪨ガードI\nターン終了時: 手札の\n橙ヘルパー1体を+1/+1", effect: "endturn_buff_orange_hand", lineage: "stone" },
  { id: 610, name: "グランドローパー", type: "helper", cost: 6, attack: 5, hp: 4, attr: "Orange", keywords: ["flying1", "stealth"], desc: "🪽ふゆうI 🫥せんぷく\n召喚時: ランダム敵\nヘルパー2体に3ダメ", effect: "summon_random_3dmg_2" },
  { id: 23, name: "ゴルムルンバ", type: "helper", cost: 5, attack: 6, hp: 5, attr: "Common", keywords: [], desc: "", lineage: "beast" },
  { id: 405, name: "ウィスピーウッズ", type: "helper", cost: 2, attack: 0, hp: 6, attr: "Green", keywords: ["immobile"], desc: "📌攻撃不可\nターン開始時ランダム:\n①ワドルディ召喚\n②ブロントバート召喚\n③敵1体に1ダメ", effect: "start_whispy", lineage: "leaf" },
  { id: 210, name: "ランディア", type: "helper", cost: 7, attack: 4, hp: 5, attr: "Red", keywords: [], desc: "死亡時: 3/2の\nランディアを4体出す", effect: "death_randia", lineage: "fire" },
  { id: 211, name: "ボンカース", type: "helper", cost: 5, attack: 3, hp: 4, attr: "Red", keywords: [], desc: "召喚時: ランダムな敵の\n空きマス2つに「ばくだん」\nを設置する\n攻撃時: このターン中\n攻撃力+3", effect: "summon_bonkers", lineage: "hammer" },
  { id: 212, name: "ミスター・ブライト", type: "helper", cost: 4, attack: 4, hp: 3, attr: "Red", keywords: ["block"], desc: "🛡️ブロックI\n召喚時: お互いのリーダーに\n2ダメージ\n死亡時: ミスター・シャインを\n手札に加える", effect: "mr_bright", lineage: "fire" },
  { id: 511, name: "白き翼ダイナブレイド", type: "helper", cost: 7, attack: 6, hp: 7, attr: "White", keywords: [], desc: "召喚時: 選択\n①3枚ドロー\n②このヘルパーのHP+5", effect: "summon_dynablade", targetMode: "choice_dynablade" },
  { id: 512, name: "ゴライアス", type: "helper", cost: 5, attack: 4, hp: 4, attr: "White", keywords: [], desc: "召喚時:雪玉2枚を手札に\n雪玉コスト-1(場にいる間)\nターン終了時\n【リンク:白IV】\nすべての敵に4ダメ", effect: "goliath", lineage: "ice" },
  { id: 513, name: "ギャラクティックナイト", type: "helper", cost: 20, attack: 3, hp: 3, attr: "White", keywords: ["guard2", "dash2", "flying2", "triple_attack"], desc: "🪨🪨ガードII ⚡⚡ダッシュII 🪽🪽ふゆうII ⚔×3\n墓地20以上でコスト-20\n召喚時:墓地を20消費\nターン終了時:ランダムな\nマスに2ダメ×12回", effect: "galactic_knight", lineage: "sword" },
  { id: 24, name: "ゴルドー", type: "spell", cost: 2, attr: "Common", desc: "ヘルパー1体に\n3ダメージ", effect: "deal3_helper" },
  { id: 25, name: "マキシムトマト", type: "spell", cost: 1, attr: "Common", desc: "キャラ1体の\nHPを3回復", effect: "heal3" },
  { id: 26, name: "プロペラー", type: "helper", cost: 1, attack: 1, hp: 1, attr: "Common", keywords: [], desc: "召喚時: 敵が前ターンに\nサポート使用なら\n+2/+2と⚡ダッシュI", effect: "summon_propeller" },
  { id: 27, name: "クレイン", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Common", keywords: ["stealth"], desc: "🫥せんぷく" },
  { id: 28, name: "ニードラス", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Common", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時: 自身を除く\nランダム1体に1ダメ", effect: "summon_needlous" },
  { id: 29, name: "グリゾー", type: "helper", cost: 3, attack: 3, hp: 6, attr: "Common", keywords: [], desc: "ダメージを受けていない\n間は攻撃不可", effect: "no_atk_full_hp" },
  { id: 30, name: "デカブー", type: "helper", cost: 3, attack: 2, hp: 2, attr: "Common", keywords: [], desc: "召喚時: 指定の味方マスに\nカブーを1体出す", effect: "dekaboo", targetMode: "friendly_empty" },
  { id: 313, name: "ブリッパー", type: "helper", cost: 1, attack: 1, hp: 2, attr: "Common", keywords: [], desc: "手札から捨てられた時:\nブリッパー1体を\n自分の場に出す", effect: "discard_spawn_self", lineage: "water" },
  { id: 314, name: "ポピーブラザーズJr.", type: "helper", cost: 2, attack: 2, hp: 1, attr: "Blue", keywords: [], desc: "召喚時: 相手の空きマスに\n「ばくだん」を設置する", effect: "summon_place_bomb", targetMode: "enemy_empty_slot", lineage: "bomb" },
  { id: 315, name: "メタルジェネラル", type: "helper", cost: 6, attack: 4, hp: 6, attr: "Blue", keywords: ["block"], desc: "🛡️ブロック\n召喚時: 相手のランダムな\n空きマス3つにばくだん設置", effect: "summon_bombs_3", lineage: "bomb" },
  { id: 316, name: "ガブリエル", type: "helper", cost: 13, attack: 4, hp: 5, attr: "Blue", keywords: ["dash1"], desc: "⚡ダッシュI\n山札から破棄された時:\n手札に加える\n破棄した枚数分コスト-1", effect: "gabriel", lineage: "water" },
  { id: 317, name: "ミスター・シャイン", type: "helper", cost: 4, attack: 3, hp: 4, attr: "Blue", keywords: ["pierce1"], desc: "🔱貫通I\n召喚時: お互いの山札を\n上から2枚破棄\n死亡時: ミスター・ブライトを\n手札に加える", effect: "mr_shine", lineage: "cutter" },
  { id: 611, name: "バンダナワドルディ", type: "helper", cost: 3, attack: 2, hp: 3, attr: "Orange", keywords: ["pierce1"], desc: "🔱貫通I\n召喚時:デッキから\n橙カードを2枚引く", effect: "summon_draw_orange_lineage", lineage: "spear" },
  { id: 411, name: "メタナイト", type: "helper", cost: 3, attack: 5, hp: 5, attr: "Green", keywords: ["dash1"], desc: "⚡ダッシュI\n召喚時:相手手札の\n最大コストヘルパーを\n正面に出す", effect: "summon_metaknight", lineage: "sword" },
  { id: 412, name: "ブレイドナイト", type: "helper", cost: 2, attack: 2, hp: 3, attr: "Green", keywords: [], desc: "味方リーダーのこうげき時\n反撃ダメージ-2", effect: "passive_reduce_retaliation", lineage: "sword" },
  { id: 413, name: "ロロロとラララ", type: "helper", cost: 4, attack: 2, hp: 2, attr: "Green", keywords: [], desc: "召喚時: 指定の味方マスに\nロロロとラララを1体出す\n【リンクI】ダッシュIを持つ\n攻撃時【リンクIII】\nカードを1枚引く", effect: "rololo_rarara", targetMode: "friendly_empty", linkKeywords: [{ attr: "Green", count: 1, keyword: "dash1" }] },
];

// ★ 氷柱トークン
export const TOKEN_ICEPILLAR = { id: 862, name: "氷柱", type: "helper", cost: 0, attack: 0, hp: 1, attr: "White", keywords: ["immobile", "block"], desc: "📌攻撃不可 🛡️ブロック", effect: "", isToken: true };
