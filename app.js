// ===== Google Sheets API =====
const API_URL = "https://script.google.com/macros/s/AKfycbwOI0j713ork91SWh5Q_CBG4P3iblclQUq0xV-jfDXTgIR9CJ9-ZJ8VBmSI8fF5pIpA/exec";

async function apiGet(params) {
  const url = API_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url);
  return res.json();
}

async function apiPost(params, body) {
  const url = API_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ===== グローバル変数 =====
let currentRole = null;
let currentGradeFilter = "all";
let currentDetailPlayerName = null;
let currentDetailType = "20m";
let currentEditPlayerName = null;
let currentEditType = "20m";
let currentEditRow = null;
let currentEditCol = null;
let playerChart = null;
let cachedRankingData = { "20m": [] };
let cachedEditPlayerList = [];

// ===== 画面切り替え =====
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
  window.scrollTo(0, 0);
}

// ===== ログイン =====
document.getElementById("login-btn").addEventListener("click", handleLogin);
document.getElementById("password-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleLogin();
});

async function handleLogin() {
  const password = document.getElementById("password-input").value;
  const errorEl = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");

  if (!password) { errorEl.textContent = "パスワードを入力してください"; return; }

  btn.textContent = "...";
  btn.disabled = true;

  try {
    const data = await apiGet({ action: "getPasswords" });
    const playerPw = data.player_password || "Tensei";
    const adminPw = data.admin_password || "Appare";

    if (password === playerPw) {
      currentRole = "player";
      errorEl.textContent = "";
      setupDashboard();
    } else if (password === adminPw) {
      currentRole = "admin";
      errorEl.textContent = "";
      setupDashboard();
    } else {
      errorEl.textContent = "パスワードが正しくありません";
      document.getElementById("password-input").value = "";
    }
  } catch (err) {
    errorEl.textContent = "接続エラー。もう一度お試しください";
  }

  btn.textContent = "Log in";
  btn.disabled = false;
}

function setupDashboard() {
  const badge = document.getElementById("role-badge");
  if (currentRole === "player") {
    badge.textContent = "選手モード";
    badge.className = "badge badge-player";
    document.querySelectorAll(".admin-only").forEach((el) => (el.style.display = "none"));
  } else {
    badge.textContent = "管理者モード";
    badge.className = "badge badge-admin";
    document.querySelectorAll(".admin-only").forEach((el) => (el.style.display = ""));
  }
  showScreen("dashboard-screen");
}

// ===== ログアウト =====
document.getElementById("logout-btn").addEventListener("click", () => {
  currentRole = null;
  document.getElementById("password-input").value = "";
  showScreen("login-screen");
});

// ===== 戻るボタン =====
window.goBack = function (screenId) {
  if (screenId === "dashboard") showScreen("dashboard-screen");
  else if (screenId === "ranking") showScreen("ranking-screen");
  else if (screenId === "time-input") showScreen("time-input-screen");
  else if (screenId === "time-edit") showScreen("time-edit-screen");
  else if (screenId === "password") showScreen("password-screen");
};

// ===== ランキング表示 =====
window.showRanking = async function () {
  showScreen("ranking-screen");
  currentGradeFilter = "all";
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(".filter-btn").classList.add("active");
  if (document.getElementById("ranking-search")) document.getElementById("ranking-search").value = "";
  await loadRanking("20m");
};

// フィルター処理
function applyGradeFilter(grade, btnEl) {
  currentGradeFilter = grade;
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  btnEl.classList.add("active");
  const searchText = document.getElementById("ranking-search") ? document.getElementById("ranking-search").value.trim() : "";
  renderFilteredRanking("20m", searchText);
}

window.filterGrade = function (grade, btnEl) { applyGradeFilter(grade, btnEl); };

document.querySelectorAll(".filter-btn[data-grade]").forEach((btn) => {
  btn.addEventListener("click", function () {
    applyGradeFilter(this.dataset.grade, this);
  });
});

async function loadRanking(type) {
  const listEl = document.getElementById(`ranking-list-${type}`);
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const data = await apiGet({ action: "getRecords", type: type });
    const records = data.records || [];

    const ranked = records
      .filter((r) => r.bestTime !== null)
      .sort((a, b) => a.bestTime - b.bestTime);

    cachedRankingData[type] = ranked.map((r) => ({
      playerName: r.name,
      grade: r.grade,
      time: r.bestTime,
    }));

    const searchText = document.getElementById("ranking-search") ? document.getElementById("ranking-search").value.trim() : "";
    renderFilteredRanking(type, searchText);
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

// ===== 選手詳細（グラフ） =====
window.showPlayerDetail = async function (_, playerName) {
  currentDetailPlayerName = playerName;
  currentDetailType = "20m";

  document.getElementById("player-detail-name").textContent = playerName;
  showScreen("player-detail-screen");

  await loadPlayerDetail(playerName, "20m");
};

window.switchDetailTab = async function (type, tabEl) {
  currentDetailType = type;
  document.querySelectorAll("#player-detail-screen .tab").forEach((t) => t.classList.remove("active"));
  tabEl.classList.add("active");
  await loadPlayerDetail(currentDetailPlayerName, type);
};

async function loadPlayerDetail(playerName, type) {
  const recordsListEl = document.getElementById("player-records-list");
  recordsListEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const data = await apiGet({ action: "getPlayerRecords", type: type, name: playerName });
    const history = data.history || [];

    if (history.length === 0) {
      recordsListEl.innerHTML = '<div class="empty-message">この種目の記録はありません</div>';
      renderChart([], []);
      return;
    }

    const labels = history.map((r) => r.date);
    const times = history.map((r) => r.time);
    renderChart(labels, times);

    recordsListEl.innerHTML = history
      .slice()
      .reverse()
      .map((r) => `
        <div class="record-item">
          <div>
            <div class="record-time">${r.time.toFixed(2)}秒</div>
            <div class="record-date">${r.date}</div>
          </div>
        </div>
      `)
      .join("");
  } catch (err) {
    console.error(err);
    recordsListEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

function renderChart(labels, data) {
  const ctx = document.getElementById("player-chart").getContext("2d");
  if (playerChart) playerChart.destroy();

  playerChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "タイム（秒）",
        data: data,
        borderColor: "#f0c430",
        backgroundColor: "rgba(240, 196, 48, 0.1)",
        borderWidth: 3,
        pointBackgroundColor: "#f0c430",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 5,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#e2e8f0" } } },
      scales: {
        x: { ticks: { color: "#9ca3af", maxRotation: 45 }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(255,255,255,0.05)" },
          reverse: true,
          title: { display: true, text: "タイム（秒）", color: "#9ca3af" },
        },
      },
    },
  });
}

// ===== タイム一括入力 =====
let batchPlayers = [];

window.showTimeInput = async function () {
  showScreen("time-input-screen");
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  document.getElementById("batch-date").value = dateStr;
  await loadBatchInputList();
};

async function loadBatchInputList() {
  const listEl = document.getElementById("batch-input-list");
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const data = await apiGet({ action: "getPlayers" });
    const players = (data.players || []).sort((a, b) => a.name.localeCompare(b.name, "ja"));

    if (players.length === 0) {
      listEl.innerHTML = '<div class="empty-message">選手が登録されていません</div>';
      return;
    }

    batchPlayers = players;
    listEl.innerHTML = players.map((p) => `
      <div class="batch-row-item">
        <span class="player-grade">${p.grade || ""}</span>
        <span class="player-name">${p.name}</span>
        <input type="number" step="0.01" min="0" placeholder="--"
               data-player-name="${p.name}" data-grade="${p.grade || ""}"
               oninput="this.classList.toggle('filled', this.value !== '')">
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

window.submitBatchTimes = async function () {
  const type = document.getElementById("batch-type").value;
  const dateVal = document.getElementById("batch-date").value;

  if (!dateVal) { showToast("日付を入力してください"); return; }

  const inputs = document.querySelectorAll("#batch-input-list input[data-player-name]");
  const entries = [];
  inputs.forEach((inp) => {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val > 0) {
      entries.push({ name: inp.dataset.playerName, grade: inp.dataset.grade, time: val });
    }
  });

  if (entries.length === 0) { showToast("タイムが入力されていません"); return; }

  try {
    showToast("保存中...");
    const result = await apiPost({ action: "addRecords" }, { type, date: dateVal, entries });
    if (result.error) throw new Error(result.error);
    showToast(`${result.count}件の記録を保存しました！`);
    inputs.forEach((inp) => { inp.value = ""; inp.classList.remove("filled"); });
  } catch (err) {
    console.error(err);
    showToast("エラーが発生しました");
  }
};

// ===== タイム修正 =====
window.showTimeEdit = async function () {
  showScreen("time-edit-screen");
  await loadPlayerListForEdit();
};

async function loadPlayerListForEdit() {
  const listEl = document.getElementById("player-list-edit");
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const data = await apiGet({ action: "getPlayers" });
    const players = (data.players || []).sort((a, b) => a.name.localeCompare(b.name, "ja"));

    if (players.length === 0) {
      listEl.innerHTML = '<div class="empty-message">選手が登録されていません</div>';
      return;
    }

    cachedEditPlayerList = players;
    listEl.innerHTML = players.map((p) => `
      <div class="player-item" data-pname="${p.name.replace(/"/g, '&quot;')}">
        <i class="lucide-user player-icon"></i>
        <span>${p.name}</span>
      </div>
    `).join("");
    listEl.querySelectorAll(".player-item").forEach((el) => {
      el.addEventListener("click", () => {
        window.openTimeEditDetail(el.dataset.pname);
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

window.openTimeEditDetail = async function (playerName) {
  currentEditPlayerName = playerName;
  currentEditType = "20m";
  document.getElementById("time-edit-player-name").textContent = playerName;
  showScreen("time-edit-detail-screen");

  await loadEditRecords(playerName, "20m");
};

window.switchEditTab = async function (type, tabEl) {
  currentEditType = type;
  document.querySelectorAll("#time-edit-detail-screen .tab").forEach((t) => t.classList.remove("active"));
  tabEl.classList.add("active");
  await loadEditRecords(currentEditPlayerName, type);
};

async function loadEditRecords(playerName, type) {
  const listEl = document.getElementById("edit-records-list");
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const data = await apiGet({ action: "getPlayerRecords", type: type, name: playerName });
    const history = data.history || [];

    if (history.length === 0) {
      listEl.innerHTML = '<div class="empty-message">この種目の記録はありません</div>';
      return;
    }

    listEl.innerHTML = history.slice().reverse().map((r) => `
      <div class="record-item editable" data-row="${data.row}" data-col="${r.col}" data-time="${r.time}" data-date="${r.date}">
        <div>
          <div class="record-time">${r.time.toFixed(2)}秒</div>
          <div class="record-date">${r.date}</div>
        </div>
        <div style="color: var(--gray); font-size: 13px;">修正 →</div>
      </div>
    `).join("");

    listEl.querySelectorAll(".record-item.editable").forEach((el) => {
      el.addEventListener("click", () => {
        currentEditRow = parseInt(el.dataset.row);
        currentEditCol = parseInt(el.dataset.col);
        document.getElementById("edit-time").value = el.dataset.time;
        document.getElementById("edit-record-modal").classList.add("active");
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

window.closeEditModal = function () {
  document.getElementById("edit-record-modal").classList.remove("active");
};

window.updateRecord = async function () {
  const newTime = parseFloat(document.getElementById("edit-time").value);
  if (isNaN(newTime) || newTime <= 0) { showToast("正しいタイムを入力してください"); return; }

  try {
    showToast("保存中...");
    await apiPost({ action: "updateRecord" }, {
      type: currentEditType,
      row: currentEditRow,
      col: currentEditCol,
      newTime: newTime,
    });
    closeEditModal();
    showToast("記録を修正しました！");
    await loadEditRecords(currentEditPlayerName, currentEditType);
  } catch (err) {
    console.error(err);
    showToast("エラーが発生しました");
  }
};

window.deleteRecord = async function () {
  if (!confirm("この記録を削除しますか？")) return;

  try {
    await apiPost({ action: "deleteRecord" }, {
      type: currentEditType,
      row: currentEditRow,
      col: currentEditCol,
    });
    closeEditModal();
    showToast("記録を削除しました");
    await loadEditRecords(currentEditPlayerName, currentEditType);
  } catch (err) {
    console.error(err);
    showToast("エラーが発生しました");
  }
};

// ===== 選手追加 =====
window.showAddPlayerModal = function () {
  document.getElementById("new-player-name").value = "";
  document.getElementById("add-player-modal").classList.add("active");
};

window.closeModal = function () {
  document.getElementById("add-player-modal").classList.remove("active");
};

window.addPlayer = async function () {
  const name = document.getElementById("new-player-name").value.trim();
  if (!name) { showToast("名前を入力してください"); return; }

  try {
    showToast("追加中...");
    await apiPost({ action: "addPlayer" }, { name: name, grade: "" });
    closeModal();
    showToast(`${name} を追加しました！`);
    await loadBatchInputList();
  } catch (err) {
    console.error(err);
    showToast("エラーが発生しました");
  }
};

// ===== 検索（ローマ字・ひらがな・漢字対応） =====
const NAME_READINGS = {
  "寺沢":"てらさわ","笹川":"ささがわ","山田":"やまだ","鳥居":"とりい","近衛":"このえ",
  "森":"もり","野尻":"のじり","綿貫":"わたぬき","沢登":"さわのぼり","加藤":"かとう",
  "牧野":"まきの","高橋":"たかはし","猪上":"いのうえ","藤間":"ふじま","斉藤":"さいとう",
  "ヘインズ":"へいんず","門平":"かどひら","谷澤":"たにざわ","木村":"きむら","藤林":"ふじばやし",
  "古田":"ふるた","白澤":"しらさわ","菅原":"すがわら","寺谷":"てらたに","西田":"にしだ",
  "山岸":"やまぎし","丸山":"まるやま","加納":"かのう","堀":"ほり","吉弘":"よしひろ",
  "宮部":"みやべ","岩貞":"いわさだ","中山":"なかやま","金井":"かない","入江":"いりえ",
  "江幡":"えばた","中尾":"なかお","山口":"やまぐち","河合":"かわい","川戸":"かわと",
  "佐久間":"さくま","有村":"ありむら","藤城":"ふじしろ","木山":"きやま","川島":"かわしま"
};

function romajiToHiragana(str) {
  const map = {
    sha:"しゃ",shi:"し",shu:"しゅ",sho:"しょ",chi:"ち",tsu:"つ",
    cha:"ちゃ",chu:"ちゅ",cho:"ちょ",
    kya:"きゃ",kyu:"きゅ",kyo:"きょ",nya:"にゃ",nyu:"にゅ",nyo:"にょ",
    hya:"ひゃ",hyu:"ひゅ",hyo:"ひょ",mya:"みゃ",myu:"みゅ",myo:"みょ",
    rya:"りゃ",ryu:"りゅ",ryo:"りょ",
    gya:"ぎゃ",gyu:"ぎゅ",gyo:"ぎょ",
    ja:"じゃ",ju:"じゅ",jo:"じょ",
    bya:"びゃ",byu:"びゅ",byo:"びょ",
    pya:"ぴゃ",pyu:"ぴゅ",pyo:"ぴょ",
    ka:"か",ki:"き",ku:"く",ke:"け",ko:"こ",
    sa:"さ",si:"し",su:"す",se:"せ",so:"そ",
    ta:"た",ti:"ち",tu:"つ",te:"て",to:"と",
    na:"な",ni:"に",nu:"ぬ",ne:"ね",no:"の",
    ha:"は",hi:"ひ",hu:"ふ",fu:"ふ",he:"へ",ho:"ほ",
    ma:"ま",mi:"み",mu:"む",me:"め",mo:"も",
    ya:"や",yu:"ゆ",yo:"よ",
    ra:"ら",ri:"り",ru:"る",re:"れ",ro:"ろ",
    wa:"わ",wi:"ゐ",we:"ゑ",wo:"を",
    ga:"が",gi:"ぎ",gu:"ぐ",ge:"げ",go:"ご",
    za:"ざ",zi:"じ",zu:"ず",ze:"ぜ",zo:"ぞ",
    da:"だ",di:"ぢ",du:"づ",de:"で",do:"ど",
    ba:"ば",bi:"び",bu:"ぶ",be:"べ",bo:"ぼ",
    pa:"ぱ",pi:"ぴ",pu:"ぷ",pe:"ぺ",po:"ぽ",
    nn:"ん",n:"ん",
    a:"あ",i:"い",u:"う",e:"え",o:"お"
  };
  let result = "";
  let s = str.toLowerCase();
  let idx = 0;
  while (idx < s.length) {
    let matched = false;
    for (let len = 3; len >= 1; len--) {
      const chunk = s.substring(idx, idx + len);
      if (map[chunk]) { result += map[chunk]; idx += len; matched = true; break; }
    }
    if (!matched) { result += s[idx]; idx++; }
  }
  return result;
}

function matchesSearch(name, searchText) {
  if (!searchText) return true;
  const lower = searchText.toLowerCase();
  if (name.includes(searchText)) return true;
  const reading = NAME_READINGS[name] || "";
  if (reading.includes(lower)) return true;
  if (reading.includes(searchText)) return true;
  const hiragana = romajiToHiragana(lower);
  if (reading.includes(hiragana)) return true;
  return false;
}

window.filterRanking = function () {
  const searchText = document.getElementById("ranking-search").value.trim();
  renderFilteredRanking("20m", searchText);
};

function nameSize(name) {
  const len = name.length;
  if (len <= 2) return "";
  if (len === 3) return 'style="font-size:0.9em"';
  if (len === 4) return 'style="font-size:0.78em"';
  return 'style="font-size:0.68em"';
}

function renderFilteredRanking(type, searchText) {
  const listEl = document.getElementById(`ranking-list-${type}`);
  let filtered = cachedRankingData[type].filter((item) => {
    if (currentGradeFilter !== "all" && item.grade !== currentGradeFilter) return false;
    return matchesSearch(item.playerName, searchText);
  });
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-message">該当なし</div>';
    return;
  }
  listEl.innerHTML = filtered.map((item, i) => `
    <div class="ranking-item rank-${i + 1}" onclick="showPlayerDetail('', '${item.playerName.replace(/'/g, "\\'")}')">
      <div class="rank-number">${i + 1}</div>
      <div class="rank-info"><div class="rank-name" ${nameSize(item.playerName)}>${item.playerName}</div></div>
      <div class="rank-time">${item.time.toFixed(2)}s</div>
    </div>`).join("");
}

// 一括入力検索フィルタ
window.filterBatchInput = function () {
  const searchText = document.getElementById("batch-search").value.trim();
  document.querySelectorAll("#batch-input-list .batch-row-item").forEach((row) => {
    const name = row.querySelector(".player-name").textContent;
    row.style.display = matchesSearch(name, searchText) ? "" : "none";
  });
};

// 修正画面検索フィルタ
window.filterEditList = function () {
  const searchText = document.getElementById("edit-search").value.trim();
  document.querySelectorAll("#player-list-edit .player-item").forEach((row) => {
    const name = row.querySelector("span").textContent;
    row.style.display = matchesSearch(name, searchText) ? "" : "none";
  });
};

// ===== パスワード管理 =====
window.showPasswordScreen = async function () {
  showScreen("password-screen");
  document.getElementById("password-status").textContent = "読み込み中...";
  try {
    const data = await apiGet({ action: "getPasswords" });
    document.getElementById("player-password").value = data.player_password || "";
    document.getElementById("password-status").textContent = "";
  } catch (err) {
    document.getElementById("password-status").textContent = "読み込みエラー";
  }
};

window.savePlayerPassword = async function () {
  const newPw = document.getElementById("player-password").value.trim();
  if (!newPw) { showToast("パスワードを入力してください"); return; }
  try {
    showToast("保存中...");
    await apiPost({ action: "setPassword" }, { key: "player_password", value: newPw });
    showToast("パスワードを「" + newPw + "」に変更しました！");
    showScreen("dashboard-screen");
  } catch (err) { showToast("エラーが発生しました"); }
};

window.saveAdminPassword = async function () {
  const newPw = document.getElementById("admin-password").value.trim();
  if (!newPw) { showToast("パスワードを入力してください"); return; }
  try {
    await apiPost({ action: "setPassword" }, { key: "admin_password", value: newPw });
    showToast("管理者パスワードを変更しました！");
  } catch (err) { showToast("エラーが発生しました"); }
};

// ===== ユーティリティ =====
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}
