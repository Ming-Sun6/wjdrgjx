const WJDR_API_PREFIX = (typeof window !== 'undefined' && window.__WJDR_GIFTCODE_API_PREFIX__) || '';
function wjdrApi(path) {
    return `${WJDR_API_PREFIX}${path}`;
}

const accountInput = document.getElementById('account-id');
const addAccountBtn = document.getElementById('add-account-btn');
const delAccountBtn = document.getElementById('del-account-btn');
const redeemAllBtn = document.getElementById('redeem-all-btn');
const redeemAllBtn2 = document.getElementById('redeem-all-btn2');
const manualAccountInput = document.getElementById('manual-account-id');
const redeemCodeInput = document.getElementById('redeem-code');
const redeemBtn = document.getElementById('redeem-btn');
const exchangeList = document.getElementById('exchange-list');
const codeList = document.getElementById('code-list');
const loadMoreBtn = document.getElementById('load-more-btn');
const themeToggle = document.querySelector('.input__check');
const refreshExchange = document.getElementById('refresh-exchange');
const refreshCodes = document.getElementById('refresh-codes');
const messageModal = document.getElementById('message-modal');
const messageTitle = document.getElementById('message-title');
const messageContent = document.getElementById('message-content');
const messageIcon = document.getElementById('message-icon');
const messageOk = document.getElementById('message-ok');
let messageResolve;
let currentPage = 1;
const pageSize = 10;
let displayedRecords = [];
let redeemCodes = [];

function showMessage(message, title = '提示', type = 'info') {
    messageTitle.textContent = title;
    messageContent.textContent = message;

    switch (type) {
        case 'success':
            messageIcon.className = 'fas fa-check-circle text-green-600 dark:text-green-400';
            messageIcon.parentElement.className = messageIcon.parentElement.className.replace('bg-blue-100', 'bg-green-100').replace('dark:bg-blue-900', 'dark:bg-green-900');
            break;
        case 'error':
            messageIcon.className = 'fas fa-exclamation-circle text-red-600 dark:text-red-400';
            messageIcon.parentElement.className = messageIcon.parentElement.className.replace('bg-blue-100', 'bg-red-100').replace('dark:bg-blue-900', 'dark:bg-red-900');
            break;
        case 'warning':
            messageIcon.className = 'fas fa-exclamation-triangle text-yellow-600 dark:text-yellow-400';
            messageIcon.parentElement.className = messageIcon.parentElement.className.replace('bg-blue-100', 'bg-yellow-100').replace('dark:bg-blue-900', 'dark:bg-yellow-900');
            break;
        default:
            messageIcon.className = 'fas fa-info-circle text-blue-600 dark:text-blue-400';
            messageIcon.parentElement.className = 'flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center';
    }

    messageModal.classList.remove('hidden');

    return new Promise((resolve) => {
        messageResolve = resolve;
    });
}

messageOk.addEventListener('click', function () {
    messageModal.classList.add('hidden');
    if (messageResolve) {
        messageResolve(true);
    }
});

messageModal.addEventListener('click', function (e) {
    if (e.target === messageModal) {
        messageModal.classList.add('hidden');
        if (messageResolve) {
            messageResolve(true);
        }
    }
});

async function getSignedUrl(data, post = null) {
    const signer = new ApiSigner();
    return await signer.generateSignature(data, post);
}

async function parseJsonResponse(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        const hint = text.trim().startsWith('<') ? '（服务器返回了 HTML 页面，请确认 Flask 已启动且 Redis/MySQL 正常）' : '';
        throw new Error(`响应不是 JSON，HTTP ${res.status}${hint}`);
    }
}

async function getGiftCode(page, size) {
    page = page || 1;
    size = size || 20;

    try {
        const params = {
            page: page,
            size: size
        };
        let signature = await getSignedUrl(params);
        let url = `${wjdrApi('/api/r/getGiftCode')}${signature.url}`;
        const res = await fetch(url, {
            method: 'GET',
        });

        return await parseJsonResponse(res);

    } catch (error) {
        await showMessage(`获取近期兑换失败，原因：${String(error)}`, '失败', 'error');
        return {data: [], has_next: false};
    }
}

async function giftCode(accountId, code) {
    if (!accountId || !code) {
        showToast('请输入正确的账号和兑换码', 'error');
        return undefined;
    }

    try {
        const data = {
            fid: accountId,
            cdk: code
        };

        let signature = await getSignedUrl(null, data);
        let url = `${wjdrApi('/api/giftCode')}${signature.url}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
        });

        return await parseJsonResponse(res);

    } catch (error) {
        await showMessage(`兑换失败，原因：${String(error)}`, '失败', 'error');
        return undefined;
    }
}

async function giftCodeAll(accountId, t='0') {
    if (!accountId) {
        showToast('请输入正确的账号', 'error');
        return undefined;
    }

    try {
        const data = {
            fid: accountId,
            type: t
        };

        let signature = await getSignedUrl(null, data);
        let url = `${wjdrApi('/api/giftCodeAll')}${signature.url}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
        });
        return await parseJsonResponse(res);
    } catch (error) {
        await showMessage(`兑换失败，原因：${String(error)}`, '请求失败', 'error');
        return undefined;
    }
}

async function delUser(accountId) {
    if (!accountId) {
        showToast('请输入正确的账号', 'error');
        return undefined;
    }

    try {
        const data = {
            fid: accountId
        };

        let signature = await getSignedUrl(null, data);
        let url = `${wjdrApi('/api/delUser')}${signature.url}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
        });

        return await parseJsonResponse(res);
    } catch (error) {
        await showMessage(`删除失败，原因：${String(error)}`, '请求失败', 'error');
        return undefined;
    }
}

async function addUser(accountId) {
    if (!accountId) {
        showToast('请输入正确的账号', 'error');
        return undefined;
    }

    try {
        const data = {
            fid: accountId
        };

        let signature = await getSignedUrl(null, data);
        let url = `${wjdrApi('/api/addUser')}${signature.url}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
        });

        return await parseJsonResponse(res);
    } catch (error) {
        await showMessage(`添加失败，原因：${String(error)}`, '请求失败', 'error');
        return undefined;
    }
}

async function getGiftCodeAll() {
    try {
        let signature = await getSignedUrl(null);
        let url = `${wjdrApi('/api/getGiftCode')}${signature.url}`;

        const res = await fetch(url, {
            method: 'GET',
        });

        return await parseJsonResponse(res);

    } catch (error) {
        await showMessage(`获取兑换码列表失败，原因：${String(error)}`, '失败', 'error');
        return {data: []};
    }
}

function updateThemeToggle(isDarkMode, saveToStorage = true) {
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
        if (themeToggle) {
            themeToggle.checked = true;
            themeToggle.setAttribute('checked', 'checked');
        }
        if (saveToStorage) {
            localStorage.setItem('theme', 'dark');
        }
    } else {
        document.documentElement.classList.remove('dark');
        if (themeToggle) {
            themeToggle.checked = false;
            themeToggle.removeAttribute('checked');
        }
        if (saveToStorage) {
            localStorage.setItem('theme', 'light');
        }
    }
}

const playerAddcodeOpen = document.getElementById('player-addcode-open');
const playerAddcodeModal = document.getElementById('player-addcode-modal');
const playerAddcodeClose = document.getElementById('player-addcode-close');
const playerCodeInput = document.getElementById('player-code-input');
const playerExpiryDate = document.getElementById('player-expiry-date');
const playerExpiryContainer = document.getElementById('player-expiry-container');
const playerSubmitAddcode = document.getElementById('player-submit-addcode');
const playerTypeOptions = document.querySelectorAll('.player-type-option');
const playerCodeTypeRadios = document.querySelectorAll('input[name="player-code-type"]');

async function submitGiftCode(code, type = '0', endTime = '') {
    try {
        const data = { cdk: code, type: type, endTime: endTime || '' };
        const signature = await getSignedUrl(null, data);
        const url = `${wjdrApi('/api/submitGiftCode')}${signature.url}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return await parseJsonResponse(res);
    } catch (error) {
        return { code: -1, msg: String(error) };
    }
}

function validatePlayerAddcodeForm() {
    if (!playerCodeInput || !playerSubmitAddcode) return;
    let selectedType = '0';
    playerCodeTypeRadios.forEach(radio => {
        if (radio.checked) selectedType = radio.value;
    });
    const code = playerCodeInput.value.trim();
    let isValid = code.length > 0;
    if (selectedType === '1') {
        isValid = isValid && playerExpiryDate && playerExpiryDate.value;
    }
    playerSubmitAddcode.disabled = !isValid;
}

function openPlayerAddcodeModal() {
    if (!playerAddcodeModal) return;
    if (playerCodeInput) playerCodeInput.value = '';
    if (playerExpiryDate) playerExpiryDate.value = '';
    if (playerCodeTypeRadios[0]) playerCodeTypeRadios[0].checked = true;
    if (playerExpiryContainer) playerExpiryContainer.classList.add('hidden');
    playerTypeOptions.forEach((opt, i) => {
        opt.classList.toggle('border-primary-500', i === 0);
        opt.classList.toggle('border-slate-200', i !== 0);
        opt.classList.toggle('dark:border-slate-700', i !== 0);
    });
    validatePlayerAddcodeForm();
    playerAddcodeModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => playerCodeInput && playerCodeInput.focus(), 100);
}

function closePlayerAddcodeModal() {
    if (!playerAddcodeModal) return;
    playerAddcodeModal.classList.add('hidden');
    document.body.style.overflow = '';
}

if (playerAddcodeOpen) {
    playerAddcodeOpen.addEventListener('click', openPlayerAddcodeModal);
}
if (playerAddcodeClose) {
    playerAddcodeClose.addEventListener('click', closePlayerAddcodeModal);
}
if (playerAddcodeModal) {
    playerAddcodeModal.addEventListener('click', e => {
        if (e.target === playerAddcodeModal) closePlayerAddcodeModal();
    });
}
if (playerCodeInput) {
    playerCodeInput.addEventListener('input', function () {
        this.value = this.value.toUpperCase().replace(/\s/g, '');
        validatePlayerAddcodeForm();
    });
}
if (playerExpiryDate) {
    playerExpiryDate.min = new Date().toISOString().split('T')[0];
    playerExpiryDate.addEventListener('change', validatePlayerAddcodeForm);
}
if (playerTypeOptions.length) {
    playerTypeOptions.forEach(option => {
        option.addEventListener('click', function () {
            const type = this.getAttribute('data-type');
            const radio = this.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            playerTypeOptions.forEach(opt => {
                opt.classList.remove('border-primary-500');
                opt.classList.add('border-slate-200', 'dark:border-slate-700');
            });
            this.classList.add('border-primary-500');
            this.classList.remove('border-slate-200', 'dark:border-slate-700');
            if (playerExpiryContainer) {
                if (type === '1') {
                    playerExpiryContainer.classList.remove('hidden');
                    if (playerExpiryDate && !playerExpiryDate.value) {
                        const d = new Date();
                        d.setDate(d.getDate() + 2);
                        playerExpiryDate.value = d.toISOString().split('T')[0];
                    }
                } else {
                    playerExpiryContainer.classList.add('hidden');
                }
            }
            validatePlayerAddcodeForm();
        });
    });
}
if (playerSubmitAddcode) {
    playerSubmitAddcode.addEventListener('click', async function () {
        const code = playerCodeInput ? playerCodeInput.value.trim() : '';
        let selectedType = '0';
        playerCodeTypeRadios.forEach(radio => {
            if (radio.checked) selectedType = radio.value;
        });
        const expiryDate = playerExpiryDate ? playerExpiryDate.value : '';
        if (!code) return;

        const originalHtml = playerSubmitAddcode.innerHTML;
        playerSubmitAddcode.disabled = true;
        playerSubmitAddcode.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中（约需数秒）...';

        try {
            const res = await submitGiftCode(code, selectedType, selectedType === '1' ? expiryDate : '');
            if (res === undefined) return;
            if (res.code === 0) {
                await showMessage(res.msg || '兑换码已添加', '成功', 'success');
                closePlayerAddcodeModal();
                if (refreshCodes) refreshCodes.click();
            } else {
                await showMessage(res.msg || '验证失败', '失败', 'error');
            }
        } catch (e) {
            showToast('请求失败', 'error');
        } finally {
            playerSubmitAddcode.innerHTML = originalHtml;
            validatePlayerAddcodeForm();
        }
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    const currentYearElement = document.getElementById('current-year');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear().toString();
    }

    await loadExchangeRecords(1);
    let result = await getGiftCodeAll();
    redeemCodes = result.data
    renderRedeemCodes(redeemCodes);
    updateExchangeCount();

    // 初始化主题
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        updateThemeToggle(true, false);
    } else if (savedTheme === 'light') {
        updateThemeToggle(false, false);
    } else {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            updateThemeToggle(true, false);
        } else {
            updateThemeToggle(false, false);
        }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (!localStorage.getItem('theme')) {
            updateThemeToggle(event.matches, false);
        }
    });

});

// 主题切换
if (themeToggle) {
    themeToggle.addEventListener('change', function () {
        const isDarkMode = this.checked;
        updateThemeToggle(isDarkMode, true);
    });
}

// 加载兑换记录
async function loadExchangeRecords(page) {
    let res = await getGiftCode(page, pageSize);

    if (page === 1) {
        displayedRecords = res.data;
    } else {
        displayedRecords = [...displayedRecords, ...res.data];
    }

    renderExchangeRecords(displayedRecords);

    if (res.pages.has_next === false) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = '没有更多数据';
        loadMoreBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = '加载更多';
        loadMoreBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    updateExchangeCount();
}

// 刷新兑换列表
if (refreshExchange) {
    refreshExchange.addEventListener('click', async function () {
        const icon = this.querySelector('i');
        icon.classList.add('spin');
        currentPage = 1;
        await loadExchangeRecords(1);
        icon.classList.remove('spin');
        showToast('近期兑换列表已刷新', 'success');
    });
}

// 加载更多按钮点击事件
if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async function () {
        currentPage++;
        await loadExchangeRecords(currentPage);
    });
}

// 刷新兑换码列表
if (refreshCodes) {
    refreshCodes.addEventListener('click', async function () {
        const icon = this.querySelector('i');
        icon.classList.add('spin');

        let result = await getGiftCodeAll();
        if (result.data.length > 0) {
            redeemCodes = result.data;
            renderRedeemCodes(redeemCodes);
            updateCodeCount();
            icon.classList.remove('spin');
            showToast('兑换码列表已刷新', 'success');
        }
    });
}

// 显示提示
function showToast(message, type = 'success') {
    const toast = document.getElementById('copy-toast');
    if (!toast) return;

    const icon = toast.querySelector('i');
    const text = toast.querySelector('span');

    if (type === 'success') {
        toast.className = toast.className.replace('bg-red-500', 'bg-green-500');
        toast.className = toast.className.includes('bg-green-500') ? toast.className : toast.className + ' bg-green-500';
        icon.className = 'fas fa-check-circle';
    } else {
        toast.className = toast.className.replace('bg-green-500', 'bg-red-500');
        toast.className = toast.className.includes('bg-red-500') ? toast.className : toast.className + ' bg-red-500';
        icon.className = 'fas fa-exclamation-circle';
    }

    text.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

// 添加账号输入验证
function validateAddAccountForm() {
    if (!accountInput || !addAccountBtn || !delAccountBtn) return;

    const accountId = accountInput.value.trim();
    delAccountBtn.disabled = addAccountBtn.disabled = !accountId;
}

// 手动兑换输入验证
function validateRedeemForm() {
    if (!manualAccountInput || !redeemCodeInput || !redeemBtn || !redeemAllBtn || !redeemAllBtn2) return;

    const accountId = manualAccountInput.value.trim();
    const code = redeemCodeInput.value.trim();
    redeemBtn.disabled = !(accountId && code);
    redeemAllBtn2.disabled = redeemAllBtn.disabled = !(accountId);
}

// 账号输入验证
if (accountInput) {
    accountInput.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
        validateAddAccountForm();
    });
}

// 手动兑换账号输入验证
if (manualAccountInput) {
    manualAccountInput.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
        validateRedeemForm();
    });
}

// 兑换码输入验证
if (redeemCodeInput) {
    redeemCodeInput.addEventListener('input', function () {
        validateRedeemForm();
    });
}

// 手动兑换
if (redeemBtn) {
    redeemBtn.addEventListener('click', async function () {
        const accountId = manualAccountInput.value.trim();
        const code = redeemCodeInput.value.trim();
        if (accountId && code) {
            const originalText = redeemBtn.innerHTML;
            redeemBtn.disabled = true;
            redeemBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>兑换中...';

            try {
                let res = await giftCode(accountId, code);
                if (res === undefined) return;
                if (res.code === 0 || res.msg === '兑换成功') {
                    await showMessage(`恭喜你 ${accountId} \n成功兑换: ${code}`, '成功', 'success');
                } else {
                    await showMessage(`兑换失败，${res.msg || '未知错误'}`, '失败', 'error');
                }

            } catch (error) {
                showToast('请求失败', 'error');
            } finally {
                redeemBtn.disabled = false;
                redeemBtn.innerHTML = originalText;
                redeemCodeInput.value = '';
                validateRedeemForm();
            }
        }
    });
}

// 兑换时限
if (redeemAllBtn) {
    redeemAllBtn.addEventListener('click', async function () {
        const accountId = manualAccountInput.value.trim();
        if (accountId) {
            const originalText = redeemAllBtn.innerHTML;
            redeemAllBtn.disabled = true;
            redeemAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>兑换中...';
            try {
                let res = await giftCodeAll(accountId);
                if (res === undefined) return;
                await showMessage(res.msg, '操作提示', 'info');
            } catch (error) {
                showToast('请求失败', 'error');
            } finally {
                redeemAllBtn.disabled = false;
                redeemAllBtn.innerHTML = originalText;
                manualAccountInput.value = '';
                validateRedeemForm();
            }
        }
    });
}

// 兑换长效
if (redeemAllBtn2) {
    redeemAllBtn2.addEventListener('click', async function () {
        const accountId = manualAccountInput.value.trim();
        if (accountId) {
            const originalText = redeemAllBtn2.innerHTML;
            redeemAllBtn2.disabled = true;
            redeemAllBtn2.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>兑换中...';
            try {
                let res = await giftCodeAll(accountId, "1");
                if (res === undefined) return;
                await showMessage(res.msg, '操作提示', 'info');
            } catch (error) {
                showToast('请求失败', 'error');
            } finally {
                redeemAllBtn2.disabled = false;
                redeemAllBtn2.innerHTML = originalText;
                manualAccountInput.value = '';
                validateRedeemForm();
            }
        }
    });
}

// 添加账号
if (addAccountBtn) {
    addAccountBtn.addEventListener('click', async function () {
        const accountId = accountInput.value.trim();

        if (accountId) {
            addAccountBtn.disabled = true;
            try {
                let res = await addUser(accountId);
                if (res === undefined) return;
                await showMessage(res.msg, '操作提示', 'info');
            } catch (error) {
                showToast('请求失败', 'error');
            } finally {
                accountInput.value = '';
                addAccountBtn.disabled = false;
                validateAddAccountForm();
            }
        }
    });
}

// 删除账号
if (delAccountBtn) {
    delAccountBtn.addEventListener('click', async function () {
        const accountId = accountInput.value.trim();
        if (accountId) {
            delAccountBtn.disabled = true;
            try {
                let res = await delUser(accountId);
                if (res === undefined) return;
                await showMessage(res.msg, '操作提示', 'info');
            } catch (error) {
                showToast('请求失败', 'error');
            } finally {
                delAccountBtn.disabled = false;
                accountInput.value = '';
                validateAddAccountForm();
            }
        }
    });
}

function hideMiddleFour(id) {
    if (!id) return '';
    const strId = String(id);
    if (strId.length <= 8) return strId;
    const firstFour = strId.substring(0, 3);
    const lastFour = strId.substring(strId.length - 3);
    return `${firstFour}***${lastFour}`;
}

function updateCodeCount() {
    const codeCount = document.getElementById('code-count');
    if (codeCount) {
        codeCount.textContent = `(${redeemCodes.length}条)`;
    }
}

function updateExchangeCount() {
    const exchangeCount = document.getElementById('exchange-count');
    if (exchangeCount) {
        exchangeCount.textContent = `(${displayedRecords.length}条)`;
    }
}


function renderExchangeRecords(records) {
    // 渲染近期兑换列表
    exchangeList.innerHTML = '';
    records.forEach(record => {
        const recordElement = document.createElement('div');
        const hiddenFid = hideMiddleFour(record.fid);
        let displayCode = record.cdk;
        if (!displayCode) return;
        let isMultipleCodes = record.auto || false;
        let isRepeat = record.repeat || false;
        let autoInfo = isRepeat ? '兑换过了' : '自动兑换';
        let badgeColorLight = isRepeat ? 'red' : 'green';
        let badgeColorDark = isRepeat ? 'red-500' : 'green-500';
        let badgeBgDark = isRepeat ? 'red-900/40' : 'green-900/40';

        if (record.cdk && record.cdk.includes(',')) {
            const codes = record.cdk.split(',');
            displayCode = codes[0] + `(${codes.length}个)`;
        }

        recordElement.className = 'p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 transition-all duration-200 hover:shadow-sm';

        recordElement.innerHTML = `
                <!-- 移动端优化布局 -->
                <div class="flex flex-col sm:flex-row sm:items-start gap-4">
                    <!-- 头像区域 -->
                    <div class="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                        <div class="relative">
                            <img src="${record.avatar_image}" alt="头像" class="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm">
                            ${record.stove_lv_content && record.stove_lv_content.length > 3 ?
                `<div class="absolute -bottom-0 -right-1 w-5 h-5 rounded-full overflow-hidden border-2 border-white dark:border-gray-800 shadow-md bg-white dark:bg-gray-900">
                                <img src="${record.stove_lv_content}" alt="等级图标" class="w-full h-full object-cover">
                            </div>` :
                `<div class="absolute -bottom-0 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-gray-800 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                                <span class="text-xs text-white font-bold">${record.stove_lv || ''}</span>
                            </div>`
            }
                        </div>

                        <!-- 移动端昵称和ID -->
                        <div class="sm:hidden flex flex-col">
                            <div class="flex items-center gap-2">
                                <h3 class="font-semibold text-gray-900 dark:text-white text-sm truncate max-w-[120px]">${record.nickname}</h3>
                                ${isMultipleCodes ? `
                                    <span class="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs" title="自动兑换">
                                        <i class="fas fa-robot text-xs"></i>
                                    </span>
                                ` : ''}
                            </div>
                            <div class="flex items-center gap-1 mt-1">
                                <span class="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs">
                                    <i class="fas fa-user text-xs mr-1"></i>
                                      ${hiddenFid}
                                </span>
                                <span class="sm:hidden inline-flex items-center px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 text-xs">
                                    <i class="fas fa-crown text-xs mr-1"></i>
                                     ${record.kid}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- 内容区域 -->
                    <div class="flex-1 min-w-0">
                        <!-- 桌面端昵称和ID -->
                        <div class="hidden sm:flex items-center gap-1 mb-1.5">
                            <div class="flex items-center gap-2">
                                <h3 class="font-semibold text-gray-900 dark:text-white text-base truncate max-w-[80px]">${record.nickname}</h3>
                                ${isMultipleCodes ? `
                                    <span class="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs" title="自动兑换">
                                        <i class="fas fa-robot text-xs"></i>
                                    </span>
                                ` : ''}
                            </div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs font-medium">
                                    <i class="fas fa-user text-xs mr-1"></i>
                                     ${hiddenFid}
                                </span>
                                <span class="inline-flex items-center px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 text-xs font-medium">
                                    <i class="fas fa-crown text-xs mr-1"></i>
                                     ${record.kid}
                                </span>
                            </div>
                        </div>

                        <!-- 兑换信息区域 -->
                        <div class="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <div class="flex flex-col gap-3">
                                <!-- 兑换码行 -->
                                <div class="flex items-center gap-2 flex-1 min-w-0">
                                    <span class="inline-flex items-center px-2 py-1 rounded-full bg-${badgeColorLight}-100 text-${badgeColorLight}-800 dark:bg-${badgeBgDark} dark:text-${badgeColorDark} text-xs font-medium whitespace-nowrap">
                                        <i class="fas fa-gift text-xs mr-1"></i>
                                        兑换
                                    </span>
                                    <code class="text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 truncate flex-1">
                                            ${displayCode}
                                    </code>
                                </div>

                                <!-- 时间和自动兑换信息 -->
                                <div class="flex items-center justify-between gap-2">
                                        ${isMultipleCodes || isRepeat ? `
                                        <div class="text-xs text-blue-500 dark:text-blue-400 flex items-center">
                                            <i class="fas fa-info-circle mr-1"></i>
                                            <span>${autoInfo}</span>
                                        </div>` : ''}
                                    <span class="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1 whitespace-nowrap">
                                        <i class="far fa-clock text-xs"></i>
                                        <span>${formatTimestamp(record.timestamp)}</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

        exchangeList.appendChild(recordElement);
    });
}


function formatTimestamp(timestampStr) {
    timestampStr = timestampStr.split('.')[0];
    let timestamp = parseFloat(timestampStr);
    if (timestampStr.length === 10) {
        timestamp = timestamp * 1000;
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = date - now;
    const isPast = diffInMs <= 0;
    const absDiffInMs = Math.abs(diffInMs);

    const diffInMinutes = Math.floor(absDiffInMs / (1000 * 60));
    const diffInHours = Math.floor(absDiffInMs / (1000 * 60 * 60));

    if (diffInMinutes <= 3) {
        return isPast ? '刚刚' : '即将';
    }

    if (diffInHours < 12) {
        const tsType = isPast ? '前' : '后';
        if (diffInHours < 1) {
            return `${diffInMinutes}分钟${tsType}`;
        }
        return `${diffInHours}小时${tsType}`;
    }

    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

function renderRedeemCodes(codes) {
    // 渲染兑换码列表
    if (!codeList) return;
    codeList.innerHTML = '';
    codes.forEach(code => {
        const useEndTime = code.endTime && code.endTime !== '';
        const timeIcon = useEndTime ? 'fas fa-hourglass-end' : 'far fa-clock';
        const codeElement = document.createElement('div');
        codeElement.className = 'p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 transition-colors duration-200 hover:shadow-sm';

        codeElement.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-2">
                        <button class="redeem-code font-mono text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors duration-200" data-code="${code.code}">
                            ${code.code}
                        </button>
                        <span class="text-xs px-2 py-1 rounded-full ${code.type === 0 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-500' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-500'}">
                            ${code.type === 0 ? '<span><i class="fa-solid fa-infinity"></i> 长效</span>' : '<span><i class="fa-solid fa-calendar-days"></i> 限时</span>'}
                        </span>
                    </div>
                    <span class="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                            <i class="${timeIcon} text-xs"></i>
                            <span>${formatTimestamp(code.endTime || code.created_at)}</span>
                    </span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-900 dark:text-white text-lg">${code.total}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-300">总兑换</span>
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-green-600 dark:text-green-400 text-lg">${code.success}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-300">成功</span>
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-red-600 dark:text-red-400 text-lg">${code.failed}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-300">失败</span>
                    </div>
                </div>
            `;

        codeList.appendChild(codeElement);
    });

    updateCodeCount();

    document.querySelectorAll('.redeem-code').forEach(button => {
        button.addEventListener('click', function () {
            const code = this.getAttribute('data-code');
            copyToClipboard(code);
            showToast('已复制到剪贴板', 'success');
        });
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            return true;
        }).catch(err => {
            return false;
        });
    }
}

class ApiSigner {
    constructor() {
        this.secretKey = new TextEncoder().encode(process.env.SECRET_KEY);
    }

    async generateSignature(data, post = null) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        let dataWithTimestamp = {...data};
        if (post) {
            dataWithTimestamp = {...post};
        }
        dataWithTimestamp['timestamp'] = timestamp;

        const sortedData = Object.entries(dataWithTimestamp)
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
        const signStr = sortedData.map(([k, v]) => `${k}=${v}`).join('&');

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            this.secretKey,
            {name: 'HMAC', hash: 'SHA-256'},
            false,
            ['sign']
        );

        const signatureBuffer = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(signStr)
        );

        const signature = Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        let params = ''
        if (data) {
            params = new URLSearchParams(data).toString() + '&';
        }
        return {
            url: `?${params}signature=${signature}&timestamp=${timestamp}`,
            data: new URLSearchParams(post).toString()
        };
    }
}

function closeMessageModal() {
    const innerModal = messageModal.querySelector('.transform');
    // 1. 触发缩小和变透明动画
    messageModal.classList.add('opacity-0');
    if (innerModal) {
        innerModal.classList.remove('scale-100');
        innerModal.classList.add('scale-95');
    }
    // 2. 等待动画结束（300ms）后再彻底隐藏 DOM
    setTimeout(() => {
        messageModal.classList.add('hidden');
    }, 300);
}

const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target;
            const innerModal = target.querySelector('.transform');
            if (innerModal) {
                // 当移除 hidden 时，触发显示动画
                if (!target.classList.contains('hidden')) {
                    setTimeout(() => {
                        target.classList.remove('opacity-0');
                        innerModal.classList.remove('scale-95');
                        innerModal.classList.add('scale-100');
                    }, 10);
                }
            }
        }
    });
});

['message-modal', 'player-addcode-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
});