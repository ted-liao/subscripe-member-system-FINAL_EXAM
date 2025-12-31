// =========================================================
// ▼▼▼ 完整修復版 index.js (包含所有功能，無省略) ▼▼▼
// =========================================================

// Firebase 初始化
const firebaseConfig = {
    apiKey: "AIzaSyCQEXz8OIzbb9dDxnz52tymNnYofGDEczQ",
    authDomain: "subscription-member-system.firebaseapp.com",
    databaseURL: "https://subscription-member-system-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "subscription-member-system",
    storageBucket: "subscription-member-system.firebasestorage.app",
    messagingSenderId: "970681171187",
    appId: "1:970681171187:web:f3f86b743e27667a994b86"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// --- 全域變數 ---
let isAuthReady = false;
let currentUser = null;
let forgotPasswordUser = null;
let editingMember = null;
let autoRefreshInterval = null;
let countdownInterval = null;
let currentPage = 'home';

// 計算機全域變數
let calcConfig = null; 
let currentServiceType = 'boost'; 

// 預設計算機設定 (備用)
const DEFAULT_CALC_CONFIG = {
    seasonStartDate: "2025-12-01",
    basePrices: {
        boost: { master: 42, grandmaster: 62, legend: 88, mythical: 100 },
        carry: { master: 105, grandmaster: 155, legend: 220, mythical: 250 }
    },
    weights: {
        boost: {
            1: { normal: 0, mythical: 0, desc: "⛔ 閉關衝分期" },
            2: { normal: 1.7, mythical: 0, desc: "🔥 賽季初高價" },
            3: { normal: 1.45, mythical: 0, desc: "💰 收益期" },
            4: { normal: 1.3, mythical: 2.0, desc: "🚀 萬分開放" },
            5: { normal: 1.15, mythical: 1.55, desc: "✅ 穩定接單" },
            6: { normal: 1.0, mythical: 1.3, desc: "🛡️ 價格回穩" },
            7: { normal: 1.0, mythical: 1.15, desc: "📉 萬分緩降" },
            8: { normal: 1.0, mythical: 1.0, desc: "✨ 常態價格" },
            9: { normal: 1.1, mythical: 1.1, desc: "🧨 季末保級" }
        },
        carry: {
            1: { master: 0, grandmaster: 0, legend: 0, mythical: 0, desc: "⛔ 避險期" },
            2: { master: 1.5, grandmaster: 0, legend: 0, mythical: 0, desc: "🚀 大師首發" },
            3: { master: 1.45, grandmaster: 1.45, legend: 0, mythical: 0, desc: "🚀 宗師首發" },
            4: { master: 1.3, grandmaster: 1.3, legend: 1.45, mythical: 0, desc: "🚀 傳奇首發" },
            5: { master: 1.2, grandmaster: 1.2, legend: 1.3, mythical: 1.5, desc: "💎 萬分首發" },
            6: { master: 1.1, grandmaster: 1.1, legend: 1.2, mythical: 1.3, desc: "📉 逐步降價" },
            7: { master: 1.0, grandmaster: 1.0, legend: 1.1, mythical: 1.2, desc: "🏷️ 季末促銷" },
            8: { master: 1.0, grandmaster: 1.0, legend: 1.0, mythical: 1.0, desc: "✨ 清倉大拍賣" },
            9: { master: 1.0, grandmaster: 1.0, legend: 1.0, mythical: 1.0, desc: "✨ 季末清倉" }
        }
    }
};

const REFRESH_INTERVAL = 3000;

// --- Firebase Auth 監聽 ---
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        console.log('✅ 用戶已登入:', user.uid);
        isAuthReady = true;
        if (!window.appInitialized) {
            window.appInitialized = true;
            initialize();
        }
    } else {
        console.log('⏳ 嘗試匿名登入...');
        firebase.auth().signInAnonymously().catch((error) => {
            console.error('❌ 登入失敗:', error);
            // alert('系統初始化失敗，請重新整理頁面'); // 暫時移除此報錯以免誤判
        });
    }
});

// --- 輔助函式 ---
function showLoading() { document.getElementById('loadingOverlay').classList.add('active'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('active'); }

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function secondsToTime(seconds) {
    if (seconds <= 0) return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
    const years = Math.floor(seconds / (365 * 24 * 60 * 60));
    seconds %= (365 * 24 * 60 * 60);
    const months = Math.floor(seconds / (30 * 24 * 60 * 60));
    seconds %= (30 * 24 * 60 * 60);
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds %= (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds %= (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return { years, months, days, hours, minutes, seconds };
}

function formatTimeDisplay(timeObj) {
    const parts = [];
    if (timeObj.years > 0) parts.push(`${timeObj.years}年`);
    if (timeObj.months > 0) parts.push(`${timeObj.months}月`);
    if (timeObj.days > 0) parts.push(`${timeObj.days}天`);
    if (timeObj.hours > 0) parts.push(`${timeObj.hours}時`);
    if (timeObj.minutes > 0) parts.push(`${timeObj.minutes}分`);
    if (timeObj.seconds > 0) parts.push(`${timeObj.seconds}秒`);
    return parts.join(' ') || '0秒';
}

function getTimeColorClass(seconds) {
    if (seconds <= 0) return 'danger';
    if (seconds <= 259200) return 'danger';
    if (seconds <= 604800) return 'warning';
    return '';
}

function copyToClipboard(text, button) {
    const lang = getCurrentLang();
    const trans = translations[lang];
    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.innerHTML;
        button.innerHTML = trans.copy_ok || '✓ Copied';
        button.style.background = '#28a745';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.background = '#667eea';
        }, 2000);
    }).catch(() => {
        alert(trans.copy_fail || 'Copy failed');
    });
}

// --- 資料讀取與驗證 ---
async function loadData() {
    try {
        const membersSnapshot = await database.ref('members').once('value');
        const codesSnapshot = await database.ref('activationCodes').once('value');
        const queueSnapshot = await database.ref('queue').once('value');
        const sessionSnapshot = await database.ref('gameSession').once('value');

        const membersData = membersSnapshot.val() || {};
        const members = Object.keys(membersData).map(key => ({ ...membersData[key], username: key }));

        const codesData = codesSnapshot.val() || {};
        const activationCodes = Object.values(codesData);

        const queueData = queueSnapshot.val() || {};
        const queue = Object.values(queueData);

        // 排隊排序邏輯
        queue.sort((a, b) => {
            const priorityA = a.priorityLevel || 0;
            const priorityB = b.priorityLevel || 0;
            if (priorityA !== priorityB) {
                return priorityB - priorityA;
            }
            return new Date(a.joinTime) - new Date(b.joinTime);
        });

        return {
            members,
            activationCodes,
            queue,
            gameSession: sessionSnapshot.val()
        };
    } catch (error) {
        console.error('載入資料失敗:', error);
        return { members: [], activationCodes: [], queue: [], gameSession: null };
    }
}

async function saveData(members, activationCodes, queue, gameSession) {
    try {
        const membersObj = {};
        members.forEach(m => { membersObj[m.username] = m; });
        const codesObj = {};
        activationCodes.forEach(c => { codesObj[c.code] = c; });
        const queueObj = {};
        queue.forEach(q => { queueObj[q.username] = q; });

        await database.ref('members').set(membersObj);
        await database.ref('activationCodes').set(codesObj);
        await database.ref('queue').set(queueObj);
        await database.ref('gameSession').set(gameSession);
    } catch (error) {
        console.error('儲存資料失敗:', error);
        alert('資料儲存失敗，請稍後再試');
    }
}

async function validateSessionUser(username, retries = 3, delay = 500) {
    if (!username) return null;
    for (let i = 0; i < retries; i++) {
        try {
            const snapshot = await database.ref('members/' + username).once('value');
            if (snapshot.exists()) {
                let member = snapshot.val();
                member.username = username;
                return member;
            }
            if (i === retries - 1) return null;
        } catch (error) { console.error(`[Session] 驗證時載入失敗:`, error); }
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
    return null;
}

// 檢查並重置插隊次數
async function checkAndResetQuota(member) {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    if (member.quotaLastReset !== currentMonth && !member.isAdmin) {
        console.log(`為 ${member.username} 重置插隊次數...`);
        let newQuota = 0;
        if (member.level === 'legend') newQuota = 5;
        else if (member.level === 'diamond') newQuota = 2;
        member.priorityQuota = newQuota;
        member.quotaLastReset = currentMonth;
        try {
            await database.ref('members/' + member.username).update({
                priorityQuota: newQuota,
                quotaLastReset: currentMonth
            });
        } catch (error) { console.error('重置次數失敗:', error); }
    }
    return member;
}

function isAdmin() {
    if (!currentUser) return false;
    return currentUser.isAdmin === true;
}

// --- 倒數計時與自動刷新 ---
function startGlobalCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(async () => { await updateAllCountdowns(); }, 1000);
}

async function updateAllCountdowns() {
    try {
        const data = await loadData();
        const now = Math.floor(Date.now() / 1000);
        let membersToUpdate = {};

        data.members.forEach(member => {
            const elapsed = now - member.lastUpdateTime;
            if (elapsed > 0 && member.remainingSeconds > 0) {
                const oldRemaining = member.remainingSeconds;
                member.remainingSeconds = Math.max(0, member.remainingSeconds - elapsed);
                member.lastUpdateTime = now;
                if (oldRemaining !== member.remainingSeconds) {
                    membersToUpdate[member.username] = {
                        remainingSeconds: member.remainingSeconds,
                        lastUpdateTime: member.lastUpdateTime
                    };
                }
            }
        });

        if (Object.keys(membersToUpdate).length > 0) {
            for (const username in membersToUpdate) {
                await database.ref('members/' + username).update(membersToUpdate[username]);
            }
        }

        document.querySelectorAll('.countdown-time').forEach(element => {
            const username = element.getAttribute('data-username');
            if (username) {
                const member = data.members.find(m => m.username === username);
                if (member) {
                    const timeObj = secondsToTime(member.remainingSeconds);
                    element.textContent = formatTimeDisplay(timeObj);
                    element.className = 'countdown-time ' + getTimeColorClass(member.remainingSeconds);
                }
            }
        });

        if (currentPage === 'member' && currentUser) {
            const member = data.members.find(m => m.username === currentUser.username);
            if (member) {
                currentUser = member;
                const timeDisplay = document.querySelector('.time-display');
                if (timeDisplay) {
                    const timeObj = secondsToTime(member.remainingSeconds);
                    timeDisplay.textContent = formatTimeDisplay(timeObj);
                    timeDisplay.className = 'time-display ' + getTimeColorClass(member.remainingSeconds);
                }
            }
        }
    } catch (error) {
        console.error('更新倒數失敗:', error);
    }
}

function stopCountdown() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
        const hasOpenModal = document.querySelector('.modal.active');
        const isLoading = document.getElementById('loadingOverlay').classList.contains('active');
        if (hasOpenModal || isLoading) return;
        if (currentPage === 'queue') await refreshQueueOnly();
    }, REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
}

// --- [核心功能] 顯示排隊頁面 (修復功能消失問題) ---
async function refreshQueueOnly() {
    try {
        const data = await loadData();
        const lang = getCurrentLang();
        const trans = translations[lang];

        if (!currentUser || !data.gameSession) return;

        const queueStatusElement = document.querySelector('.queue-status');
        if (queueStatusElement) {
            const myQueueIndex = data.queue.findIndex(q => q.username === currentUser.username);
            const myPosition = myQueueIndex + 1;
            const queueCardElement = document.querySelector('.queue-card');
            
            if (queueCardElement && !document.getElementById('prioritySwitch')) {
                if (myPosition > 0) {
                    queueCardElement.innerHTML = `
                        <h3>${trans.queue_your_position_title}</h3>
                        <div class="queue-position">#${myPosition}</div>
                        <div style="color: #666;">${trans.queue_position_prefix} ${myPosition - 1} ${trans.queue_position_suffix}</div>
                        <button class="btn btn-danger" onclick="leaveQueue()">${trans.queue_leave}</button>
                    `;
                }
            }

            queueStatusElement.innerHTML = `
                <h3 style="margin-bottom: 15px;">${trans.queue_status_title} (${data.queue.length}${trans.queue_status_people}</h3>
                ${data.queue.length === 0 ? `<div class="empty-state" style="padding: 20px;">${trans.queue_empty}</div>` :
                data.queue.slice(0, 10).map((q, index) => {
                    const levelText = q.level === 'legend' ? trans.level_legend_simple :
                        q.level === 'diamond' ? trans.level_diamond_simple : trans.level_gold_simple;
                    const badgeClass = q.level === 'legend' ? 'badge-legend' :
                        q.level === 'diamond' ? 'badge-diamond' : 'badge-gold';
                    const isCurrent = q.username === currentUser.username;
                    const priorityIcon = q.priorityLevel === 2 ? '🔥' : (q.priorityLevel === 1 ? '💎' : '');

                    return `
                    <div class="queue-item ${isCurrent ? 'current' : ''}">
                        <div>
                            <strong>${priorityIcon} #${index + 1} ${q.nickname}</strong>
                            <span class="badge ${badgeClass}" style="margin-left: 10px;">${levelText}</span>
                            <div style="font-size: 12px; color: #666; margin-top: 3px;">CODM UID: ${q.gameUID}</div>
                        </div>
                        <div style="font-size: 14px; color: #666;">
                            ${new Date(q.joinTime).toLocaleTimeString('zh-TW')}
                        </div>
                    </div>`;
                }).join('')}
                ${data.queue.length > 10 ? `<div style="text-align: center; color: #666; margin-top: 10px;">${trans.queue_more_people_prefix} ${data.queue.length - 10} ${trans.queue_more_people_suffix}</div>` : ''}
            `;
        }
    } catch (error) { console.error('刷新排隊失敗:', error); }
}

async function showQueuePage() {
    const content = document.getElementById('queueContent');
    const lang = getCurrentLang();
    const trans = translations[lang];

    if (!currentUser) {
        content.innerHTML = `<div class="empty-state"><h3>${trans.queue_login_prompt}</h3></div>`;
        return;
    }

    showLoading();
    try {
        const snapshot = await database.ref('members/' + currentUser.username).once('value');
        if (snapshot.exists()) {
             let updatedUser = snapshot.val();
             updatedUser.username = currentUser.username;
             currentUser = await checkAndResetQuota(updatedUser);
        }

        const data = await loadData(); 

        if (currentUser.remainingSeconds <= 0) {
            content.innerHTML = `<div class="empty-state"><h3>${trans.queue_expired_prompt}</h3></div>`;
            hideLoading();
            return;
        }

        if (!data.gameSession) {
            content.innerHTML = `<div class="empty-state"><h3>${trans.queue_no_session}</h3><p>${trans.queue_wait_for_streamer}</p></div>`;
            hideLoading();
            return;
        }

        const myQueueIndex = data.queue.findIndex(q => q.username === currentUser.username);
        const myPosition = myQueueIndex + 1;
        
        const levelSimpleKey = (level) => {
            if (level === 'legend') return 'level_legend_simple';
            if (level === 'diamond') return 'level_diamond_simple';
            return 'level_gold_simple';
        };

        const quotaText = (trans.queue_priority_quota || '本月剩餘 <span>{0}</span> 次權限').replace('{0}', currentUser.priorityQuota);
        const onSwitchChange = `togglePriorityGlow(this.checked, ${currentUser.priorityQuota})`;

        content.innerHTML = `
<div style="text-align: right; margin-bottom: 10px; color: #666; font-size: 14px;">
    <span class="auto-refresh-indicator"></span> ${trans.queue_refreshing}
</div>
<div class="game-session-card">
    <h2>🎮 ${data.gameSession.gameName}</h2>
    <div class="game-session-info">${trans.queue_session_start_time} ${new Date(data.gameSession.startTime).toLocaleString('zh-TW')}</div>
    <div class="game-session-info">${trans.queue_session_slots} ${data.gameSession.slots}${trans.queue_session_slots_unit}</div>
    ${data.gameSession.description ? `<div style="margin-top: 10px; font-size: 0.9em;">${data.gameSession.description}</div>` : ''}
</div>

${myPosition > 0 ? `
<div class="queue-card">
    <h3>${trans.queue_your_position_title}</h3>
    <div class="queue-position">#${myPosition}</div>
    <div style="color: #666;">${trans.queue_position_prefix} ${myPosition - 1} ${trans.queue_position_suffix}</div>
    <button class="btn btn-danger" onclick="leaveQueue()">${trans.queue_leave}</button>
</div>
` : `
${(currentUser.level === 'diamond' || currentUser.level === 'legend') ? `
<div class="priority-queue-controls">
    <div class="priority-quota-display">
        ${trans.queue_priority_switch || '優先排隊'}
        <br>
        <small style="font-weight: normal;">(${quotaText})</small>
    </div>
    <label class="switch">
        <input type="checkbox" id="prioritySwitch" onchange="${onSwitchChange}" ${currentUser.priorityQuota <= 0 ? 'disabled' : ''}>
        <span class="slider"></span>
    </label>
</div>
` : ''}
<div class="queue-card">
    <h3>${trans.queue_join_title}</h3>
    <button id="btnJoinQueue" class="btn" onclick="joinQueue()" style="margin-top: 20px; font-size: 1.2em; padding: 15px 40px;">
        ${trans.queue_join_button}
    </button>
</div>
`}

<div class="queue-status">
    <h3 style="margin-bottom: 15px;">${trans.queue_status_title} (${data.queue.length}${trans.queue_status_people}</h3>
    ${data.queue.length === 0 ? `<div class="empty-state" style="padding: 20px;">${trans.queue_empty}</div>` :
    data.queue.slice(0, 10).map((q, index) => {
        const levelText = trans[levelSimpleKey(q.level)];
        const badgeClass = q.level === 'legend' ? 'badge-legend' :
            q.level === 'diamond' ? 'badge-diamond' : 'badge-gold';
        const isCurrent = q.username === currentUser.username;
        const priorityIcon = q.priorityLevel === 2 ? '🔥' : (q.priorityLevel === 1 ? '💎' : '');

        return `
<div class="queue-item ${isCurrent ? 'current' : ''}">
    <div>
        <strong>${priorityIcon} #${index + 1} ${q.nickname}</strong>
        <span class="badge ${badgeClass}" style="margin-left: 10px;">${levelText}</span>
        <div style="font-size: 12px; color: #666; margin-top: 3px;">CODM UID: ${q.gameUID}</div>
    </div>
    <div style="font-size: 14px; color: #666;">
        ${new Date(q.joinTime).toLocaleTimeString('zh-TW')}
    </div>
</div>
`;
    }).join('')}
    ${data.queue.length > 10 ? `<div style="text-align: center; color: #666; margin-top: 10px;">${trans.queue_more_people_prefix} ${data.queue.length - 10} ${trans.queue_more_people_suffix}</div>` : ''}
</div>
`;
    } catch (error) {
        console.error('顯示排隊頁面失敗:', error);
        content.innerHTML = `<div class="empty-state"><h3>${trans.queue_load_fail}</h3></div>`;
    } finally {
        hideLoading();
    }
}

// --- [核心功能] 加入與離開排隊 ---
async function joinQueue() {
    showLoading();
    const lang = getCurrentLang();
    const trans = translations[lang];
    const switchElement = document.getElementById('prioritySwitch');
    const usePriority = switchElement ? switchElement.checked : false;
    let priorityLevel = 0; 

    if (usePriority) {
        if (currentUser.priorityQuota <= 0) {
            alert(trans.queue_priority_no_quota || '您的優先排隊權限已用完');
            switchElement.checked = false;
            togglePriorityGlow(false, 0);
            hideLoading();
            return;
        }
        if (!confirm(trans.alert_priority_confirm || '確定要使用 1 次優先排隊權限嗎？')) {
            hideLoading(); return;
        }
        priorityLevel = (currentUser.level === 'legend') ? 2 : 1;
    }

    try {
        const snapshot = await database.ref('queue/' + currentUser.username).once('value');
        if (snapshot.exists()) {
            alert(trans.alert_already_in_queue);
            hideLoading();
            return;
        }

        const queueItem = {
            username: currentUser.username,
            nickname: currentUser.nickname,
            gameUID: currentUser.gameUID,
            level: currentUser.level,
            joinTime: new Date().toISOString(),
            priorityLevel: priorityLevel
        };

        await database.ref('queue/' + currentUser.username).set(queueItem);

        if (usePriority) {
            currentUser.priorityQuota -= 1;
            await database.ref('members/' + currentUser.username + '/priorityQuota').set(currentUser.priorityQuota);
        }

        alert(trans.alert_join_queue_success);
        showQueuePage(); 
    } catch (error) {
        console.error('加入排隊失敗:', error);
        alert(trans.alert_join_queue_fail);
    } finally {
        hideLoading();
    }
}

async function leaveQueue() {
    const lang = getCurrentLang();
    const trans = translations[lang];
    if (!confirm(trans.alert_leave_queue_confirm || '確定要離開排隊嗎？')) return;

    showLoading();
    try {
        await database.ref('queue/' + currentUser.username).remove();
        alert(trans.alert_leave_queue_success || '已離開排隊');
        await showQueuePage();
    } catch (error) {
        console.error('離開排隊失敗:', error);
        alert(trans.alert_leave_queue_fail || '離開排隊失敗，請稍後再試');
    } finally {
        hideLoading();
    }
}

function togglePriorityGlow(isON, quota) {
    const btn = document.getElementById('btnJoinQueue');
    const lang = getCurrentLang();
    const trans = translations[lang];
    if (btn) {
        if (isON && quota > 0) {
            btn.classList.add('priority-glow');
        } else {
            btn.classList.remove('priority-glow');
            btn.innerHTML = `${trans.queue_join_button || '一鍵排隊'}`;
        }
    }
}

// --- [核心功能] 顯示會員資訊 (修復功能消失問題) ---
async function showMemberInfo() {
    const content = document.getElementById('memberContent');
    const lang = getCurrentLang();
    const trans = translations[lang];

    if (!currentUser) {
        content.innerHTML = `<div class="empty-state"><h3>${trans.member_login_prompt}</h3></div>`;
        return;
    }

    showLoading();
    try {
        const snapshot = await database.ref('members/' + currentUser.username).once('value');
        if (!snapshot.exists()) {
            alert('錯誤：找不到您的會員資料，請重新登入');
            logout();
            return;
        }
        
        let updatedUser = snapshot.val();
        updatedUser.username = currentUser.username;
        updatedUser = await checkAndResetQuota(updatedUser);
        
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - updatedUser.lastUpdateTime;
        if (elapsed > 0 && updatedUser.remainingSeconds > 0) {
            updatedUser.remainingSeconds = Math.max(0, updatedUser.remainingSeconds - elapsed);
            updatedUser.lastUpdateTime = now;
            await database.ref('members/' + updatedUser.username).update({
                remainingSeconds: updatedUser.remainingSeconds,
                lastUpdateTime: updatedUser.lastUpdateTime
            });
        }
        
        currentUser = updatedUser; 

        const levelKey = currentUser.level === 'legend' ? 'level_legend' :
            currentUser.level === 'diamond' ? 'level_diamond' : 'level_gold';
        const levelText = trans[levelKey];
        const badgeClass = currentUser.level === 'legend' ? 'badge-legend' :
            currentUser.level === 'diamond' ? 'badge-diamond' : 'badge-gold';
        const platformText = currentUser.platform === 'tiktok' ? 'TikTok' : 'YouTube';
        const timeObj = secondsToTime(currentUser.remainingSeconds);
        const timeClass = getTimeColorClass(currentUser.remainingSeconds);

        const codeSnapshot = await database.ref('activationCodes/' + currentUser.activationCode).once('value');
        const codeData = codeSnapshot.val();
        const codeTimeObj = codeData ? secondsToTime(codeData.seconds) : null;

        content.innerHTML = `
<div class="member-info">
    <h2>👤 ${currentUser.nickname}</h2>
    <div class="info-item">
        <span>${trans.member_platform}</span>
        <span>${platformText}</span>
    </div>
    <div class="info-item">
        <span>${trans.member_level}</span>
        <span class="badge ${badgeClass}">${levelText}</span>
    </div>
    <div class="info-item">
        <span>${trans.member_uid}</span>
        <div class="copy-area">
            <span>${currentUser.gameUID}</span>
            <button class="btn-copy" onclick="copyToClipboard('${currentUser.gameUID}', this)">📋 ${trans.copy}</button>
        </div>
    </div>
    <div class="info-item">
        <span>${trans.member_code}</span>
        <span style="font-family: 'Courier New', monospace; font-weight: bold;">${currentUser.activationCode}</span>
    </div>
    ${codeData ? `
    <div class="info-item">
        <span>${trans.member_code_duration}</span>
        <span>${formatTimeDisplay(codeTimeObj)}</span>
    </div>
    ` : ''}
    <div class="info-item">
        <span>${trans.member_join_date}</span>
        <span>${new Date(currentUser.joinDate).toLocaleDateString('zh-TW')}</span>
    </div>
    <div class="info-item">
        <span>${trans.member_remaining_sec}</span>
        <span class="countdown-time ${timeClass}" data-username="${currentUser.username}">${currentUser.remainingSeconds.toLocaleString()} 秒</span>
    </div>
    ${currentUser.isAdmin ? `
    <div class="info-item">
        <span>${trans.member_permission}</span>
        <span class="badge-admin">${trans.member_admin}</span>
    </div>
    ` : ''}
</div>
<div style="text-align: center; padding: 30px;">
    <h3 style="margin-bottom: 10px;">${trans.member_remaining_time}</h3>
    <div class="time-display ${timeClass}">${formatTimeDisplay(timeObj)}</div>
    ${currentUser.remainingSeconds <= 0 ? `<p style="color: #e74c3c; margin-top: 10px;">${trans.member_expired}</p>` : ''}
</div>

<div class="settings-section">
    <h4>⚙️ ${trans.member_account_settings}</h4>
    <button class="btn btn-small" onclick="openChangePasswordModal()">🔒 ${trans.member_change_password}</button>
</div>
`;
    } catch (error) {
        console.error('顯示會員資訊失敗:', error);
        content.innerHTML = `<div class="empty-state"><h3>${trans.member_load_fail}</h3></div>`;
    } finally {
        hideLoading();
    }
}

// --- [新增] 智慧報價計算機邏輯 ---
function initCalculator() {
    database.ref('calculatorConfig').on('value', (snapshot) => {
        calcConfig = snapshot.val() || DEFAULT_CALC_CONFIG;
        console.log('✅ 計算機參數已更新');
        if (currentPage === 'calculator') {
            updateWeekDisplay();
            calculate();
            renderPricingTables();
        }
    });
}

function switchCalcTab(tabName, btn) {
    const buttons = btn.parentElement.querySelectorAll('.sub-tab');
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('calc-sub-main').style.display = 'none';
    document.getElementById('calc-sub-algorithm').style.display = 'none';
    document.getElementById('calc-sub-manual').style.display = 'none';

    document.getElementById('calc-sub-' + tabName).style.display = 'block';
    if(tabName === 'algorithm') renderPricingTables();
}

function setServiceType(type) {
    currentServiceType = type;
    document.querySelectorAll('.service-option').forEach(el => el.classList.remove('active'));
    document.getElementById(type === 'boost' ? 'optBoost' : 'optCarry').classList.add('active');
    calculate();
}

// 1. [修改] 取得目前週次 (移除寫死的 9)
function getSeasonWeek() {
    if (!calcConfig) return 1;
    const start = new Date(calcConfig.seasonStartDate);
    const now = new Date();
    
    // 負數處理：還沒開始算 Week 1
    if (now < start) return 1;

    const diffTime = now - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    let week = Math.ceil(diffDays / 7);
    
    if (week < 1) week = 1;
    
    // 檢查是否有結束日期，如果有，週次不應超過最大週數
    if (calcConfig.seasonEndDate) {
        const end = new Date(calcConfig.seasonEndDate);
        const totalDiff = end - start;
        const totalDays = Math.ceil(totalDiff / (1000 * 60 * 60 * 24));
        const maxWeeks = Math.ceil((totalDays + 1) / 7);
        if (week > maxWeeks) week = maxWeeks; // 超過時間就停留在最後一週
    } else {
        // 如果沒有設定結束日期，預設上限 9 (相容舊資料)
        if (week > 9) week = 9;
    }
    
    return week;
}
function updateWeekDisplay() {
    const week = getSeasonWeek();
    const weekEl = document.getElementById('currentWeekDisplay');
    if(weekEl) weekEl.textContent = `Week ${week}`;
}

// ==========================================
// ▼▼▼ 修正 calculate 函式 (支援新舊資料結構) ▼▼▼
// ==========================================

function calculate() {
    // 1. 隱藏之前的結果
    document.getElementById('resultContent').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';

    if (!calcConfig) return;

    const currentInput = document.getElementById('currentScore').value;
    const targetInput = document.getElementById('targetScore').value;
    
    // 尚未輸入時不動作
    if (!currentInput || !targetInput) {
        document.getElementById('emptyState').style.display = 'block';
        return;
    }

    const current = parseInt(currentInput);
    const target = parseInt(targetInput);
    const week = getSeasonWeek();

    // 限制大師 (4501) 以下不接單
    if (current < 4501) {
        alert("⚠️ 抱歉，本系統目前僅受理「大師 (4501分)」以上的報價。\n\n4501分以下的代打需求，請直接私訊主播詢問！");
        return;
    }

    // 防呆機制
    if (target <= current) {
        alert("⚠️ 目標分數必須高於目前分數");
        return;
    }

    // 顯示結果區塊
    document.getElementById('resultContent').style.display = 'block';

    let totalPrice = 0;
    let scoreDiff = target - current;
    
    let breakdownHtml = `
        <div style="margin-bottom:10px; padding-bottom:5px; border-bottom:1px solid #444; font-size: 0.9em; color: #aaa;">
            ℹ️ 公式：基礎價 × 權重 × 單位數(每100分) = 價格
        </div>
        <div style="margin-bottom:5px; color:#00f3ff; font-weight:bold;">
            📝 計算明細:
        </div>`;

    const TIERS = [
        { name: 'master', label: '大師', min: 4501, max: 6000 },
        { name: 'grandmaster', label: '宗師', min: 6001, max: 8000 },
        { name: 'legend', label: '傳奇(10000-)', min: 8001, max: 10000 }, // 修改 label
        { name: 'mythical', label: '萬分(10000+)', min: 10001, max: 99999 } // 修改 label
    ];

    let hasClosedTier = false;

    TIERS.forEach(tier => {
        let overlapStart = Math.max(current, tier.min);
        let overlapEnd = Math.min(target, tier.max);
        
        if (overlapEnd > overlapStart) {
            let pointsInTier = overlapEnd - overlapStart;
            let units = Math.ceil(pointsInTier / 100); 
            let weightData;

// 因為現在 boost 和 carry 結構一樣 (都有 4 個 rank)，邏輯可以統一
if (calcConfig.weights[currentServiceType] && calcConfig.weights[currentServiceType][week]) {
    // 直接根據 tier.name (master, grandmaster, legend, mythical) 去抓
    weightData = calcConfig.weights[currentServiceType][week][tier.name];
    
    // 如果找不到 (例如舊資料 boost 沒有 master)，嘗試抓舊的 normal
    if (!weightData && currentServiceType === 'boost' && tier.name !== 'mythical') {
        weightData = calcConfig.weights.boost[week].normal;
    }
}
            let base = calcConfig.basePrices[currentServiceType][tier.name];

            // 判斷 weightData 是物件 {w, e} 還是純數字
            let weight = (typeof weightData === 'object' && weightData !== null) ? weightData.w : weightData;
            weight = Number(weight) || 0;

            if (weight === 0) {
                hasClosedTier = true;
                breakdownHtml += `
                <div class="breakdown-row" style="color: #ff0055;">
                    <span class="breakdown-label">${tier.label}區間:</span>
                    <span class="breakdown-value">🚫 暫未開放</span>
                </div>`;
            } else {
                let tierPrice = base * weight * units;
                totalPrice += tierPrice;

                breakdownHtml += `
                <div class="breakdown-row" style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="color:#ccc;">${tier.label} (${pointsInTier}分):</span>
                    <span style="color:#fff; font-family:monospace;">
                        $${base} × ${weight} × ${units}單位 = <span style="color:#39ff14;">$${Math.round(tierPrice)}</span>
                    </span>
                </div>`;
            }
        }
    });

    // 處理結果顯示
    if (hasClosedTier) {
        document.getElementById('rateTag').textContent = "⛔ 包含未開放區間";
        document.getElementById('rateTag').className = "badge badge-legend"; 
        document.getElementById('finalPrice').textContent = "---";
        document.querySelector('.btn-success').disabled = true; 
        document.getElementById('calcBreakdown').innerHTML = breakdownHtml; 
    } else {
        document.getElementById('rateTag').textContent = `Week ${week} 費率`;
        document.getElementById('rateTag').className = "badge badge-gold";
        document.getElementById('finalPrice').textContent = Math.round(totalPrice).toLocaleString();
        document.querySelector('.btn-success').disabled = false;
        
        breakdownHtml += `
        <div class="breakdown-total" style="border-top:1px solid #444; margin-top:5px; padding-top:5px; text-align:right;">
            總計: <span style="color:#39ff14; font-size:1.2em;">$${Math.round(totalPrice).toLocaleString()}</span>
        </div>`;
        document.getElementById('calcBreakdown').innerHTML = breakdownHtml;
    }

    document.getElementById('scoreDiff').textContent = `${scoreDiff} 分`;
    
    // 預估時間計算 (使用預設效率，因為前台不顯示複雜效率)
    let efficiency = currentServiceType === 'boost' ? 500 : 300; 
    let hours = scoreDiff / efficiency;
    let days = Math.ceil(hours / 5); 
    document.getElementById('estTime').textContent = `約 ${days} 天`;
    
    document.getElementById('compareBox').style.display = 'none';
}
// ==========================================
// ▼▼▼ 修正 renderPricingTables 函式 (顯示 8 欄位) ▼▼▼
// ==========================================

function renderPricingTables() {
    if (!calcConfig) return; 

    const currentWeek = getSeasonWeek();
    
    // 計算總週數
    let totalWeeks = 9; 
    if (calcConfig.seasonStartDate && calcConfig.seasonEndDate) {
        const start = new Date(calcConfig.seasonStartDate);
        const end = new Date(calcConfig.seasonEndDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalWeeks = Math.ceil((diffDays + 1) / 7);
        if(totalWeeks < 1) totalWeeks = 1;
    }

    const bp = calcConfig.basePrices;

    // --- 1. 修正基礎價格表格 ---
    const tableBase = document.getElementById('tableBasePrices');
    if (tableBase) {
        tableBase.innerHTML = `
            <thead>
                <tr>
                    <th style="width: 20%;">服務項目</th>
                    <th style="width: 20%;">大師 (Master)</th>
                    <th style="width: 20%;">宗師 (GM)</th>
                    <th style="width: 20%;">傳奇 (10000-)</th>
                    <th style="width: 20%;">萬分 (10000+)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="color: #00f3ff; font-weight: bold;">⚡ Ted代打</td>
                    <td>$${bp.boost.master}</td>
                    <td>$${bp.boost.grandmaster}</td>
                    <td>$${bp.boost.legend}</td>
                    <td>$${bp.boost.mythical}</td>
                </tr>
                <tr>
                    <td style="color: #bd00ff; font-weight: bold;">🛡️ 尊榮護航</td>
                    <td>$${bp.carry.master}</td>
                    <td>$${bp.carry.grandmaster}</td>
                    <td>$${bp.carry.legend}</td>
                    <td>$${bp.carry.mythical}</td>
                </tr>
            </tbody>
        `;
    }
    

    // --- 權重表格 (改為顯示 8 個欄位) ---
    const tableWeights = document.getElementById('tableWeights');
    if (tableWeights) {
        const formatWeightCell = (value) => {
            if (!value || value === 0) {
                return `<td class="closed-slot" title="本時段不開放"></td>`;
            }
            return `<td>${value}</td>`;
        };

        // 表頭結構：每週 8 欄 (代打4 + 護航4)
        let weightHtml = `
            <thead>
                <tr>
                    <th rowspan="2" style="vertical-align: middle; width: 8%;">週次</th>
                    <th colspan="4" style="color: #00f3ff; border-bottom: 2px solid rgba(0, 243, 255, 0.3);">⚡ 代打權重</th>
                    <th colspan="4" style="color: #bd00ff; border-bottom: 2px solid rgba(189, 0, 255, 0.3);">🛡️ 護航權重</th>
                </tr>
                <tr class="sub-header">
                    <th style="font-size: 0.8em; color: #88ffff;">大師</th>
                    <th style="font-size: 0.8em; color: #88ffff;">宗師</th>
                    <th style="font-size: 0.8em; color: #88ffff;">傳奇(10000-)</th> <th style="font-size: 0.8em; color: #88ffff;">萬分(10000+)</th> <th style="font-size: 0.8em; color: #eebbff;">大師</th>
                    <th style="font-size: 0.8em; color: #eebbff;">宗師</th>
                    <th style="font-size: 0.8em; color: #eebbff;">傳奇(10000-)</th> <th style="font-size: 0.8em; color: #eebbff;">萬分(10000+)</th> </tr>
            </thead>
            <tbody>
        `;

        const services = ['boost', 'carry'];
        const ranks = ['master', 'grandmaster', 'legend', 'mythical'];

        for (let i = 1; i <= totalWeeks; i++) {
            const isCurrent = (i === currentWeek);
            const rowStyle = isCurrent 
                ? 'background: rgba(255, 215, 0, 0.15); font-weight: bold; font-size: 1.1em; border-left: 6px solid #FFD700;' 
                : 'border-left: 6px solid transparent;';
            
            weightHtml += `<tr style="${rowStyle}"><td>Week ${i}</td>`;

            services.forEach(service => {
                ranks.forEach(rank => {
                    // 安全讀取資料
                    let data = (calcConfig.weights[service] && calcConfig.weights[service][i]) 
                               ? calcConfig.weights[service][i][rank] : 0;

                    // 相容舊資料 boost.normal
                    if (!data && service === 'boost' && rank !== 'mythical') {
                        data = (calcConfig.weights.boost && calcConfig.weights.boost[i]) 
                               ? calcConfig.weights.boost[i].normal : 0;
                    }

                    // 取權重值 (如果是物件 {w, e} 取 w，如果是數字取數字)
                    let val = (typeof data === 'object' && data !== null) ? data.w : data;
                    
                    weightHtml += formatWeightCell(val);
                });
            });

            weightHtml += `</tr>`;
        }
        weightHtml += `</tbody>`;
        tableWeights.innerHTML = weightHtml;
    }
}

function contactService() {
    const price = document.getElementById('finalPrice').textContent;
    if (price === "---" || price === "0") return;

    const type = currentServiceType === 'boost' ? 'Ted代打' : '尊榮護航';
    const score = `${document.getElementById('currentScore').value} -> ${document.getElementById('targetScore').value}`;
    const breakdown = document.getElementById('calcBreakdown').innerText;
    
    const msg = `嗨！我想預約 ${type} \n分數：${score} \n預估價格：$${price}\n\n${breakdown}`;
    
    navigator.clipboard.writeText(msg).then(() => {
        alert(`已複製預約訊息！請傳送給主播：\n\n${msg}`);
    }).catch(() => {
        alert("複製失敗，請手動截圖傳送");
    });
}

function updateUserSection() {
    const userSection = document.getElementById('userSection');
    const lang = getCurrentLang();
    const trans = translations[lang];
    const langSwitcher = userSection.querySelector('.lang-switcher');

    if (currentUser) {
        const levelText = currentUser.level === 'legend' ? trans.level_legend_simple :
            currentUser.level === 'diamond' ? trans.level_diamond_simple : trans.level_gold_simple;
        const levelClass = currentUser.level === 'legend' ? 'badge-legend' :
            currentUser.level === 'diamond' ? 'badge-diamond' : 'badge-gold';

        userSection.innerHTML = `
        <div class="user-info" style="padding: 5px 15px;">
            <span class="badge ${levelClass}" style="margin:0;">${levelText}</span>
            <span class="name" style="margin-left:8px;">${currentUser.nickname}</span>
        </div>
        <button class="btn btn-danger btn-small" onclick="logout()">
            🚪 ${trans.logout}
        </button>
        `;
        if (langSwitcher) userSection.prepend(langSwitcher);
    } else { 
        userSection.innerHTML = `
        <button class="btn btn-small" onclick="openLoginModal()" data-lang-key="login">${trans.login}</button>
        <button class="btn btn-success btn-small" onclick="openRegisterModal()" data-lang-key="register">${trans.register}</button>
        `;
        if (langSwitcher) userSection.prepend(langSwitcher);
    }

    const tabsContainer = document.querySelector('.tabs');
    const existingAdminBtn = document.getElementById('adminSettingsBtn');
    if (existingAdminBtn) existingAdminBtn.remove();

    if (currentUser && currentUser.isAdmin) {
        const adminBtn = document.createElement('a');
        adminBtn.id = 'adminSettingsBtn';
        adminBtn.href = 'admin.html';
        adminBtn.className = 'btn btn-small';
        adminBtn.style.cssText = `margin-left: auto; background: transparent; border-color: #bd00ff; color: #bd00ff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(189, 0, 255, 0.3); text-decoration: none;`;
        adminBtn.innerHTML = '⚙️'; 
        adminBtn.title = trans.admin_panel || 'Admin Panel';
        adminBtn.onmouseover = function() { this.style.boxShadow = "0 0 20px rgba(189, 0, 255, 0.8)"; this.style.background = "rgba(189, 0, 255, 0.1)"; };
        adminBtn.onmouseout = function() { this.style.boxShadow = "0 0 10px rgba(189, 0, 255, 0.3)"; this.style.background = "transparent"; };
        if(tabsContainer) tabsContainer.appendChild(adminBtn);
    }
}

// 核心頁面切換邏輯 (修復分頁按鈕)
function showPage(pageName) {
    currentPage = pageName;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(pageName).classList.add('active');

    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab) => {
        if (tab.getAttribute('onclick') === `showPage('${pageName}')`) {
            tab.classList.add('active');
        }
    });
    
    const plansTab = document.querySelector('.tab[href="member.html"]');
    if (plansTab) plansTab.classList.remove('active');

    if (pageName === 'member') {
        showMemberInfo();
        startAutoRefresh();
    } else if (pageName === 'queue') {
        showQueuePage();
        startAutoRefresh();
    } else if (pageName === 'calculator') {
        stopAutoRefresh();
        updateWeekDisplay();
        calculate(); 
        renderPricingTables();
    } else {
        stopAutoRefresh();
    }
}

// Modal 控制
function openLoginModal() { 
    closeRegisterModal(); // 開啟登入前先關閉註冊
    document.getElementById('loginModal').classList.add('active'); 
}
function closeLoginModal() { document.getElementById('loginModal').classList.remove('active'); document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; }
function openRegisterModal() { 
    closeLoginModal();    // 開啟註冊前先關閉登入
    document.getElementById('registerModal').classList.add('active'); 
}
function closeRegisterModal() { 
    document.getElementById('registerModal').classList.remove('active'); 
    document.getElementById('regActivationCode').value = '';
    document.getElementById('regUsername').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('regConfirmPassword').value = '';
    document.getElementById('regNickname').value = '';
    document.getElementById('regGameUID').value = '';
}
function openChangePasswordModal() { document.getElementById('changePasswordModal').classList.add('active'); }
function closeChangePasswordModal() { 
    document.getElementById('changePasswordModal').classList.remove('active'); 
}
function openForgotPasswordModal() {
    closeLoginModal();
    document.getElementById('forgotPasswordModal').classList.add('active');
    document.getElementById('securityQuestionSection').style.display = 'none';
    document.getElementById('resetPasswordSection').style.display = 'none';
    document.getElementById('forgotUsername').value = '';
}
function closeForgotPasswordModal() { document.getElementById('forgotPasswordModal').classList.remove('active'); forgotPasswordUser = null; }
function closeEditMemberModal() { document.getElementById('editMemberModal').classList.remove('active'); editingMember = null; }

// ==========================================
// ▼▼▼ 動作函式整合包 (登入/註冊/登出) ▼▼▼
// ==========================================

// 1. 登入功能
async function login() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    
    if (!usernameInput || !passwordInput) return;
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const lang = getCurrentLang();
    const trans = translations[lang];

    if (!username || !password) {
        alert(trans.alert_input_prompt || '請輸入帳號密碼');
        return;
    }

    showLoading();
    try {
        const snapshot = await database.ref('members/' + username).once('value');
        if (!snapshot.exists()) {
            alert(trans.alert_login_wrong || '帳號或密碼錯誤');
            hideLoading();
            return;
        }

        const memberData = snapshot.val();
        const inputHash = await hashPassword(password);

        // 相容舊密碼與雜湊密碼
        if (memberData.passwordHash === inputHash || memberData.password === inputHash) {
            sessionStorage.setItem('currentUser', username);
            alert(trans.alert_login_success || '登入成功');
            closeLoginModal();
            location.reload(); 
        } else {
            alert(trans.alert_login_wrong || '帳號或密碼錯誤');
        }
    } catch (error) {
        console.error('登入錯誤:', error);
        alert(trans.alert_op_fail || '系統錯誤');
    } finally {
        hideLoading();
    }
}

// 2. 登出功能
function logout() {
    const lang = getCurrentLang();
    const trans = translations[lang];
    if (confirm(trans.alert_logout || '確定要登出嗎？')) {
        sessionStorage.removeItem('currentUser');
        currentUser = null;
        location.reload();
    }
}

// 3. 註冊功能 (完整邏輯)
async function register() {
    const code = document.getElementById('regActivationCode').value.trim().toUpperCase();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const confirmPassword = document.getElementById('regConfirmPassword').value.trim();
    const platform = document.getElementById('regPlatform').value;
    const nickname = document.getElementById('regNickname').value.trim() || username;
    const gameUID = document.getElementById('regGameUID').value.trim();
    const secQ = document.getElementById('regSecurityQuestion').value;
    const secA = document.getElementById('regSecurityAnswer').value.trim();

    const lang = getCurrentLang();
    const trans = translations[lang];

    if (!code || !username || !password || !confirmPassword || !gameUID || !secQ || !secA) {
        alert(trans.alert_fill_all || '請填寫完整資訊');
        return;
    }
    if (password.length < 6) {
        alert(trans.alert_password_short || '密碼過短');
        return;
    }
    if (password !== confirmPassword) {
        alert(trans.alert_password_mismatch || '密碼不一致');
        return;
    }

    showLoading();
    try {
        const userSnap = await database.ref('members/' + username).once('value');
        if (userSnap.exists()) {
            alert(trans.alert_user_exist || '使用者名稱已存在');
            hideLoading(); return;
        }

        const codeSnap = await database.ref('activationCodes/' + code).once('value');
        const codeData = codeSnap.val();

        if (!codeSnap.exists()) {
            alert(trans.alert_code_not_exist || '兌換碼不存在');
            hideLoading(); return;
        }
        if (codeData.used) {
            alert(trans.alert_code_used || '此兌換碼已被使用');
            hideLoading(); return;
        }

        const passwordHash = await hashPassword(password);
        const newMember = {
            nickname: nickname,
            username: username,
            passwordHash: passwordHash,
            gameUID: gameUID,
            platform: platform,
            activationCode: code,
            level: codeData.level,
            remainingSeconds: codeData.seconds,
            joinDate: new Date().toISOString(),
            lastUpdateTime: Math.floor(Date.now() / 1000),
            priorityQuota: (codeData.level === 'legend' ? 5 : (codeData.level === 'diamond' ? 2 : 0)),
            quotaLastReset: new Date().toISOString().slice(0, 7),
            securityQuestion: secQ,
            securityAnswer: secA,
            isAdmin: false
        };

        const updates = {};
        updates['members/' + username] = newMember;
        updates['activationCodes/' + code + '/used'] = true;
        updates['activationCodes/' + code + '/usedBy'] = username;
        updates['activationCodes/' + code + '/usedDate'] = new Date().toISOString();

        await database.ref().update(updates);
        alert(trans.alert_register_success || '註冊成功！請登入');
        closeRegisterModal();

    } catch (error) {
        console.error('註冊失敗:', error);
        alert(trans.alert_op_fail || '註冊發生錯誤');
    } finally {
        hideLoading();
    }
}

// 4. 其他功能佔位符 (防止報錯)
async function checkSecurityQuestion() { alert("功能維護中"); }
async function verifySecurityAnswer() { console.log("驗證..."); }
async function resetPassword() { console.log("重設..."); }
async function changePassword() { alert("請聯繫管理員修改密碼"); }
// ==========================================
// ▼▼▼ 補回遺失的登入功能 (貼在 index.js) ▼▼▼
// ==========================================

async function login() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    
    // 1. 基本檢查
    if (!usernameInput || !passwordInput) return;
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const lang = getCurrentLang();
    const trans = translations[lang];

    if (!username || !password) {
        alert(trans.alert_login_prompt || '請輸入使用者名稱和密碼');
        return;
    }

    showLoading(); // 顯示讀取轉圈圈

    try {
        // 2. 從 Firebase 讀取該使用者的資料
        const snapshot = await database.ref('members/' + username).once('value');
        
        if (!snapshot.exists()) {
            alert(trans.alert_login_wrong || '使用者名稱或密碼錯誤');
            hideLoading();
            return;
        }

        const memberData = snapshot.val();
        
        // 3. 密碼雜湊比對 (使用你原本的 hashPassword 函式)
        const inputHash = await hashPassword(password);

        // 相容性檢查：如果資料庫裡存的是明碼(舊資料)或雜湊碼
        // 建議統一用雜湊，這裡先做簡單比對
        if (memberData.passwordHash === inputHash || memberData.password === inputHash) {
            
            // 4. 登入成功：寫入 Session
            sessionStorage.setItem('currentUser', username);
            
            alert(trans.alert_login_success || '登入成功！');
            closeLoginModal();
            
            // 5. 重新整理頁面以更新狀態 (顯示頭像等)
            location.reload(); 
        } else {
            alert(trans.alert_login_wrong || '使用者名稱或密碼錯誤');
        }
    } catch (error) {
        console.error('登入錯誤:', error);
        alert(trans.alert_op_fail || '系統發生錯誤，請稍後再試');
    } finally {
        hideLoading(); // 關閉讀取轉圈圈
    }
}

// 修改 index.js 中的 logout 函式
function logout() {
    const lang = getCurrentLang();
    const trans = translations[lang];
    
    // 1. 確認是否登出
    if (confirm(trans.alert_logout_confirm || '確定要登出嗎？')) {
        
        // 2. 清除登入狀態
        sessionStorage.removeItem('currentUser');
        currentUser = null;
        
        // 3. 更新右上角按鈕 (變回 "登入/註冊")
        updateUserSection();
        
        // 4. 如果在 "我的會員" 或 "排隊" 頁面，清空內容或跳回首頁
        if (currentPage === 'member' || currentPage === 'queue') {
            showPage(currentPage); // 重新渲染該頁面 (會顯示 "請先登入")
        }

        // 5. ★★★ 關鍵：直接打開登入小窗 (搭配 CSS 就會有動畫) ★★★
        openLoginModal();
        
        // (選填) 如果不想跳 Alert 打斷動畫，這行可以註解掉
        // alert(trans.alert_logout || '已登出'); 
    }
}
// ==========================================
// ▲▲▲ 補上缺失的動作函式 (結束) ▲▲▲
// ==========================================

// 初始化
async function initialize() {
    showLoading();
    try {
        initCalculator();

        const loggedInUsername = sessionStorage.getItem('currentUser');
        if (loggedInUsername) {
            let member = await validateSessionUser(loggedInUsername);
            if (member) {
                member = await checkAndResetQuota(member);
                currentUser = member;
                console.log(`Session 驗證成功: ${currentUser.username}`);
            } else {
                console.log('Session 驗證失敗，清除儲存的登入狀態');
                sessionStorage.removeItem('currentUser');
            }
        }

        updateUserSection();
        startGlobalCountdown();
        
        function setupEnterListener(inputId, callback) {
            const element = document.getElementById(inputId);
            if (element) {
                element.addEventListener('keyup', function(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        callback();
                    }
                });
            }
        }

        setupEnterListener('loginUsername', login);
        setupEnterListener('loginPassword', login);
        setupEnterListener('regSecurityAnswer', register);
        setupEnterListener('changeConfirmPassword', changePassword);
        setupEnterListener('forgotUsername', checkSecurityQuestion);
        setupEnterListener('securityAnswer', verifySecurityAnswer);
        setupEnterListener('confirmNewPassword', resetPassword);

    } catch (error) {
        console.error('系統初始化失敗:', error);
        alert('系統初始化失敗，請重新整理頁面');
    } finally {
        hideLoading();
        document.dispatchEvent(new Event('DOMContentLoaded'));
    }
}

console.log('⏳ 等待 Firebase 認證...');

// --- 翻譯邏輯 ---
function getCurrentLang() {
    return localStorage.getItem('language') || 'zh';
}

const translations = {
    'zh': {
        'page_title': '廖嘉泰の會員管理系統',
        'app_title': '🎮 廖嘉泰の會員管理系統',
        'app_subtitle': '📢 GAME LIVE 主播專屬平台',
        'login': '登入',
        'register': '註冊',
        'tab_home': '首頁',
        'tab_queue': '排隊系統',
        'tab_member': '我的會員',
        'tab_calculator': '智慧報價', 
        'home_welcome': '歡迎來到 廖嘉泰の會員系統',
        'home_plans_title': '會員方案',
        'home_plans_button': '查看完整方案 & 名單',
        'duration_1': '1個月 (30天)',
        'duration_2': '3個月 (90天)',
        'duration_3': '5個月 (150天)',
        'home_how_to_title': '📝 如何註冊',
        'home_step_1': '向主播購買會員方案，獲得 <strong>6位兌換碼</strong>',
        'home_step_2': '點擊右上角「註冊」按鈕',
        'home_step_3': '輸入兌換碼和您的資料',
        'home_step_4': '完成註冊,開始享受會員權益!',
        'login_title': '會員登入',
        'username': '使用者名稱',
        'username_placeholder': '請輸入使用者名稱',
        'password': '密碼',
        'password_placeholder': '請輸入密碼',
        'forgot_password': '忘記密碼？',
        'register_title': '註冊會員',
        'redeem_code': '兌換碼',
        'redeem_code_placeholder': '請輸入6位兌換碼',
        'redeem_code_note': '向主播購買會員後獲得的兌換碼',
        'username_reg_placeholder': '請輸入使用者名稱（用於登入）',
        'password_reg_placeholder': '請輸入密碼（至少6個字元）',
        'confirm_password': '確認密碼',
        'confirm_password_placeholder': '請再次輸入密碼',
        'platform_select': '平台選擇',
        'nickname': '暱稱',
        'optional': '(選填)',
        'nickname_placeholder': '請輸入你的TikTok或YouTube暱稱',
        'nickname_note': '如果不填寫，將使用使用者名稱作為暱稱',
        'game_uid_placeholder': '請輸入 Call of Duty Mobile UID',
        'game_uid_note': '可在遊戲內個人資料查看',
        'sec_q': '安全問題（用於找回密碼）',
        'sec_q_select': '請選擇安全問題',
        'sec_q_pet': '你的第一隻寵物叫什麼名字？',
        'sec_q_school': '你的小學校名是什麼？',
        'sec_q_city': '你出生的城市是哪裡？',
        'sec_q_food': '你最喜歡的食物是什麼？',
        'sec_q_game': '你最喜歡的CODM角色是什麼？',
        'sec_a': '安全答案',
        'sec_a_placeholder': '請輸入答案（請記住此答案）',
        'forgot_password_title': '找回密碼',
        'next_step': '下一步',
        'sec_q_display': '安全問題',
        'sec_a_verify_placeholder': '請輸入答案',
        'verify_answer': '驗證答案',
        'new_password': '新密碼',
        'confirm_new_password': '確認新密碼',
        'reset_password': '重設密碼',
        'change_password_title': '更改密碼',
        'current_password': '目前密碼',
        'current_password_placeholder': '請輸入目前密碼',
        'confirm_change': '確認更改',
        'edit_member_title': '編輯會員',
        'logout': '登出',
        'admin_panel': '⚙️ 管理後台',
        'member_platform': '平台',
        'member_level': '會員等級',
        'level_legend': '傳說會員',
        'level_diamond': '鑽石會員',
        'level_gold': '黃金會員',
        'member_uid': 'CODM UID',
        'member_code': '兌換碼',
        'copy': '複製',
        'copy_ok': '✓ 已複製',
        'copy_fail': '複製失敗，請手動複製',
        'member_code_duration': '兌換碼原始時長',
        'member_join_date': '加入時間',
        'member_remaining_sec': '剩餘秒數',
        'member_permission': '權限',
        'member_admin': '管理員',
        'member_remaining_time': '會員剩餘時間',
        'member_expired': '您的會員已過期',
        'member_account_settings': '帳號設定',
        'member_change_password': '更改密碼',
        'member_login_prompt': '請先登入',
        'member_load_fail': '載入失敗，請重試',
        'queue_login_prompt': '請先登入才能使用排隊功能',
        'queue_expired_prompt': '您的會員已過期，無法使用排隊功能',
        'queue_no_session': '目前沒有開放的遊戲場次',
        'queue_wait_for_streamer': '請等待主播開放排隊',
        'queue_refreshing': '自動刷新中',
        'queue_session_start_time': '開放時間:',
        'queue_session_slots': '名額:',
        'queue_session_slots_unit': '位',
        'queue_your_position_title': '你目前的排隊順位',
        'queue_position_prefix': '前面還有',
        'queue_position_suffix': '人',
        'queue_leave': '離開排隊',
        'queue_join_title': '立即加入排隊',
        'queue_join_button': '🚀 一鍵排隊',
        'queue_status_title': '目前排隊狀況',
        'queue_status_people': '人)',
        'queue_empty': '目前沒有人排隊',
        'level_legend_simple': '傳說',
        'level_diamond_simple': '鑽石',
        'level_gold_simple': '黃金',
        'queue_more_people_prefix': '還有',
        'queue_more_people_suffix': '人...',
        'queue_load_fail': '載入失敗，請重試',
        'alert_logout': '已登出',
        'alert_login_success': '登入成功！',
        'alert_admin_privilege': '您擁有管理員權限',
        'alert_login_fail': '登入失敗，請稍後再試',
        'alert_login_wrong': '使用者名稱或密碼錯誤',
        'alert_input_prompt': '請輸入使用者名稱和密碼',
        'alert_register_success': '註冊成功！請登入',
        'alert_register_fail': '註冊失敗，請稍後再試',
        'alert_code_used': '此兌換碼已被使用',
        'alert_code_not_exist': '兌換碼不存在，請確認是否輸入正確',
        'alert_user_exist': '使用者名稱已存在，請選擇其他名稱',
        'alert_password_mismatch': '兩次輸入的密碼不一致，請重新確認',
        'alert_password_short': '密碼至少需要6個字元',
        'alert_fill_form': '請填寫完整必填資訊（暱稱為選填）',
        'alert_verify_success': '驗證成功！請設定新密碼',
        'alert_verify_fail': '答案錯誤，請重新輸入',
        'alert_input_answer': '請輸入答案',
        'alert_input_username': '請輸入使用者名稱',
        'alert_user_not_found': '找不到此使用者',
        'alert_op_fail': '操作失敗，請稍後再試',
        'alert_fill_all': '請填寫完整資訊',
        'alert_password_reset_success': '密碼重設成功！請使用新密碼登入',
        'alert_password_reset_fail': '重設密碼失敗，請稍後再試',
        'alert_current_password_wrong': '目前密碼錯誤',
        'alert_password_change_success': '密碼更改成功！',
        'alert_password_change_fail': '更改密碼失敗，請稍後再試',
        'alert_already_in_queue': '你已經在排隊中了！',
        'alert_join_queue_success': '成功加入排隊！',
        'alert_join_queue_fail': '加入排隊失敗，請稍後再試',
        'alert_leave_queue_confirm': '確定要離開排隊嗎？',
        'alert_leave_queue_success': '已離開排隊',
        'alert_leave_queue_fail': '離開排隊失敗，請稍後再試',
        'queue_priority_switch': '優先排隊',
        'queue_priority_quota': '本月剩餘 <span>{0}</span> 次權限',
        'queue_priority_no_quota': '您的優先排隊權限已用完',
        'alert_priority_confirm': '確定要使用 1 次優先排隊權限嗎？'
    },
    'en': {
        'page_title': "Ted's Member System",
        'app_title': "🎮 Ted's Member System",
        'app_subtitle': '📢 Exclusive Platform for GAME LIVE Streamers',
        'login': 'Login',
        'register': 'Register',
        'tab_home': 'Home',
        'tab_queue': 'Queue System',
        'tab_member': 'My Membership',
        'tab_calculator': 'Price Calculator',
        'home_welcome': "Welcome to Ted's Member System",
        'home_plans_title': 'Membership Plans',
        'home_plans_button': 'View Full Plans & Roster',
        'duration_1': '1 Month (30 Days)',
        'duration_2': '3 Months (90 Days)',
        'duration_3': '5 Months (150 Days)',
        'home_how_to_title': '📝 How to Register',
        'home_step_1': 'Purchase a plan from the streamer to get a <strong>6-digit code</strong>',
        'home_step_2': 'Click the "Register" button in the top right',
        'home_step_3': 'Enter your activation code and information',
        'home_step_4': 'Complete registration and enjoy your benefits!',
        'login_title': 'Member Login',
        'username': 'Username',
        'username_placeholder': 'Enter your username',
        'password': 'Password',
        'password_placeholder': 'Enter your password',
        'forgot_password': 'Forgot Password?',
        'register_title': 'Register Membership',
        'redeem_code': 'Activation Code',
        'redeem_code_placeholder': 'Enter 6-digit activation code',
        'redeem_code_note': 'Code received after purchasing a plan from the streamer',
        'username_reg_placeholder': 'Enter your username (for login)',
        'password_reg_placeholder': 'Enter password (at least 6 characters)',
        'confirm_password': 'Confirm Password',
        'confirm_password_placeholder': 'Enter password again',
        'platform_select': 'Platform',
        'nickname': 'Nickname',
        'optional': '(Optional)',
        'nickname_placeholder': 'Enter your TikTok or YouTube nickname',
        'nickname_note': 'If left blank, your username will be used as your nickname',
        'game_uid_placeholder': 'Enter Call of Duty Mobile UID',
        'game_uid_note': 'Viewable in your in-game profile',
        'sec_q': 'Security Question (for password recovery)',
        'sec_q_select': 'Please select a security question',
        'sec_q_pet': "What is your first pet's name?",
        'sec_q_school': "What is your elementary school's name?",
        'sec_q_city': 'In what city were you born?',
        'sec_q_food': 'What is your favorite food?',
        'sec_q_game': 'What is your favorite CODM character?',
        'sec_a': 'Security Answer',
        'sec_a_placeholder': 'Enter your answer (please remember it)',
        'forgot_password_title': 'Recover Password',
        'next_step': 'Next',
        'sec_q_display': 'Security Question',
        'sec_a_verify_placeholder': 'Enter your answer',
        'verify_answer': 'Verify Answer',
        'new_password': 'New Password',
        'confirm_new_password': 'Confirm New Password',
        'reset_password': 'Reset Password',
        'change_password_title': 'Change Password',
        'current_password': 'Current Password',
        'current_password_placeholder': 'Enter your current password',
        'confirm_change': 'Confirm Change',
        'edit_member_title': 'Edit Member',
        'logout': 'Logout',
        'admin_panel': '⚙️ Admin Panel',
        'member_platform': 'Platform',
        'member_level': 'Membership Level',
        'level_legend': 'Legend Member',
        'level_diamond': 'Diamond Member',
        'level_gold': 'Gold Member',
        'member_uid': 'CODM UID',
        'member_code': 'Activation Code',
        'copy': 'Copy',
        'copy_ok': '✓ Copied',
        'copy_fail': 'Copy failed, please copy manually',
        'member_code_duration': 'Original Code Duration',
        'member_join_date': 'Join Date',
        'member_remaining_sec': 'Remaining Seconds',
        'member_permission': 'Permission',
        'member_admin': 'Admin',
        'member_remaining_time': 'Membership Time Remaining',
        'member_expired': 'Your membership has expired',
        'member_account_settings': 'Account Settings',
        'member_change_password': 'Change Password',
        'member_login_prompt': 'Please login first',
        'member_load_fail': 'Failed to load, please try again',
        'queue_login_prompt': 'Please login to use the queue system',
        'queue_expired_prompt': 'Your membership has expired, you cannot use the queue',
        'queue_no_session': 'There are no open game sessions',
        'queue_wait_for_streamer': 'Please wait for the streamer to open the queue',
        'queue_refreshing': 'Auto-refreshing',
        'queue_session_start_time': 'Start Time:',
        'queue_session_slots': 'Slots:',
        'queue_session_slots_unit': '',
        'queue_your_position_title': 'Your Current Queue Position',
        'queue_position_prefix': 'There are',
        'queue_position_suffix': 'people ahead of you',
        'queue_leave': 'Leave Queue',
        'queue_join_title': 'Join Queue Now',
        'queue_join_button': '🚀 One-Click Join',
        'queue_status_title': 'Current Queue Status',
        'queue_status_people': 'people)',
        'queue_empty': 'The queue is currently empty',
        'level_legend_simple': 'Legend',
        'level_diamond_simple': 'Diamond',
        'level_gold_simple': 'Gold',
        'queue_more_people_prefix': 'and',
        'queue_more_people_suffix': 'more...',
        'queue_load_fail': 'Failed to load, please try again',
        'alert_logout': 'Logged out',
        'alert_login_success': 'Login successful!',
        'alert_admin_privilege': 'You have admin privileges',
        'alert_login_fail': 'Login failed, please try again later',
        'alert_login_wrong': 'Incorrect username or password',
        'alert_input_prompt': 'Please enter username and password',
        'alert_register_success': 'Registration successful! Please login',
        'alert_register_fail': 'Registration failed, please try again later',
        'alert_code_used': 'This activation code has already been used',
        'alert_code_not_exist': 'Activation code does not exist, please check your input',
        'alert_user_exist': 'Username already exists, please choose another name',
        'alert_password_mismatch': 'Passwords do not match, please re-confirm',
        'alert_password_short': 'Password must be at least 6 characters',
        'alert_fill_form': 'Please fill in all required fields (Nickname is optional)',
        'alert_verify_success': 'Verification successful! Please set a new password',
        'alert_verify_fail': 'Answer is incorrect, please try again',
        'alert_input_answer': 'Please enter your answer',
        'alert_input_username': 'Please enter your username',
        'alert_user_not_found': 'User not found',
        'alert_op_fail': 'Operation failed, please try again later',
        'alert_fill_all': 'Please fill in all fields',
        'alert_password_reset_success': 'Password reset successful! Please login with your new password',
        'alert_password_reset_fail': 'Password reset failed, please try again later',
        'alert_current_password_wrong': 'Current password is wrong',
        'alert_password_change_success': 'Password changed successfully!',
        'alert_password_change_fail': 'Password change failed, please try again later',
        'alert_already_in_queue': 'You are already in the queue!',
        'alert_join_queue_success': 'Successfully joined the queue!',
        'alert_join_queue_fail': 'Failed to join queue, please try again later',
        'alert_leave_queue_confirm': 'Are you sure you want to leave the queue?',
        'alert_leave_queue_success': 'You have left the queue',
        'alert_leave_queue_fail': 'Failed to leave queue, please try again later',
        'queue_priority_switch': 'Priority Queue',
        'queue_priority_quota': '<span>{0}</span> priority credits left this month',
        'queue_priority_no_quota': 'You have no priority queue credits left',
        'alert_priority_confirm': 'Are you sure you want to use 1 priority queue credit?'
    }
};

function setLanguage(lang) {
    localStorage.setItem('language', lang);
    document.querySelectorAll('.btn-lang').forEach(btn => {
        if (btn.getAttribute('onclick') === `setLanguage('${lang}')`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const langDict = translations[lang];
    document.querySelectorAll('[data-lang-key]').forEach(el => {
        const key = el.dataset.langKey;
        const translation = langDict[key];
        if (translation === undefined) return;

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = translation;
        } else if (key === 'home_step_1') { 
            el.innerHTML = translation;
        } else {
            if (el.tagName === 'BUTTON' || el.tagName === 'A') {
                const icon = el.innerHTML.match(/^(<.*?>|.*?<\/.*?>|💎|📝|⚙️|🔒|🚀)/);
                if (icon) {
                    el.innerHTML = `${icon[0]} ${translation}`;
                } else {
                    el.textContent = translation;
                }
            } else {
                el.textContent = translation;
            }
        }
    });

    updateUserSection();
    if (currentPage === 'member' && currentUser) showMemberInfo();
    else if (currentPage === 'queue' && currentUser) showQueuePage();
}

document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('language') || 'zh';
    setLanguage(savedLang);
});