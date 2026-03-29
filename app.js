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
}

// ===== ログイン =====
document.getElementById("login-btn").addEventListener("click", handleLogin);
document.getElementById("password-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleLogin();
});

function handleLogin() {
  const password = document.getElementById("password-input").value;
  const errorEl = document.getElementById("login-error");

  if (password === "tensei") {
    currentRole = "player";
    errorEl.textContent = "";
    setupDashboard();
  } else if (password === "appare") {
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
  currentRankingType = "20m";
  document.querySelectorAll("#ranking-screen .tab").forEach((t) => t.classList.remove("active"));
  document.querySelector("#ranking-screen .tab").classList.add("active");
  await loadRanking("20m");
};

window.switchRankingTab = async function (type, tabEl) {
  currentRankingType = type;
  document.querySelectorAll("#ranking-screen .tab").forEach((t) => t.classList.remove("active"));
  tabEl.classList.add("active");
  await loadRanking(type);
};

async function loadRanking(type) {
  const listEl = document.getElementById("ranking-list");
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
          time: data.time,
        };
      }
    });

    // ソート
    const sorted = Object.values(bestTimes).sort((a, b) => a.time - b.time);

    if (sorted.length === 0) {
      listEl.innerHTML = '<div class="empty-message">まだ記録がありません</div>';
      return;
    }

    listEl.innerHTML = sorted
      .map(
        (item, i) => `
      <div class="ranking-item rank-${i + 1}" onclick="showPlayerDetail('${item.playerId}', '${item.playerName}')">
        <div class="rank-number">${i + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${item.playerName}</div>
        </div>
        <div class="rank-time">${item.time.toFixed(2)}秒</div>
      </div>
    `
      )
      .join("");
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

  document.getElementById("player-detail-name").textContent = `📊 ${playerName}`;
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

// ===== タイム入力 =====
window.showTimeInput = async function () {
  showScreen("time-input-screen");
  await loadPlayerListForInput();
};

async function loadPlayerListForInput() {
  const listEl = document.getElementById("player-list-input");
  listEl.innerHTML = '<div class="empty-message">読み込み中...</div>';

  try {
    const playersRef = collection(db, "players");
    const snapshot = await getDocs(query(playersRef, orderBy("name")));

    if (snapshot.empty) {
      listEl.innerHTML = '<div class="empty-message">選手が登録されていません。右上の「+ 選手追加」から追加してください</div>';
      return;
    }

    let html = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      html += `
        <div class="player-item" onclick="openTimeInputForm('${docSnap.id}', '${data.name}')">
          <span class="player-icon">🏃</span>
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

window.openTimeInputForm = function (playerId, playerName) {
  currentDetailPlayerId = playerId;
  document.getElementById("time-input-player-name").textContent = `⏱️ ${playerName}`;
  document.getElementById("input-time").value = "";
  document.getElementById("input-type").value = "20m";

  // 現在日時をセット
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  document.getElementById("input-date").value = local.toISOString().slice(0, 16);

  showScreen("time-input-form-screen");

  // 選手名を保存
  window._currentInputPlayerName = playerName;
};

window.submitTime = async function () {
  const type = document.getElementById("input-type").value;
  const timeVal = parseFloat(document.getElementById("input-time").value);
  const dateVal = document.getElementById("input-date").value;

  if (isNaN(timeVal) || timeVal <= 0) {
    showToast("正しいタイムを入力してください");
    return;
  }

  if (!dateVal) {
    showToast("日時を入力してください");
    return;
  }

  try {
    await addDoc(collection(db, "records"), {
      playerId: currentDetailPlayerId,
      playerName: window._currentInputPlayerName,
      type: type,
      time: timeVal,
      date: Timestamp.fromDate(new Date(dateVal)),
    });

    showToast("記録を保存しました！");
    goBack("time-input");
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
          <span class="player-icon">✏️</span>
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
  document.getElementById("time-edit-player-name").textContent = `✏️ ${playerName}`;
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
      where("type", "==", type),
      orderBy("date", "desc")
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      listEl.innerHTML = '<div class="empty-message">この種目の記録はありません</div>';
      return;
    }

    let html = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const dateObj = data.date.toDate();
      html += `
        <div class="record-item editable" onclick="openEditRecordModal('${docSnap.id}', ${data.time}, '${dateObj.toISOString()}')">
          <div>
            <div class="record-time">${data.time.toFixed(2)}秒</div>
            <div class="record-date">${formatDateTime(dateObj)}</div>
          </div>
          <div style="color: var(--gray); font-size: 14px;">タップして修正 →</div>
        </div>
      `;
    });
    listEl.innerHTML = html;
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
    await loadPlayerListForInput();
  } catch (err) {
    console.error(err);
    showToast("エラーが発生しました");
  }
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
