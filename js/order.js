const rawOrderData = sessionStorage.getItem('pendingOrder');
const orderData = rawOrderData ? JSON.parse(rawOrderData) : null;

const orderTitle = document.getElementById('orderTitle');
const orderSubtitle = document.getElementById('orderSubtitle');
const orderTotal = document.getElementById('orderTotal');
const orderList = document.getElementById('orderList');
const orderNote = document.getElementById('orderNote');
const lineNameInput = document.getElementById('lineNameInput');
const lineNamePreview = document.getElementById('lineNamePreview');
const downloadBtn = document.getElementById('downloadBtn');
const backHomeBtn = document.getElementById('backHomeBtn');

function updateDownloadState() {
    const hasLineName = Boolean(lineNameInput.value.trim());
    downloadBtn.classList.toggle('is-disabled', !hasLineName);
}

function getOrderValueClass(label, value) {
    const labelText = String(label || '');
    const valueText = String(value || '');

    if (labelText.includes('會員方案') || valueText.includes('會員')) {
        if (valueText.includes('傳說')) return 'order-value-tag order-value-member-legend';
        if (valueText.includes('鑽石')) return 'order-value-tag order-value-member-diamond';
        if (valueText.includes('黃金')) return 'order-value-tag order-value-member-gold';
    }

    if (valueText.includes('代打')) return 'order-value-service-boost';
    if (valueText.includes('護航')) return 'order-value-service-escort';

    return '';
}

function renderOrder() {
    // 生成訂單編號與時間（不依賴 orderData）
    const orderNumEl = document.getElementById('orderNumber');
    const orderTimeEl = document.getElementById('orderTime');
    if (orderNumEl) {
        orderNumEl.textContent = 'ORD-' + Date.now().toString(36).toUpperCase().slice(-8);
    }
    if (orderTimeEl) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        orderTimeEl.textContent = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    if (!orderData) {
        orderTitle.textContent = '找不到訂單資料';
        orderSubtitle.textContent = '請從首頁重新建立訂單。';
        orderTotal.textContent = '--';
        orderNote.textContent = '目前沒有可顯示的訂單內容。';
        orderList.innerHTML = '<div class="order-row"><span>狀態</span><span>請返回首頁重新操作</span></div>';
        downloadBtn.disabled = true;
        downloadBtn.style.opacity = '0.5';
        downloadBtn.style.cursor = 'not-allowed';
        return;
    }

    orderTitle.textContent = orderData.title || '訂單確認';
    orderSubtitle.textContent = orderData.subtitle || '';
    orderTotal.textContent = orderData.total || 'NT$0';
    orderNote.textContent = orderData.note || '';

    orderList.innerHTML = '';
    (orderData.items || []).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'order-row';
        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;

        const valueSpan = document.createElement('span');
        valueSpan.textContent = item.value;
        const valueClass = getOrderValueClass(item.label, item.value);
        if (valueClass) valueSpan.className = valueClass;

        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        orderList.appendChild(row);
    });
}

lineNameInput.addEventListener('input', () => {
    const value = lineNameInput.value.trim();
    lineNamePreview.textContent = value || '未填寫';
    updateDownloadState();
});

backHomeBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const confirmed = confirm('返回主頁後，系統不會保留你的動作，確定要返回嗎？');
    if (!confirmed) return;
    sessionStorage.removeItem('pendingOrder');
    window.location.href = 'index.html';
});

downloadBtn.addEventListener('click', async () => {
    if (!lineNameInput.value.trim()) {
        alert('LINE 名稱要填寫後，才能下載 JPG。');
        lineNameInput.focus();
        updateDownloadState();
        return;
    }

    // 建立訂單確認文字
    const orderNumText = document.getElementById('orderNumber').textContent;
    const orderTimeText = document.getElementById('orderTime').textContent;
    const totalText = orderTotal.textContent;
    const lineText = lineNameInput.value.trim();

    const lines = [
        '═════ 請確認以下訂單資訊 ═════',
        `訂單編號：${orderNumText}`,
        `建單時間：${orderTimeText}`,
        '',
        `方案：${orderTitle.textContent}`,
    ];
    if (orderData && orderData.items) {
        orderData.items.forEach(item => lines.push(`${item.label}：${item.value}`));
    }
    lines.push('');
    lines.push(`應付金額：${totalText}`);
    lines.push(`LINE 名稱：${lineText}`);
    lines.push('');
    lines.push('確認後將下載訂單 JPG，請將圖片傳送至官方 LINE 完成付款。');

    const confirmed = confirm(lines.join('\n'));
    if (!confirmed) return;

    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = '✅ 確認下載';
    downloadBtn.classList.add('is-disabled');

    const captureArea = document.getElementById('captureArea');
    const canvas = await html2canvas(captureArea, {
        backgroundColor: '#07101f',
        scale: 2,
        useCORS: true
    });

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const datePart = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const fileName = `${orderNumText}_${datePart}-${timePart}.jpg`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();

    downloadBtn.textContent = originalText;
    downloadBtn.classList.remove('is-disabled');
});

renderOrder();
updateDownloadState();
