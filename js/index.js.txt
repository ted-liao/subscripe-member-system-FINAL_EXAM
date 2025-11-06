<script>
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

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let isAuthReady = false;

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
        firebase.auth().signInAnonymously()
        .catch((error) => {
            console.error('❌ 登入失敗:', error);
            alert('系統初始化失敗，請重新整理頁面');
        });
    }
});

window.initializeAdmin = async function() {
    try {
        console.log('🔄 開始建立管理員帳號...');

        const adminUsername = 'admin';
        const adminPassword = 'Admin@123456';

        const adminRef = database.ref('members/admin');
        const snapshot = await adminRef.once('value');

        if (snapshot.exists()) {
            alert(`✅ 管理員帳號已存在！\n\n可以直接登入：\n👤 Username: admin\n🔑 Password: Admin@123456`);
            return;
        }

        const passwordHash = await hashPassword(adminPassword);
        const now = Math.floor(Date.now() / 1000);
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

        await adminRef.set({
            username: adminUsername,
            passwordHash: passwordHash,
            platform: 'youtube',
            nickname: '系統管理員',
            gameUID: 'ADMIN000000',
            level: 'legend',
            securityQuestion: 'game',
            securityAnswer: 'ghost',
            joinDate: new Date().toISOString(),
            remainingSeconds: 999999999,
            lastUpdateTime: now,
            activationCode: 'ADMIN0',
            isAdmin: true,
            priorityQuota: 999, // 管理員無限次數
            quotaLastReset: currentMonth
        });

        console.log('✅ 管理員建立成功');

        alert(`✅ 管理員帳號建立成功！\n\n👤 Username: admin\n🔑 Password: Admin@123456\n\n請使用這些資訊登入`);

    } catch (error) {
        console.error('❌ 建立管理員失敗:', error);
        alert('建立失敗：' + error.message);
    }
};

console.log('=====================================');
console.log('🎮 CODM 會員管理系統已就緒');
console.log('📌 輸入 initializeAdmin() 建立管理員');
console.log('=====================================');

let currentUser = null;
let forgotPasswordUser = null;
let editingMember = null;
let autoRefreshInterval = null;
let countdownInterval = null;
let dailyBackupInterval = null;
let currentPage = 'home';
let currentCodeSubTab = 'unused';
let currentMemberSubTab = 'active';
const REFRESH_INTERVAL = 3000;

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initializeDefaultAdmin() {
    try {
        const adminRef = database.ref('members/admin');
        const snapshot = await adminRef.once('value');
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

        if (!snapshot.exists()) {
            const passwordHash = await hashPassword('Admin@123456');
            const now = Math.floor(Date.now() / 1000);

            await adminRef.set({
                username: 'admin',
                passwordHash: passwordHash,
                platform: 'youtube',
                nickname: '系統管理員',
                gameUID: 'ADMIN000000',
                level: 'legend',
                securityQuestion: 'game',
                securityAnswer: 'ghost',
                joinDate: new Date().toISOString(),
                remainingSeconds: 999999999,
                lastUpdateTime: now,
                activationCode: 'ADMIN0',
                isAdmin: true,
                priorityQuota: 999, // 管理員無限次數
                quotaLastReset: currentMonth
            });

            console.log('✅ 預設管理員已建立：admin / Admin@123456');
        }
    } catch (error) {
        console.error('初始化管理員失敗:', error);
    }
}

// 【已修改】 包含排序邏輯
async function loadData() {
    try {
        const membersSnapshot = await database.ref('members').once('value');
        const codesSnapshot = await database.ref('activationCodes').once('value');
        const queueSnapshot = await database.ref('queue').once('value');
        const sessionSnapshot = await database.ref('gameSession').once('value');

        const membersData = membersSnapshot.val() || {};
        const members = Object.keys(membersData).map(key => ({
            ...membersData[key],
            username: key
        }));

        const codesData = codesSnapshot.val() || {};
        const activationCodes = Object.values(codesData);

        // 【修改】排序邏輯
        const queueData = queueSnapshot.val() || {};
        const queue = Object.values(queueData); // 1. 從物件轉為陣列

        // 2. 進行排序
        queue.sort((a, b) => {
            // 賦予預設值 0 (一般排隊)
            const priorityA = a.priorityLevel || 0;
            const priorityB = b.priorityLevel || 0;

            // 規則 1: 優先級高的排前面 (傳說 2 > 鑽石 1 > 一般 0)
            if (priorityA !== priorityB) {
                return priorityB - priorityA;
            }

            // 規則 2: 優先級相同，先來的排前面
            return new Date(a.joinTime) - new Date(b.joinTime);
        });

        return {
            members,
            activationCodes,
            queue, // 3. 回傳排好序的陣列
            gameSession: sessionSnapshot.val()
        };
    } catch (error) {
        console.error('載入資料失敗:', error);
        return {
            members: [],
            activationCodes: [],
            queue: [], // 回傳空陣列
            gameSession: null
        };
    }
}


async function saveData(members, activationCodes, queue, gameSession) {
    try {
        const membersObj = {};
        members.forEach(m => {
            membersObj[m.username] = m;
        });

        const codesObj = {};
        activationCodes.forEach(c => {
            codesObj[c.code] = c;
        });

        const queueObj = {};
        queue.forEach(q => {
            queueObj[q.username] = q;
        });

        await database.ref('members').set(membersObj);
        await database.ref('activationCodes').set(codesObj);
        await database.ref('queue').set(queueObj);
        await database.ref('gameSession').set(gameSession);
    } catch (error) {
        console.error('儲存資料失敗:', error);
        alert('資料儲存失敗，請稍後再試');
    }
}

function isAdmin() {
    if (!currentUser) return false;
    return currentUser.isAdmin === true;
}

const securityQuestions = {
    'pet': '你的第一隻寵物叫什麼名字？',
    'school': '你的小學校名是什麼？',
    'city': '你出生的城市是哪裡？',
    'food': '你最喜歡的食物是什麼？',
    'game': '你最喜歡的CODM角色是什麼？'
};

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

function timeToSeconds(years, months, days, hours, minutes, seconds) {
    return (years * 365 * 24 * 60 * 60) +
        (months * 30 * 24 * 60 * 60) +
        (days * 24 * 60 * 60) +
        (hours * 60 * 60) +
        (minutes * 60) +
        seconds;
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

function generateActivationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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
        alert(trans.copy_fail || 'Copy failed, please copy manually');
    });
}

function initDailyBackup() {
    function getTimeUntilMidnight() {
        const now = new Date();
        const midnight = new Date();
        midnight.setHours(23, 59, 59, 999);
        return midnight - now;
    }

    function performBackup() {
        exportToExcel();
        console.log('每日自動備份已執行:', new Date().toLocaleString('zh-TW'));
    }

    const timeUntilMidnight = getTimeUntilMidnight();
    setTimeout(() => {
        performBackup();
        dailyBackupInterval = setInterval(performBackup, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);
}

async function exportToExcel() {
    showLoading();
    try {
        const data = await loadData();

        if (data.members.length === 0) {
            alert('目前沒有會員資料可導出');
            return;
        }

        const memberData = data.members.map(member => {
            const timeObj = secondsToTime(member.remainingSeconds);
            const levelText = member.level === 'legend' ? '傳說會員' :
                member.level === 'diamond' ? '鑽石會員' : '黃金會員';
            const platformText = member.platform === 'tiktok' ? 'TikTok' : 'YouTube';
            const statusText = member.remainingSeconds > 0 ? '生效中' : '已到期';

            return {
                '使用者名稱': member.username,
                '暱稱': member.nickname,
                '平台': platformText,
                'CODM UID': member.gameUID,
                '會員等級': levelText,
                '狀態': statusText,
                '剩餘時間': formatTimeDisplay(timeObj),
                '剩餘秒數': member.remainingSeconds,
                '兌換碼': member.activationCode,
                '加入日期': new Date(member.joinDate).toLocaleDateString('zh-TW'),
                '是否為管理員': member.isAdmin ? '是' : '否',
                '插隊次數': member.priorityQuota,
                '次數重置月份': member.quotaLastReset
            };
        });

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(memberData);
        XLSX.utils.book_append_sheet(wb, ws1, "會員資料");

        const codeData = data.activationCodes.map(code => {
            const levelText = code.level === 'legend' ? '傳說會員' :
                code.level === 'diamond' ? '鑽石會員' : '黃金會員';
            const timeObj = secondsToTime(code.seconds);

            return {
                '兌換碼': code.code,
                '會員等級': levelText,
                '時長': formatTimeDisplay(timeObj),
                '秒數': code.seconds,
                '狀態': code.used ? '已使用' : '未使用',
                '使用者': code.usedBy || '',
                '創建日期': new Date(code.createdDate).toLocaleDateString('zh-TW'),
                '使用日期': code.usedDate ? new Date(code.usedDate).toLocaleDateString('zh-TW') : ''
            };
        });

        const ws2 = XLSX.utils.json_to_sheet(codeData);
        XLSX.utils.book_append_sheet(wb, ws2, "兌換碼");

        const now = new Date();
        const fileName = `CODM會員資料_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.xlsx`;

        XLSX.writeFile(wb, fileName);

        await database.ref('lastBackupTime').set(new Date().toISOString());

    } catch (error) {
        console.error('備份失敗:', error);
        alert('備份失敗，請稍後再試');
    } finally {
        hideLoading();
    }
}

function startGlobalCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(async () => {
        await updateAllCountdowns();
    }, 1000);
}

async function updateAllCountdowns() {
    try {
        const data = await loadData();
        const now = Math.floor(Date.now() / 1000);
        let membersToUpdate = {}; // 使用物件來批次更新

        data.members.forEach(member => {
            const elapsed = now - member.lastUpdateTime;
            if (elapsed > 0 && member.remainingSeconds > 0) { // 只更新有剩餘時間的
                const oldRemaining = member.remainingSeconds;
                member.remainingSeconds = Math.max(0, member.remainingSeconds - elapsed);
                member.lastUpdateTime = now;
                
                // 只有在秒數真的改變時才標記更新
                if (oldRemaining !== member.remainingSeconds) {
                    membersToUpdate[member.username] = {
                        remainingSeconds: member.remainingSeconds,
                        lastUpdateTime: member.lastUpdateTime
                    };
                }
            }
        });

        // 批次更新
        if (Object.keys(membersToUpdate).length > 0) {
             // 分開更新，避免覆蓋 queue
            for (const username in membersToUpdate) {
                await database.ref('members/' + username).update(membersToUpdate[username]);
            }
        }

        // ... (更新 UI 的程式碼 ...)
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
                currentUser = member; // 保持本地 currentUser 同步
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
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    autoRefreshInterval = setInterval(async () => {
        const hasOpenModal = document.querySelector('.modal.active');
        const isLoading = document.getElementById('loadingOverlay').classList.contains('active');
        if (hasOpenModal || isLoading) {
            return;
        }

        if (currentPage === 'queue') {
            await refreshQueueOnly();
        }
    }, REFRESH_INTERVAL);
}

async function refreshQueueOnly() {
    try {
        const data = await loadData(); // loadData() 已包含排序
        const lang = getCurrentLang();
        const trans = translations[lang];

        if (!currentUser || !data.gameSession) {
            return;
        }

        const queueStatusElement = document.querySelector('.queue-status');
        if (queueStatusElement) {
            const myQueueIndex = data.queue.findIndex(q => q.username === currentUser.username);
            const myPosition = myQueueIndex + 1;

            const queueCardElement = document.querySelector('.queue-card');
            if (queueCardElement && !document.getElementById('prioritySwitch')) { // 只更新"已在排隊"的卡片
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
    
    // 【新增】顯示插隊圖示
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
`;
        }
    } catch (error) {
        console.error('刷新排隊失敗:', error);
    }
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function updateUserSection() {
    const userSection = document.getElementById('userSection');
    const lang = getCurrentLang();
    const trans = translations[lang];

    // 找到語言切換器
    const langSwitcher = userSection.querySelector('.lang-switcher');

    if (currentUser) {
        const levelText = currentUser.level === 'legend' ? trans.level_legend_simple :
            currentUser.level === 'diamond' ? trans.level_diamond_simple : trans.level_gold_simple;
        const levelClass = currentUser.level === 'legend' ? 'badge-legend' :
            currentUser.level === 'diamond' ? 'badge-diamond' : 'badge-gold';

        userSection.innerHTML = `
        <div class="user-info">
            <div class="avatar">${currentUser.nickname.charAt(0)}</div>
            <span class="name">${currentUser.nickname}</span>
            <span class="badge ${levelClass}">${levelText}</span>
            ${currentUser.isAdmin ? `<span class="badge-admin">${trans.member_admin}</span>` : ''}
        </div>
        ${currentUser.isAdmin ? `<a href="admin.html" class="btn btn-small" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);" data-lang-key="admin_panel">${trans.admin_panel}</a>` : ''}
        <button class="btn btn-danger btn-small" onclick="logout()" data-lang-key="logout">${trans.logout}</button>
        `;
        // 把語言切換器加回來
        if (langSwitcher) {
            userSection.prepend(langSwitcher);
        }
    } else {
        userSection.innerHTML = `
        <button class="btn btn-small" onclick="openLoginModal()" data-lang-key="login">${trans.login}</button>
        <button class="btn btn-success btn-small" onclick="openRegisterModal()" data-lang-key="register">${trans.register}</button>
        `;
        // 把語言切換器加回來
        if (langSwitcher) {
            userSection.prepend(langSwitcher);
        }
    }
}

function showPage(pageName) {
    currentPage = pageName;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(pageName).classList.add('active');

    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab, index) => {
        if ((pageName === 'home' && tab.getAttribute('onclick') === "showPage('home')") ||
            (pageName === 'queue' && tab.getAttribute('onclick') === "showPage('queue')") ||
            (pageName === 'member' && tab.getAttribute('onclick') === "showPage('member')")) {
            tab.classList.add('active');
        }
    });
    // 處理 "查看方案" 按鈕的 active 狀態
    const plansTab = document.querySelector('.tab[href="member.html"]');
    if (plansTab) plansTab.classList.remove('active');


    if (pageName === 'member') {
        showMemberInfo();
        startAutoRefresh();
    } else if (pageName === 'queue') {
        showQueuePage();
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
}

function openLoginModal() {
    document.getElementById('loginModal').classList.add('active');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

function openRegisterModal() {
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
    document.getElementById('regSecurityQuestion').value = '';
    document.getElementById('regSecurityAnswer').value = '';
}

function openChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('active');
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('active');
    document.getElementById('currentPassword').value = '';
    document.getElementById('changeNewPassword').value = '';
    document.getElementById('changeConfirmPassword').value = '';
}

function openForgotPasswordModal() {
    closeLoginModal();
    document.getElementById('forgotPasswordModal').classList.add('active');
    document.getElementById('securityQuestionSection').style.display = 'none';
    document.getElementById('resetPasswordSection').style.display = 'none';
    document.getElementById('forgotUsername').value = '';
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.remove('active');
    forgotPasswordUser = null;
}

function closeEditMemberModal() {
    document.getElementById('editMemberModal').classList.remove('active');
    editingMember = null;
}

// 【已修改】 包含插隊次數邏輯 + 註冊後自動跳轉登入
async function register() {
    const activationCode = document.getElementById('regActivationCode').value.trim().toUpperCase();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const confirmPassword = document.getElementById('regConfirmPassword').value.trim();
    const platform = document.getElementById('regPlatform').value;
    let nickname = document.getElementById('regNickname').value.trim();
    const gameUID = document.getElementById('regGameUID').value.trim();
    const securityQuestion = document.getElementById('regSecurityQuestion').value;
    const securityAnswer = document.getElementById('regSecurityAnswer').value.trim();

    const lang = getCurrentLang();
    const trans = translations[lang];

    if (!nickname) {
        nickname = username;
    }

    if (!activationCode || !username || !password || !confirmPassword || !gameUID || !securityQuestion || !securityAnswer) {
        alert(trans.alert_fill_form);
        return;
    }

    if (password.length < 6) {
        alert(trans.alert_password_short);
        return;
    }

    if (password !== confirmPassword) {
        alert(trans.alert_password_mismatch);
        return;
    }

    showLoading();
    try {
        const data = await loadData();

        const codeIndex = data.activationCodes.findIndex(c => c.code === activationCode);
        if (codeIndex === -1) {
            alert(trans.alert_code_not_exist);
            hideLoading();
            return;
        }

        if (data.activationCodes[codeIndex].used) {
            alert(trans.alert_code_used);
            hideLoading();
            return;
        }

        if (data.members.find(m => m.username === username)) {
            alert(trans.alert_user_exist);
            hideLoading();
            return;
        }

        const codeData = data.activationCodes[codeIndex];
        const passwordHash = await hashPassword(password);
        const now = Math.floor(Date.now() / 1000);
        const currentMonth = new Date().toISOString().slice(0, 7); // 格式: YYYY-MM

        // 【新增】根據會員等級設定插隊次數
        let initialQuota = 0;
        if (codeData.level === 'legend') {
            initialQuota = 5;
        } else if (codeData.level === 'diamond') {
            initialQuota = 2;
        }

        const newMember = {
            username,
            passwordHash,
            platform,
            nickname,
            gameUID,
            level: codeData.level,
            securityQuestion,
            securityAnswer: securityAnswer.toLowerCase(),
            joinDate: new Date().toISOString(),
            remainingSeconds: codeData.seconds,
            lastUpdateTime: now,
            activationCode: activationCode,
            isAdmin: false,
            // 【新增】插隊相關欄位
            priorityQuota: initialQuota,
            quotaLastReset: currentMonth
        };

        data.activationCodes[codeIndex].used = true;
        data.activationCodes[codeIndex].usedBy = username;
        data.activationCodes[codeIndex].usedDate = new Date().toISOString();

        data.members.push(newMember);
        await saveData(data.members, data.activationCodes, data.queue, data.gameSession);

        alert(trans.alert_register_success);
        closeRegisterModal();

        // --- ▼▼▼ 這就是你要求的新功能 ▼▼▼ ---
        // 1. 自動開啟登入視窗
        openLoginModal();
        
        // 2. (貼心功能) 自動填入剛註冊的使用者名稱
        document.getElementById('loginUsername').value = username;
        // --- ▲▲▲ 新功能結束 ▲▲▲ ---

    } catch (error) {
        console.error('註冊失敗:', error);
        alert(trans.alert_register_fail);
    } finally {
        hideLoading();
    }
}

// 【已修改】 包含插隊次數重置邏輯
async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    const lang = getCurrentLang();
    const trans = translations[lang];

    if (!username || !password) {
        alert(trans.alert_input_prompt);
        return;
    }

    showLoading();
    try {
        const data = await loadData();
        const passwordHash = await hashPassword(password);
        let member = data.members.find(m => m.username === username && m.passwordHash === passwordHash);

        if (!member) {
            alert(trans.alert_login_wrong);
            hideLoading();
            return;
        }

        // 【新增】檢查並重置插隊次數
        member = await checkAndResetQuota(member);

        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - member.lastUpdateTime;
        member.remainingSeconds = Math.max(0, member.remainingSeconds - elapsed);
        member.lastUpdateTime = now;

        // 【修改】只更新時間，因為次數已在 checkAndResetQuota 中更新
        await database.ref('members/' + member.username).update({
             remainingSeconds: member.remainingSeconds,
             lastUpdateTime: member.lastUpdateTime
        });

        currentUser = member;
        sessionStorage.setItem('currentUser', member.username);

        let alertMsg = trans.alert_login_success;
        if(member.isAdmin) {
            alertMsg += `\n${trans.alert_admin_privilege}`;
        }
        alert(alertMsg);

        closeLoginModal();
        updateUserSection();

        if (currentPage === 'member' && isAdmin()) {
            showMemberInfo();
        }
    } catch (error) {
        console.error('登入失敗:', error);
        alert(trans.alert_login_fail);
    } finally {
        hideLoading();
    }
}

async function logout() {
    sessionStorage.removeItem('currentUser');
    const lang = getCurrentLang();
    const trans = translations[lang];

    if (currentUser) {
        showLoading();
        try {
            // 只更新登出使用者的時間
            const memberRef = database.ref('members/' + currentUser.username);
            const snapshot = await memberRef.once('value');
            if (snapshot.exists()) {
                const member = snapshot.val();
                const now = Math.floor(Date.now() / 1000);
                const elapsed = now - member.lastUpdateTime;
                const newRemainingSeconds = Math.max(0, member.remainingSeconds - elapsed);
                
                await memberRef.update({
                    remainingSeconds: newRemainingSeconds,
                    lastUpdateTime: now
                });
            }
        } catch (error) {
            console.error('登出時儲存失敗:', error);
        } finally {
            hideLoading();
        }
    }

    currentUser = null;
    updateUserSection();
    alert(trans.alert_logout);
    showPage('home');
}

async function checkSecurityQuestion() {
    const username = document.getElementById('forgotUsername').value.trim();

    if (!username) {
        alert('請輸入使用者名稱'); // 這個 alert 也需要翻譯，但我先專注於主要功能
        return;
    }

    showLoading();
    try {
        const data = await loadData();
        const member = data.members.find(m => m.username === username);

        if (!member) {
            alert('找不到此使用者');
            hideLoading();
            return;
        }

        forgotPasswordUser = member;
        // 動態翻譯安全問題
        const lang = getCurrentLang();
        const trans = translations[lang];
        const qKey = 'sec_q_' + member.securityQuestion;
        document.getElementById('displaySecurityQuestion').value = trans[qKey] || securityQuestions[member.securityQuestion];
        
        document.getElementById('securityQuestionSection').style.display = 'block';
    } catch (error) {
        console.error('檢查安全問題失敗:', error);
        alert('操作失敗，請稍後再試');
    } finally {
        hideLoading();
    }
}

function verifySecurityAnswer() {
    const answer = document.getElementById('securityAnswer').value.trim().toLowerCase();

    if (!answer) {
        alert('請輸入答案');
        return;
    }

    if (answer === forgotPasswordUser.securityAnswer) {
        alert('驗證成功！請設定新密碼');
        document.getElementById('securityQuestionSection').style.display = 'none';
        document.getElementById('resetPasswordSection').style.display = 'block';
    } else {
        alert('答案錯誤，請重新輸入');
    }
}

async function resetPassword() {
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmNewPassword = document.getElementById('confirmNewPassword').value.trim();

    if (!newPassword || !confirmNewPassword) {
        alert('請填寫完整資訊');
        return;
    }

    if (newPassword.length < 6) {
        alert('密碼至少需要6個字元');
        return;
    }

    if (newPassword !== confirmNewPassword) {
        alert('兩次輸入的密碼不一致');
        return;
    }

    showLoading();
    try {
        const newPasswordHash = await hashPassword(newPassword);
        // 只更新密碼
        await database.ref('members/' + forgotPasswordUser.username).update({
            passwordHash: newPasswordHash
        });

        alert('密碼重設成功！請使用新密碼登入');
        closeForgotPasswordModal();
    } catch (error) {
        console.error('重設密碼失敗:', error);
        alert('重設密碼失敗，請稍後再試');
    } finally {
        hideLoading();
    }
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value.trim();
    const newPassword = document.getElementById('changeNewPassword').value.trim();
    const confirmPassword = document.getElementById('changeConfirmPassword').value.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('請填寫完整資訊');
        return;
    }

    if (newPassword.length < 6) {
        alert('新密碼至少需要6個字元');
        return;
    }

    if (newPassword !== confirmPassword) {
        alert('兩次輸入的新密碼不一致');
        return;
    }

    showLoading();
    try {
        const currentPasswordHash = await hashPassword(currentPassword);
        if (currentPasswordHash !== currentUser.passwordHash) {
            alert('目前密碼錯誤');
            hideLoading();
            return;
        }

        const newPasswordHash = await hashPassword(newPassword);
        // 只更新密碼
        await database.ref('members/' + currentUser.username).update({
            passwordHash: newPasswordHash
        });

        currentUser.passwordHash = newPasswordHash;

        alert('密碼更改成功！');
        closeChangePasswordModal();
    } catch (error) {
        console.error('更改密碼失敗:', error);
        alert('更改密碼失敗，請稍後再試');
    } finally {
        hideLoading();
    }
}

// 【新增】檢查並重置插隊次數的函數
async function checkAndResetQuota(member) {
    const currentMonth = new Date().toISOString().slice(0, 7); // 格式: YYYY-MM
    
    // 檢查上次重置月份是否與本月不同
    if (member.quotaLastReset !== currentMonth && !member.isAdmin) { // 管理員不重置
        console.log(`為 ${member.username} 重置插隊次數...`);
        
        let newQuota = 0;
        if (member.level === 'legend') {
            newQuota = 5;
        } else if (member.level === 'diamond') {
            newQuota = 2;
        }
        
        // 更新會員物件
        member.priorityQuota = newQuota;
        member.quotaLastReset = currentMonth;
        
        // 立刻存回資料庫
        try {
            await database.ref('members/' + member.username).update({
                priorityQuota: newQuota,
                quotaLastReset: currentMonth
            });
            console.log(`... ${member.username} 次數已重置為 ${newQuota}`);
        } catch (error) {
            console.error('重置次數失敗:', error);
        }
    }
    return member; // 回傳 (可能已更新的) 會員物件
}

// ▼▼▼ 已修改，支援多語言 ▼▼▼
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
        // 從資料庫重新獲取最新資料，確保時間和次數是準確的
        const snapshot = await database.ref('members/' + currentUser.username).once('value');
        if (!snapshot.exists()) {
            alert('錯誤：找不到您的會員資料，請重新登入');
            logout();
            return;
        }
        
        let updatedUser = snapshot.val();
        updatedUser.username = currentUser.username; // 補上 username
        
        // 檢查次數
        updatedUser = await checkAndResetQuota(updatedUser);
        
        // 更新時間
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - updatedUser.lastUpdateTime;
        if (elapsed > 0 && updatedUser.remainingSeconds > 0) {
            updatedUser.remainingSeconds = Math.max(0, updatedUser.remainingSeconds - elapsed);
            updatedUser.lastUpdateTime = now;
            // 寫回更新後的時間
            await database.ref('members/' + updatedUser.username).update({
                remainingSeconds: updatedUser.remainingSeconds,
                lastUpdateTime: updatedUser.lastUpdateTime
            });
        }
        
        currentUser = updatedUser; // 保持本地資料最新

        const levelKey = currentUser.level === 'legend' ? 'level_legend' :
            currentUser.level === 'diamond' ? 'level_diamond' : 'level_gold';
        const levelText = trans[levelKey];

        const badgeClass = currentUser.level === 'legend' ? 'badge-legend' :
            currentUser.level === 'diamond' ? 'badge-diamond' : 'badge-gold';

        const platformText = currentUser.platform === 'tiktok' ? 'TikTok' : 'YouTube';
        const timeObj = secondsToTime(currentUser.remainingSeconds);
        const timeClass = getTimeColorClass(currentUser.remainingSeconds);

        // 查找兌換碼資料 (非關鍵，可以慢一點)
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

// ▼▼▼ 已修改，支援多語言和插隊開關 ▼▼▼
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
        // 【修改】也檢查並更新當前用戶的次數 (以防萬一)
        // 確保 currentUser 是最新的
        const snapshot = await database.ref('members/' + currentUser.username).once('value');
        if (snapshot.exists()) {
             let updatedUser = snapshot.val();
             updatedUser.username = currentUser.username;
             currentUser = await checkAndResetQuota(updatedUser);
        }

        const data = await loadData(); // data.queue 已排序

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

        // 【新增】插隊次數顯示文字
        const quotaText = (trans.queue_priority_quota || '本月剩餘 <span>{0}</span> 次權限')
                            .replace('{0}', currentUser.priorityQuota);
        
        // 【新增】開關的 onchange 事件
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
        
        // 【新增】顯示插隊圖示
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

// 【已修改】 包含插隊次數扣除邏輯 + 確認視窗
async function joinQueue() {
    showLoading();
    
    const lang = getCurrentLang();
    const trans = translations[lang];

    // 檢查開關狀態和優先級
    const switchElement = document.getElementById('prioritySwitch');
    const usePriority = switchElement ? switchElement.checked : false;
    
    let priorityLevel = 0; // 0 = 一般

    if (usePriority) {
        if (currentUser.priorityQuota <= 0) {
            alert(trans.queue_priority_no_quota || '您的優先排隊權限已用完');
            switchElement.checked = false; // 關掉開關
            togglePriorityGlow(false, 0); // 關掉光暈
            hideLoading();
            return;
        }
        
        // 【新增】確認視窗
        const confirmMsg = trans.alert_priority_confirm || '確定要使用 1 次優先排隊權限嗎？';
        if (!confirm(confirmMsg)) {
            hideLoading(); // 用戶取消，隱藏 loading
            return;      // 中斷執行
        }
        
        // 傳說 = 2, 鑽石 = 1
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
            priorityLevel: priorityLevel // 【新增】儲存優先級
        };

        // 寫入排隊資料
        await database.ref('queue/' + currentUser.username).set(queueItem);

        // 【新增】如果使用了插隊，則扣除次數
        if (usePriority) {
            currentUser.priorityQuota -= 1; // 1. 更新本地物件
            // 2. 更新資料庫
            await database.ref('members/' + currentUser.username + '/priorityQuota').set(currentUser.priorityQuota);
        }

        alert(trans.alert_join_queue_success);
        showQueuePage(); // 重新整理頁面 (會自動顯示正確順位)
    } catch (error) {
        console.error('加入排隊失敗:', error);
        alert(trans.alert_join_queue_fail);
    } finally {
        hideLoading();
    }
}


// 【已修改】 使用原子操作 .remove()
async function leaveQueue() {
    // 取得當前語言的翻譯
    const lang = getCurrentLang();
    const trans = translations[lang];

    // 1. 確認視窗
    if (!confirm(trans.alert_leave_queue_confirm || '確定要離開排隊嗎？')) {
        return;
    }

    showLoading();
    try {
        // 【修正點】
        // 原本是 loadData() -> filter -> saveData()
        // 改成使用 .remove() 進行原子刪除，只刪除你自己的節點
        await database.ref('queue/' + currentUser.username).remove();
        // -----------------------------------------------------------------

        alert(trans.alert_leave_queue_success || '已離開排隊');
        await showQueuePage(); // 重新整理 UI
    } catch (error) {
        console.error('離開排隊失敗:', error);
        alert(trans.alert_leave_queue_fail || '離開排隊失敗，請稍後再試');
    } finally {
        hideLoading();
    }
}


function showCodeSubTab(tabName) {
}

function showMemberSubTab(tabName) {
}

async function showAdminPanel() {
}

async function generateCode() {
}

async function deleteCode(code) {
}

async function createGameSession() {
}

async function closeGameSession() {
}

async function removeFromQueue(username) {
}

async function clearQueue() {
}

async function openEditMember(username) {
}

function adjustTime(days, hours, minutes, seconds, months, years) {
}

async function saveMemberEdit() {
}

async function deleteMember(username) {
}

// 【新增】控制按鈕光暈的函數
function togglePriorityGlow(isON, quota) {
    const btn = document.getElementById('btnJoinQueue');
    const lang = getCurrentLang();
    const trans = translations[lang];

    if (btn) {
        if (isON && quota > 0) {
            btn.classList.add('priority-glow');
            // 你也可以在這裡改變按鈕文字
            // btn.innerHTML = `🔥 ${trans.queue_priority_join_button || '優先排隊'}`;
        } else {
            btn.classList.remove('priority-glow');
            // 恢復按鈕文字
            btn.innerHTML = `${trans.queue_join_button || '一鍵排隊'}`;
        }
    }
}

async function toggleAdminStatus(username) {
}

async function validateSessionUser(username, retries = 3, delay = 500) {
    if (!username) return null;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[Session] 嘗試第 ${i + 1} 次驗證: ${username}`);
            // 直接抓取該用戶的資料
            const snapshot = await database.ref('members/' + username).once('value');
            if (snapshot.exists()) {
                console.log('[Session] 驗證成功');
                let member = snapshot.val();
                member.username = username; // 補上 username
                return member;
            }
            if (i === retries - 1) {
                console.log('[Session] 找不到用戶，驗證失敗');
                return null;
            }
        } catch (error) {
            console.error(`[Session] 驗證時載入失敗:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
    console.log('[Session] 重試次數用盡，驗證失敗');
    return null;
}

// 【已修改】 包含插隊次數重置邏輯
async function initialize() {
    showLoading();
    try {
        await initializeDefaultAdmin();

        const loggedInUsername = sessionStorage.getItem('currentUser');
        
        if (loggedInUsername) {
            let member = await validateSessionUser(loggedInUsername);

            if (member) {
                // 【新增】檢查並重置插隊次數
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
        // 初始化完成後，最後再跑一次語言設定
        document.dispatchEvent(new Event('DOMContentLoaded'));
    }
}


console.log('⏳ 等待 Firebase 認證...');


// 
//
// --- 翻譯邏輯 ---
//
//

// 輔助函數：獲取當前語言
function getCurrentLang() {
    return localStorage.getItem('language') || 'zh';
}

// 語言翻譯字典
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
        // --- 新增的動態金鑰 ---
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
        // 【新增翻譯】
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
        // --- 新增的動態金鑰 ---
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
        // 【新增翻譯】
        'queue_priority_switch': 'Priority Queue',
        'queue_priority_quota': '<span>{0}</span> priority credits left this month',
        'queue_priority_no_quota': 'You have no priority queue credits left',
        'alert_priority_confirm': 'Are you sure you want to use 1 priority queue credit?'
    }
};

// 負責切換語言的函數
function setLanguage(lang) {
    // 1. 保存用戶偏好
    localStorage.setItem('language', lang);

    // 2. 更新按鈕的 .active 狀態
    document.querySelectorAll('.btn-lang').forEach(btn => {
        if (btn.getAttribute('onclick') === `setLanguage('${lang}')`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 3. 翻譯所有帶 data-lang-key 的元素
    const langDict = translations[lang];
    document.querySelectorAll('[data-lang-key]').forEach(el => {
        const key = el.dataset.langKey;
        const translation = langDict[key];

        if (translation === undefined) {
            console.warn(`Missing translation for key: ${key} in lang: ${lang}`);
            return;
        }

        // 根據不同標籤類型賦值
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = translation;
        } else if (key === 'home_step_1') { // 處理有 <strong> 的特殊情況
            el.innerHTML = translation;
        } else {
            // 檢查是否為按鈕 (BTN) 或連結 (A)
            if (el.tagName === 'BUTTON' || el.tagName === 'A') {
                // 保留按鈕/連結前的圖示 (如果有的話)
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

    // 4. 動態翻譯登入後的按鈕 (如果存在)
    updateUserSection(); // 重新整理 user section 就會自動翻譯
    
    // 5. 如果剛好在 '我的會員' 或 '排隊系統' 頁面，重新整理該頁面
    if (currentPage === 'member' && currentUser) {
        showMemberInfo();
    } else if (currentPage === 'queue' && currentUser) {
        showQueuePage();
    }
}

// 頁面載入時，自動套用儲存的語言
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('language') || 'zh'; // 預設為中文
    setLanguage(savedLang);
});
</script>