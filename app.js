// ===== Firebase 設定 =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBk0uTKS4SKhNCrEWIXoVjlvZxz8o-1iUd0",
  authDomain: "keio-soccer-ranking.firebaseapp.com",
  projectId: "keio-soccer-ranking",
  storageBucket: "keio-soccer-ranking.firebasestorage.app",
  messagingSenderId: "732530575844",
  appId: "1:732530575844:web:668dabc5d2a06824989ff1",
  measurementId: "G-B96VM9VFN0",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== グローバル変数 =====
let currentRole = null; // "player" or "admin"
let currentGradeFilter = "all";
let currentRankingType = "20m";
let currentDetailPlayerId = null;
let currentDetailPlayerName = null;
let currentDetailType = "20m";
let currentEditPlayerId = null;
let currentEditPlayerName = null;
let currentEditType = "20m";
let currentEditRecordId = null;
let playerChart = null;

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

function handleLogin() {
  const password = document.getElementById("password-input").value;
  const errorEl = document.getElementById("login-error");

  if (password === "Tensei") {
    currentRole = "player";
    errorEl.textContent = "";
    setupDashboard();
  } else if (password === "Appare") {
    currentRole = "admin";
    errorEl.textContent = "";
    setupDashboard();
  } else {
    errorEl.textContent = "パスワードが正しくありません";
    document.getElementById("password-input").value = "";
  }
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
  if (screenId === "dashboard") {
    showScreen("dashboard-screen");
  } else if (screenId === "ranking") {
    showScreen("ranking-screen");
  } else if (screenId === "time-input") {
    showScreen("time-input-screen");
  } else if (screenId === "time-edit") {
    showScreen("time-edit-screen");
  }
};

// ===== ランキング表示 =====
window.showRanking = async function () {
  showScreen("ranking-screen");
  currentGradeFilter = "all";
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(".filter-btn").classList.add("active");
  await Promise.all([loadRanking("20m"), loadRanking("30m")]);
};

// フィルター処理
async function applyGradeFilter(grade, btnEl) {
  currentGradeFilter = grade;
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  btnEl.classList.add("active");
  // キャッシュがあればフィルターだけ再適用、なければデータ取得
  if (cachedRankingData["20m"].length > 0 || cachedRankingData["30m"].length > 0) {
    const searchText = document.getElementById("ranking-search") ? document.getElementById("ranking-search").value.trim() : "";
    renderFilteredRanking("20m", searchText);
    renderFilteredRanking("30m", searchText);
  } else {
    await Promise.all([loadRanking("20m"), loadRanking("30m")]);
  }
}

// onclick用（後方互換）
window.filterGrade = function (grade, btnEl) {
  applyGradeFilter(grade, btnEl);
};

// data-grade用（addEventListener）
document.querySelectorAll(".filter-btn[data-grade]").forEach((btn) => {
  btn.addEventListener("click", function () {
    applyGradeFilter(this.dataset.grade, this);
  });
});

async function loadRanking(type) {
  const listEl = document.getElementById(`ranking-list-${type}`);
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const recordsRef = collection(db, "records");
    const q = query(recordsRef, where("type", "==", type));
    const snapshot = await getDocs(q);

    // 選手ごとのベストタイムを計算
    const bestTimes = {};
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const pid = data.playerId;
      if (!bestTimes[pid] || data.time < bestTimes[pid].time) {
        bestTimes[pid] = {
          playerId: pid,
          playerName: data.playerName,
          grade: data.grade || "",
          time: data.time,
        };
      }
    });

    // ソートしてキャッシュ
    let sorted = Object.values(bestTimes);
    sorted.sort((a, b) => a.time - b.time);
    cachedRankingData[type] = sorted;

    // フィルター適用して描画
    const searchText = document.getElementById("ranking-search") ? document.getElementById("ranking-search").value.trim() : "";
    renderFilteredRanking(type, searchText);
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

// ===== 選手詳細（グラフ） =====
window.showPlayerDetail = async function (playerId, playerName) {
  currentDetailPlayerId = playerId;
  currentDetailPlayerName = playerName;
  currentDetailType = "20m";

  document.getElementById("player-detail-name").textContent = playerName;
  showScreen("player-detail-screen");

  document.querySelectorAll("#player-detail-screen .tab").forEach((t) => t.classList.remove("active"));
  document.querySelector("#player-detail-screen .tab").classList.add("active");

  await loadPlayerDetail(playerId, "20m");
};

window.switchDetailTab = async function (type, tabEl) {
  currentDetailType = type;
  document.querySelectorAll("#player-detail-screen .tab").forEach((t) => t.classList.remove("active"));
  tabEl.classList.add("active");
  await loadPlayerDetail(currentDetailPlayerId, type);
};

async function loadPlayerDetail(playerId, type) {
  const recordsListEl = document.getElementById("player-records-list");
  recordsListEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const recordsRef = collection(db, "records");
    const q = query(
      recordsRef,
      where("playerId", "==", playerId),
      where("type", "==", type),
      orderBy("date", "asc")
    );
    const snapshot = await getDocs(q);

    const records = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({
        id: docSnap.id,
        ...data,
        dateObj: data.date.toDate(),
      });
    });

    if (records.length === 0) {
      recordsListEl.innerHTML = '<div class="empty-message">この種目の記録はありません</div>';
      renderChart([], []);
      return;
    }

    // グラフ描画
    const labels = records.map((r) => formatDate(r.dateObj));
    const data = records.map((r) => r.time);
    renderChart(labels, data);

    // 記録一覧
    recordsListEl.innerHTML = records
      .slice()
      .reverse()
      .map(
        (r) => `
      <div class="record-item">
        <div>
          <div class="record-time">${r.time.toFixed(2)}秒</div>
          <div class="record-date">${formatDateTime(r.dateObj)}</div>
        </div>
      </div>
    `
      )
      .join("");
  } catch (err) {
    console.error(err);
    recordsListEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

function renderChart(labels, data) {
  const ctx = document.getElementById("player-chart").getContext("2d");

  if (playerChart) {
    playerChart.destroy();
  }

  playerChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
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
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#e2e8f0" },
        },
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxRotation: 45 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(255,255,255,0.05)" },
          reverse: true,
          title: {
            display: true,
            text: "タイム（秒）",
            color: "#9ca3af",
          },
        },
      },
    },
  });
}

// ===== タイム一括入力 =====
let batchPlayers = []; // [{id, name, grade}]

window.showTimeInput = async function () {
  showScreen("time-input-screen");
  // Set today's date
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  document.getElementById("batch-date").value = dateStr;
  await loadBatchInputList();
};

async function loadBatchInputList() {
  const listEl = document.getElementById("batch-input-list");
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const playersRef = collection(db, "players");
    const snapshot = await getDocs(query(playersRef, orderBy("name")));

    if (snapshot.empty) {
      listEl.innerHTML = '<div class="empty-message">選手が登録されていません</div>';
      return;
    }

    batchPlayers = [];
    let html = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      batchPlayers.push({ id: docSnap.id, name: data.name, grade: data.grade || "" });
      html += `
        <div class="batch-row-item">
          <span class="player-grade">${data.grade || ""}</span>
          <span class="player-name">${data.name}</span>
          <input type="number" step="0.01" min="0" placeholder="--"
                 data-player-id="${docSnap.id}" data-player-name="${data.name}" data-grade="${data.grade || ""}"
                 oninput="this.classList.toggle('filled', this.value !== '')">
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

window.submitBatchTimes = async function () {
  const type = document.getElementById("batch-type").value;
  const dateVal = document.getElementById("batch-date").value;

  if (!dateVal) {
    showToast("日付を入力してください");
    return;
  }

  const inputs = document.querySelectorAll("#batch-input-list input[data-player-id]");
  const records = [];
  inputs.forEach((inp) => {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val > 0) {
      records.push({
        playerId: inp.dataset.playerId,
        playerName: inp.dataset.playerName,
        grade: inp.dataset.grade,
        type: type,
        time: val,
        date: Timestamp.fromDate(new Date(dateVal + "T10:00:00")),
      });
    }
  });

  if (records.length === 0) {
    showToast("タイムが入力されていません");
    return;
  }

  try {
    const promises = records.map((r) => addDoc(collection(db, "records"), r));
    await Promise.all(promises);
    showToast(`${records.length}件の記録を保存しました！`);
    // Clear inputs
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
    const playersRef = collection(db, "players");
    const snapshot = await getDocs(query(playersRef, orderBy("name")));

    if (snapshot.empty) {
      listEl.innerHTML = '<div class="empty-message">選手が登録されていません</div>';
      return;
    }

    let html = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      html += `
        <div class="player-item" onclick="openTimeEditDetail('${docSnap.id}', '${data.name}')">
          <i class="lucide-user player-icon"></i>
          <span>${data.name}</span>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

window.openTimeEditDetail = async function (playerId, playerName) {
  currentEditPlayerId = playerId;
  currentEditPlayerName = playerName;
  currentEditType = "20m";
  document.getElementById("time-edit-player-name").textContent = playerName;
  showScreen("time-edit-detail-screen");

  document.querySelectorAll("#time-edit-detail-screen .tab").forEach((t) => t.classList.remove("active"));
  document.querySelector("#time-edit-detail-screen .tab").classList.add("active");

  await loadEditRecords(playerId, "20m");
};

window.switchEditTab = async function (type, tabEl) {
  currentEditType = type;
  document.querySelectorAll("#time-edit-detail-screen .tab").forEach((t) => t.classList.remove("active"));
  tabEl.classList.add("active");
  await loadEditRecords(currentEditPlayerId, type);
};

async function loadEditRecords(playerId, type) {
  const listEl = document.getElementById("edit-records-list");
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const recordsRef = collection(db, "records");
    const q = query(
      recordsRef,
      where("playerId", "==", playerId),
      where("type", "==", type)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      listEl.innerHTML = '<div class="empty-message">この種目の記録はありません</div>';
      return;
    }

    // クライアント側でソート（インデックス不要）
    const records = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({ id: docSnap.id, ...data, dateObj: data.date.toDate() });
    });
    records.sort((a, b) => b.dateObj - a.dateObj);

    listEl.innerHTML = records.map((r) => `
      <div class="record-item editable" onclick="openEditRecordModal('${r.id}', ${r.time}, '${r.dateObj.toISOString()}')">
        <div>
          <div class="record-time">${r.time.toFixed(2)}秒</div>
          <div class="record-date">${formatDateTime(r.dateObj)}</div>
        </div>
        <div style="color: var(--gray); font-size: 13px;">修正 →</div>
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-message">エラーが発生しました</div>';
  }
}

window.openEditRecordModal = function (recordId, time, dateISO) {
  currentEditRecordId = recordId;
  document.getElementById("edit-time").value = time;

  const d = new Date(dateISO);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  document.getElementById("edit-date").value = local.toISOString().slice(0, 16);

  document.getElementById("edit-record-modal").classList.add("active");
};

window.closeEditModal = function () {
  document.getElementById("edit-record-modal").classList.remove("active");
};

window.updateRecord = async function () {
  const newTime = parseFloat(document.getElementById("edit-time").value);
  const newDate = document.getElementById("edit-date").value;

  if (isNaN(newTime) || newTime <= 0) {
    showToast("正しいタイムを入力してください");
    return;
  }

  try {
    const recordRef = doc(db, "records", currentEditRecordId);
    await updateDoc(recordRef, {
      time: newTime,
      date: Timestamp.fromDate(new Date(newDate)),
    });

    closeEditModal();
    showToast("記録を修正しました！");
    await loadEditRecords(currentEditPlayerId, currentEditType);
  } catch (err) {
    console.error(err);
    showToast("エラーが発生しました");
  }
};

window.deleteRecord = async function () {
  if (!confirm("この記録を削除しますか？この操作は取り消せません。")) return;

  try {
    await deleteDoc(doc(db, "records", currentEditRecordId));
    closeEditModal();
    showToast("記録を削除しました");
    await loadEditRecords(currentEditPlayerId, currentEditType);
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
  if (!name) {
    showToast("名前を入力してください");
    return;
  }

  try {
    await addDoc(collection(db, "players"), { name: name });
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

// ローマ字→ひらがな変換
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
    // try 3-char, 2-char, 1-char
    let matched = false;
    for (let len = 3; len >= 1; len--) {
      const chunk = s.substring(idx, idx + len);
      if (map[chunk]) {
        result += map[chunk];
        idx += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result += s[idx];
      idx++;
    }
  }
  return result;
}

function matchesSearch(name, searchText) {
  if (!searchText) return true;
  const lower = searchText.toLowerCase();
  // 漢字・カタカナそのまま
  if (name.includes(searchText)) return true;
  // ひらがな読み
  const reading = NAME_READINGS[name] || "";
  if (reading.includes(lower)) return true;
  if (reading.includes(searchText)) return true;
  // ローマ字→ひらがな変換して照合
  const hiragana = romajiToHiragana(lower);
  if (reading.includes(hiragana)) return true;
  return false;
}

// ランキング検索フィルタ
let cachedRankingData = { "20m": [], "30m": [] };

window.filterRanking = function () {
  const searchText = document.getElementById("ranking-search").value.trim();
  renderFilteredRanking("20m", searchText);
  renderFilteredRanking("30m", searchText);
};

function nameSize(name) {
  const len = name.length;
  if (len <= 2) return "";
  if (len === 3) return "style=\"font-size:0.85em\"";
  return "style=\"font-size:0.7em\"";
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
    <div class="ranking-item rank-${i + 1}" onclick="showPlayerDetail('${item.playerId}', '${item.playerName}')">
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
    const name = row.querySelector("span:last-child").textContent;
    row.style.display = matchesSearch(name, searchText) ? "" : "none";
  });
};

// ===== ユーティリティ =====
function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}
