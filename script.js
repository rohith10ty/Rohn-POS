// ========== Realtime Clock ==========
function updateDateTime() {
    const now = new Date();
    const dateTimeString = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB');
    const dateTime = document.querySelector('.datetime');
    if (dateTime) dateTime.textContent = dateTimeString;
}
setInterval(updateDateTime, 1000);
updateDateTime();

// ========== Transactions ==========
let currentTransaction = 1;
let transactions = loadTransactionsFromStorage();
let selectedItemIndex = -1;

document.querySelectorAll('.transactions button').forEach((btn, index) => {
    btn.addEventListener('click', () => {
        currentTransaction = index + 1;
        selectedItemIndex = -1;
        updateTransactionView();
    });
});

function formatCurrency(value) {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP'
    }).format(Number(value) || 0);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function showPosDialog({ title, message = '', fields = [], confirmText = 'OK', cancelText = 'Cancel', dialogClass = '' }) {
    return new Promise(resolve => {
        document.querySelector('.pos-dialog-backdrop')?.remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'pos-dialog-backdrop';
        backdrop.innerHTML = `
            <section class="pos-dialog ${escapeHtml(dialogClass)}" role="dialog" aria-modal="true" aria-labelledby="pos-dialog-title">
                <header>
                    <h2 id="pos-dialog-title">${escapeHtml(title)}</h2>
                    ${message ? `<p>${escapeHtml(message).replaceAll('\n', '<br>')}</p>` : ''}
                </header>
                <form>
                    <div class="pos-dialog-fields">
                        ${fields.map(field => `
                            <label>
                                <span>${escapeHtml(field.label)}</span>
                                ${field.options ? `
                                    <select name="${escapeHtml(field.name)}" ${field.required === false ? '' : 'required'}>
                                        ${field.options.map(option => `<option value="${escapeHtml(option)}" ${String(option) === String(field.value) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
                                    </select>
                                ` : `
                                    <input name="${escapeHtml(field.name)}" type="${field.type || 'text'}"
                                        value="${escapeHtml(field.value || '')}" ${field.step ? `step="${field.step}"` : ''}
                                        ${field.min !== undefined ? `min="${field.min}"` : ''} autocomplete="off" ${field.required === false ? '' : 'required'}>
                                `}
                            </label>
                        `).join('')}
                    </div>
                    <div class="pos-dialog-actions">
                        ${cancelText ? `<button type="button" class="btn pos-dialog-cancel">${escapeHtml(cancelText)}</button>` : ''}
                        <button type="submit" class="btn pos-dialog-confirm">${escapeHtml(confirmText)}</button>
                    </div>
                </form>
            </section>
        `;

        const close = value => {
            backdrop.classList.add('is-closing');
            setTimeout(() => backdrop.remove(), 140);
            resolve(value);
        };
        backdrop.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            close(values);
        });
        backdrop.querySelector('.pos-dialog-cancel')?.addEventListener('click', () => close(null));
        backdrop.addEventListener('click', event => {
            if (event.target === backdrop && cancelText) close(null);
        });
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
        backdrop.querySelector('input')?.focus();
        if (!fields.length) backdrop.querySelector('.pos-dialog-confirm')?.focus();
    });
}

function showPosMessage(title, message) {
    return showPosDialog({ title, message, fields: [], confirmText: 'Close', cancelText: null });
}

function addItem(name, qty, price) {
    const total = qty * price;
    const currentItems = Array.isArray(transactions[currentTransaction]) ? transactions[currentTransaction] : [];
    const activeItems = currentItems.filter(item => !item.status && !item.voided);

    // A new sale starts with a clean list after a voided, cleared, or pending transaction.
    if (activeItems.length === 0) {
        transactions[currentTransaction] = [{ name, qty, total }];
    } else {
        transactions[currentTransaction].push({ name, qty, total });
    }

    saveTransactionsToStorage();
    updateTransactionView();
}

function removeItem(index) {
    transactions[currentTransaction].splice(index, 1);
    const remainingItems = transactions[currentTransaction].filter(item => !item.status && !item.voided);
    selectedItemIndex = remainingItems.length ? Math.min(index, remainingItems.length - 1) : -1;
    saveTransactionsToStorage();
    updateTransactionView();
}

function selectTransactionItem(direction) {
    const selectableRows = [...document.querySelectorAll('.transaction-item-row[data-removable="true"]')];
    if (!selectableRows.length) {
        selectedItemIndex = -1;
        updateSelectionControls();
        return;
    }

    const currentPosition = selectableRows.findIndex(row => Number(row.dataset.itemIndex) === selectedItemIndex);
    const nextPosition = direction === 'up'
        ? (currentPosition <= 0 ? selectableRows.length - 1 : currentPosition - 1)
        : (currentPosition < 0 || currentPosition === selectableRows.length - 1 ? 0 : currentPosition + 1);

    selectedItemIndex = Number(selectableRows[nextPosition].dataset.itemIndex);
    updateSelectionControls();
    selectableRows[nextPosition].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateSelectionControls() {
    document.querySelectorAll('.transaction-item-row').forEach(row => {
        const selected = Number(row.dataset.itemIndex) === selectedItemIndex && row.dataset.removable === 'true';
        row.classList.toggle('is-selected', selected);
        row.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('.remove-selected-item').forEach(button => {
        button.disabled = selectedItemIndex < 0;
    });
}

function updateTransactionView(paidAmount = null, changeAmount = null) {
    const items = Array.isArray(transactions[currentTransaction]) ? transactions[currentTransaction] : [];
    const itemList = document.querySelector('.item-list');
    if (!itemList) return { totalQty: 0, totalAmount: 0 };
    itemList.innerHTML = `
        <div class="item-header">
            <span>Name</span>
            <span>Qty</span>
            <span>Total</span>
        </div>
    `;

    let totalQty = 0;
    let totalAmount = 0;

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'transaction-item-row';
        row.dataset.itemIndex = String(index);
        row.dataset.removable = 'false';

        let itemName = escapeHtml(item.name || '');
        let itemTotal = formatCurrency(item.total);

        if (item.voided) {
            itemName = `<span style="text-decoration: line-through; color: red;">${itemName} (Voided)</span>`;
            itemTotal = `<span style="text-decoration: line-through; color: red;">${itemTotal}</span>`;
        } else if (item.status === "Transaction Voided") {
            row.classList.add('is-status-row');
            itemName = `<span class="transaction-status transaction-status-danger">${escapeHtml(item.status)}</span>`;
            itemTotal = '';
        } else if (item.status === "Payment Pending") {
            row.classList.add('is-status-row');
            itemName = `<span class="transaction-status transaction-status-pending">${escapeHtml(item.status)}</span>`;
            itemTotal = '';
        } else if (item.status) {
            row.classList.add('is-status-row');
            itemName = `<span class="transaction-status transaction-status-success">${escapeHtml(item.status)}</span>`;
            itemTotal = '';
        }
        else {
            row.dataset.removable = 'true';
            row.onclick = () => {
                selectedItemIndex = index;
                updateSelectionControls();
            };
            totalQty += item.qty;
            totalAmount += item.total;
        }

        row.innerHTML = `<span>${itemName}</span><span>${item.qty || ''}</span><span>${itemTotal}</span>`;
        itemList.appendChild(row);
    });
    if (!items[selectedItemIndex] || items[selectedItemIndex].status || items[selectedItemIndex].voided) {
        selectedItemIndex = -1;
    }
    updateSelectionControls();

    const infoBar = document.querySelector('.info-bar');
    if (infoBar) {
        const infoBarChildren = infoBar.children;
        const countTotalElement = infoBarChildren[0];
        let paidElement = infoBarChildren[1];
        let changeElement = infoBarChildren[2];

        if (countTotalElement) {
            countTotalElement.innerHTML = `Count: <span id="item-count-info">${totalQty}</span> Total: <span id="total-amount-info">${formatCurrency(totalAmount)}</span>`;
        }

        if (paidElement) {
            paidElement.innerHTML = `Paid: <span id="paid-amount-info">${formatCurrency(paidAmount)}</span> <span id="change-amount-info">Change: ${formatCurrency(changeAmount)}</span>`;
        }
    }
    document.querySelectorAll('.transactions button').forEach((button, index) => {
        const isActive = index + 1 === currentTransaction;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    return {totalQty, totalAmount};
}

// ========== LocalStorage ==========
function saveTransactionsToStorage() {
    localStorage.setItem('pos_transactions', JSON.stringify(transactions));
}

function loadTransactionsFromStorage() {
    const data = localStorage.getItem('pos_transactions');
    return data ? JSON.parse(data) : { 1: [], 2: [], 3: [] };
}

// ========== History Logging ==========
function saveToHistory(type, items) {
    const now = new Date();
    const timestamp = now.toLocaleString('en-GB');
    const total = items.reduce((sum, item) => sum + (item.total || 0), 0);

    const history = JSON.parse(localStorage.getItem('pos_history') || '[]');

    history.push({
        id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now.toISOString(),
        timestamp,
        type,
        items: items.filter(item => !item.status && !item.voided),
        total
    });

    localStorage.setItem('pos_history', JSON.stringify(history));
}

function getEntryTime(entry) {
    if (entry.createdAt) return new Date(entry.createdAt).getTime();
    const match = String(entry.timestamp || '').match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return 0;
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6])).getTime();
}

function resetActiveTransactions() {
    transactions = { 1: [], 2: [], 3: [] };
    currentTransaction = 1;
    selectedItemIndex = -1;
    saveTransactionsToStorage();
    updateTransactionView();
}

function reportTotal(entries) {
    return entries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
}

function formatReportDetails(report, kind) {
    const entries = report.transactions || report.allTransactions || [];
    const heading = `${kind} ending ${new Date(report.endedAt).toLocaleString('en-GB')}`;
    const lines = entries.map(entry =>
        `${entry.timestamp} — ${entry.type}: ${formatCurrency(entry.total)}`
    );
    return `${heading}\nTransactions: ${entries.length}\nNet total: ${formatCurrency(report.total)}${lines.length ? `\n\n${lines.join('\n')}` : ''}`;
}

// ========== Button Event Listeners ==========
document.addEventListener('DOMContentLoaded', () => {
    const actionsButtons = document.querySelectorAll('.actions button');

    const historySummary = (todayOnly = false) => {
        const history = JSON.parse(localStorage.getItem('pos_history') || '[]');
        const today = new Date().toLocaleDateString('en-GB');
        const entries = todayOnly ? history.filter(entry => entry.timestamp.startsWith(today)) : history;
        const total = entries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
        return { count: entries.length, total };
    };

    const recordTillMovement = async (type, sign = 1) => {
        const values = await showPosDialog({
            title: type,
            message: 'Enter the amount below to record this till movement.',
            fields: [{ name: 'amount', label: 'Amount (£)', type: 'number', step: '0.01', min: 0.01 }],
            confirmText: `Record ${type}`
        });
        if (!values) return;
        const amount = Number.parseFloat(values.amount);
        if (!Number.isFinite(amount) || amount <= 0) return showPosMessage('Invalid amount', 'Enter an amount greater than zero.');
        const item = { name: type, qty: 1, total: amount * sign };
        saveToHistory(type, [item]);
        await showPosMessage(`${type} recorded`, `Amount: ${formatCurrency(amount)}`);
    };

    document.getElementById('transaction-search')?.addEventListener('click', async () => {
        const values = await showPosDialog({
            title: 'Transaction Search',
            message: 'Search by transaction type or item name.',
            fields: [{ name: 'query', label: 'Search term', type: 'text' }],
            confirmText: 'Search'
        });
        if (!values?.query.trim()) return;
        localStorage.setItem('pos_history_query', values.query.trim());
        window.location.href = 'history.html';
    });
    document.getElementById('shift-end-report')?.addEventListener('click', async () => {
        const reports = JSON.parse(localStorage.getItem('pos_shift_reports') || '[]');
        if (!reports.length) {
            const summary = historySummary(false);
            await showPosMessage('Shift End Report', `No shift has been closed yet.\n\nCurrent transactions: ${summary.count}\nCurrent net total: ${formatCurrency(summary.total)}`);
            return;
        }
        await showPosMessage('Shift End Report', [...reports].reverse().map(report => formatReportDetails(report, 'Shift')).join('\n\n──────────\n\n'));
    });
    document.getElementById('day-end-report')?.addEventListener('click', async () => {
        const reports = JSON.parse(localStorage.getItem('pos_day_reports') || '[]');
        if (!reports.length) {
            const summary = historySummary(true);
            await showPosMessage('Day End Report', `No day has been closed yet.\n\nCurrent transactions today: ${summary.count}\nCurrent net total: ${formatCurrency(summary.total)}`);
            return;
        }
        await showPosMessage('Day End Report', [...reports].reverse().map(report => formatReportDetails(report, 'Day')).join('\n\n══════════\n\n'));
    });
    document.getElementById('paid-in')?.addEventListener('click', () => recordTillMovement('Paid In', 1));
    document.getElementById('paid-out')?.addEventListener('click', () => recordTillMovement('Paid Out', -1));
    document.getElementById('safe-drop')?.addEventListener('click', () => recordTillMovement('Safe Drop', -1));

    document.getElementById('refund-transaction')?.addEventListener('click', async () => {
        const values = await showPosDialog({
            title: 'Cash Refund',
            message: 'Enter the refunded item and amount. This will reduce the current cash total.',
            fields: [
                { name: 'name', label: 'Item name', type: 'text' },
                { name: 'amount', label: 'Refund amount (£)', type: 'number', step: '0.01', min: 0.01 }
            ],
            confirmText: 'Process Refund'
        });
        if (!values) return;
        const amount = Number.parseFloat(values.amount);
        if (!values.name.trim() || !Number.isFinite(amount) || amount <= 0) {
            return showPosMessage('Invalid refund', 'Enter an item name and an amount greater than zero.');
        }
        const refundItem = { name: `Refund: ${values.name.trim()}`, qty: 1, total: -amount };
        addItem(refundItem.name, 1, -amount);
        saveToHistory('Refund - Cash', [refundItem]);
        await showPosMessage('Refund completed', `${formatCurrency(amount)} was refunded in cash and deducted from the reports.`);
    });

    document.getElementById('close-shift')?.addEventListener('click', async () => {
        const now = new Date();
        const eightHoursAgo = now.getTime() - (8 * 60 * 60 * 1000);
        const storedStart = Number(localStorage.getItem('pos_shift_started_at')) || eightHoursAgo;
        const periodStart = Math.max(storedStart, eightHoursAgo);
        const history = JSON.parse(localStorage.getItem('pos_history') || '[]');
        const shiftEntries = history.filter(entry => getEntryTime(entry) >= periodStart && getEntryTime(entry) <= now.getTime());
        const confirmation = await showPosDialog({
            title: 'End Current Shift',
            message: `Archive ${shiftEntries.length} transaction(s) from this shift with a net total of ${formatCurrency(reportTotal(shiftEntries))}?`,
            fields: [],
            confirmText: 'End Shift'
        });
        if (!confirmation) return;

        const report = {
            id: `shift-${Date.now()}`,
            startedAt: new Date(periodStart).toISOString(),
            endedAt: now.toISOString(),
            transactions: shiftEntries,
            total: reportTotal(shiftEntries)
        };
        const reports = JSON.parse(localStorage.getItem('pos_shift_reports') || '[]');
        reports.push(report);
        localStorage.setItem('pos_shift_reports', JSON.stringify(reports));
        const archivedIds = new Set(shiftEntries.map(entry => entry.id || `${entry.timestamp}-${entry.type}`));
        const remaining = history.filter(entry => !archivedIds.has(entry.id || `${entry.timestamp}-${entry.type}`));
        localStorage.setItem('pos_history', JSON.stringify(remaining));
        localStorage.setItem('pos_shift_started_at', String(now.getTime()));
        resetActiveTransactions();
        await showPosMessage('Shift closed', `The shift ended at ${now.toLocaleString('en-GB')}.\nTransactions archived: ${shiftEntries.length}\nNet total: ${formatCurrency(report.total)}`);
    });

    document.getElementById('close-day')?.addEventListener('click', async () => {
        const now = new Date();
        const dayAgo = now.getTime() - (24 * 60 * 60 * 1000);
        const storedStart = Number(localStorage.getItem('pos_day_started_at')) || dayAgo;
        const periodStart = Math.max(storedStart, dayAgo);
        const activeHistory = JSON.parse(localStorage.getItem('pos_history') || '[]');
        const activeEntries = activeHistory.filter(entry => getEntryTime(entry) >= periodStart && getEntryTime(entry) <= now.getTime());
        const shiftReports = JSON.parse(localStorage.getItem('pos_shift_reports') || '[]');
        const includedShifts = shiftReports.filter(report => {
            const ended = new Date(report.endedAt).getTime();
            return ended >= periodStart && ended <= now.getTime() && !report.dayReportId;
        });
        const shiftEntries = includedShifts.flatMap(report => report.transactions || []);
        const allEntries = [...shiftEntries, ...activeEntries];
        const confirmation = await showPosDialog({
            title: 'End Current Day',
            message: `Archive ${includedShifts.length} shift(s) and ${allEntries.length} transaction(s) from the last 24 hours with a net total of ${formatCurrency(reportTotal(allEntries))}?`,
            fields: [],
            confirmText: 'End Day'
        });
        if (!confirmation) return;

        const reportId = `day-${Date.now()}`;
        const report = {
            id: reportId,
            startedAt: new Date(periodStart).toISOString(),
            endedAt: now.toISOString(),
            shiftReportIds: includedShifts.map(shift => shift.id),
            allTransactions: allEntries,
            total: reportTotal(allEntries)
        };
        const dayReports = JSON.parse(localStorage.getItem('pos_day_reports') || '[]');
        dayReports.push(report);
        localStorage.setItem('pos_day_reports', JSON.stringify(dayReports));
        includedShifts.forEach(shift => { shift.dayReportId = reportId; });
        localStorage.setItem('pos_shift_reports', JSON.stringify(shiftReports));
        localStorage.setItem('pos_history', '[]');
        localStorage.setItem('pos_day_started_at', String(now.getTime()));
        localStorage.setItem('pos_shift_started_at', String(now.getTime()));
        resetActiveTransactions();
        await showPosMessage('Day closed', `The trading day ended at ${now.toLocaleString('en-GB')}.\nShifts included: ${includedShifts.length}\nTransactions archived: ${allEntries.length}\nNet total: ${formatCurrency(report.total)}`);
    });

    const salesButton = document.getElementById('sales');
    if (salesButton) {
        // Sales Button
        salesButton.addEventListener('click', async () => {
            const values = await showPosDialog({
                title: 'Add Sale Item',
                message: 'Enter the item details to add it to the current transaction.',
                dialogClass: 'sale-dialog',
                fields: [
                    { name: 'name', label: 'Item name', type: 'text' },
                    { name: 'qty', label: 'Qty', options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], value: 1 },
                    { name: 'price', label: 'Price (£)', type: 'number', step: '0.01', min: 0 }
                ],
                confirmText: 'Add Item'
            });
            if (!values) return;
            const qty = Number.parseInt(values.qty, 10);
            const price = Number.parseFloat(values.price);
            if (!values.name.trim() || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
                return showPosMessage('Invalid item', 'Enter a name, a quantity greater than zero, and a valid price.');
            }
            addItem(values.name.trim(), qty, price);
        });

        // Non-Sales Button
        document.getElementById('non-sales').addEventListener('click', async () => {
            const values = await showPosDialog({
                title: 'Non Sales',
                message: 'Enter the cash amount to add to the till.',
                fields: [{ name: 'amount', label: 'Amount (£)', type: 'number', step: '0.01', min: 0.01 }],
                confirmText: 'Add to Till'
            });
            if (!values) return;
            const amount = Number.parseFloat(values.amount);
            if (!Number.isFinite(amount) || amount <= 0) return showPosMessage('Invalid amount', 'Enter an amount greater than zero.');

            const item = { name: "Cash Deposit", qty: 1, total: amount };
            addItem(item.name, item.qty, item.total); // Add to current transaction view
            saveToHistory("Non-Sales", [item]);
            await showPosMessage('Non Sales recorded', `${formatCurrency(amount)} was added to the till.`);
        });

        // Menu Button
        document.querySelector('.main-actions button[onclick*="menu.html"]').addEventListener('click', () => {
            window.location.href = 'menu.html';
        });

        // Void Transaction Button
        document.getElementById('void-transaction').addEventListener('click', () => {
            const currentItems = transactions[currentTransaction];
            if (currentItems && currentItems.length > 0 && !currentItems[0].status) {
                const voidedItems = currentItems.filter(item => !item.voided);
                if (confirm(`Are you sure you want to void ${voidedItems.length} item(s) in this transaction?`)) {
                    let allVoided = true;
                    currentItems.forEach(item => {
                        if (!item.voided) {
                            item.voided = true;
                        }
                        if (!item.voided && !item.status) {
                            allVoided = false;
                        }
                    });
                    saveTransactionsToStorage();
                    updateTransactionView();

                    // Display "Transaction Voided" message temporarily
                    const itemListContainer = document.querySelector('.item-list');
                    const voidedMessage = document.createElement('div');
                    voidedMessage.style.color = '#FF8A80';
                    voidedMessage.style.fontWeight = 'bold';
                    voidedMessage.style.textAlign = 'center';
                    voidedMessage.style.padding = '10px';
                    voidedMessage.textContent = 'Transaction Voided';
                    itemListContainer.insertBefore(voidedMessage, itemListContainer.firstChild);

                    setTimeout(() => {
                        // Remove the temporary message
                        if (itemListContainer.contains(voidedMessage)) {
                            itemListContainer.removeChild(voidedMessage);
                        }

                        // If all items are now voided, set the transaction status
                        const currentTransactionItems = transactions[currentTransaction];
                        if (currentTransactionItems.every(item => item.voided)) {
                            transactions[currentTransaction] = [{ status: "Transaction Voided" }]; //store
                            saveTransactionsToStorage();
                            updateTransactionView();
                        }
                    }, 10000);
                    saveToHistory("Voided", voidedItems);
                }
            } else if (currentItems && currentItems[0].status === "Transaction Voided") {
                alert("This transaction is already voided.");
            } else if (currentItems && currentItems[0].status === "Transaction Cleared") {
                alert("This transaction has already been cleared.");
            } else {
                alert("No items to void in this transaction.");
            }
        });

        // Exact Change Button
        document.getElementById('exact-change').addEventListener('click', () => {
            const itemsToClear = transactions[currentTransaction].filter(item => !item.status && !item.voided);
            if (itemsToClear.length === 0) return;

            let {totalQty, totalAmount} = updateTransactionView();

            transactions[currentTransaction] = [{ status: "Transaction Cleared" }]; // Store the ID
            saveTransactionsToStorage();
            updateTransactionView(totalAmount, 0); //show paid and change
        });

        // Cash Button
        const cashButton = document.getElementById('cash-payment');
        if (cashButton) {
            cashButton.addEventListener('click', () => {
                const itemsToClear = transactions[currentTransaction].filter(item => !item.status && !item.voided);
                if (itemsToClear.length === 0) return;

                const totalAmount = itemsToClear.reduce((sum, item) => sum + item.total, 0);
                const cashReceivedInput = prompt("Enter amount of cash received from customer:");
                const cashReceived = parseFloat(cashReceivedInput);

                if (isNaN(cashReceived) || cashReceived < totalAmount) {
                    alert("Insufficient cash received.");
                    return;
                }

                const changeAmount = cashReceived - totalAmount;
                updateTransactionView();

                saveToHistory("Sale", itemsToClear);
                transactions[currentTransaction] = [{ status: "Transaction Cleared", paid: cashReceived, change: changeAmount }];
                saveTransactionsToStorage();
                updateTransactionView(cashReceived, changeAmount);
                alert(`Transaction complete. Cash received: ${formatCurrency(cashReceived)}, Change: ${formatCurrency(changeAmount)}`);
            });
        }

        const payButton = document.getElementById('pay-action');
        if (payButton) {
            payButton.addEventListener('click', () => {
                const payableItems = transactions[currentTransaction].filter(item => !item.status && !item.voided);
                if (!payableItems.length) {
                    alert('Add at least one item before choosing a payment method.');
                    return;
                }
                window.location.href = 'payments.html';
            });
        }
    } // End of if (actionsButtons.length >= 9)


    document.querySelectorAll('.payment-method').forEach(button => {
        button.addEventListener('click', () => {
            const itemsToClear = transactions[currentTransaction].filter(item => !item.status && !item.voided);
            if (itemsToClear.length === 0) {
                alert('There are no items to pay for.');
                return;
            }

            const method = button.dataset.paymentMethod;
            const totalAmount = itemsToClear.reduce((sum, item) => sum + item.total, 0);
            let paidAmount = totalAmount;
            let changeAmount = 0;

            if (method === 'Cash') {
                const receivedInput = prompt(`Total due is ${formatCurrency(totalAmount)}. Enter cash received:`);
                if (receivedInput === null) return;
                paidAmount = Number.parseFloat(receivedInput);
                if (!Number.isFinite(paidAmount) || paidAmount < totalAmount) {
                    alert('The cash received is less than the amount due.');
                    return;
                }
                changeAmount = paidAmount - totalAmount;
            } else if (!confirm(`Confirm ${formatCurrency(totalAmount)} payment by ${method}?`)) {
                return;
            }

            saveToHistory(`Sale - ${method}`, itemsToClear);
            transactions[currentTransaction] = [{
                status: `Transaction Cleared via ${method}`,
                paid: paidAmount,
                change: changeAmount,
                paymentMethod: method
            }];
            selectedItemIndex = -1;
            saveTransactionsToStorage();
            updateTransactionView(paidAmount, changeAmount);
            alert(`${method} payment complete.${changeAmount > 0 ? ` Change: ${formatCurrency(changeAmount)}` : ''}`);
            window.location.href = 'index.html';
        });
    });

    // Pay Later Button (on payments.html)
    const payLaterButton = document.getElementById('pay-later-payment');
    if (payLaterButton) {
        payLaterButton.addEventListener('click', () => {
            const itemsToMarkPending = transactions[currentTransaction].filter(item => !item.status && !item.voided);
            if (itemsToMarkPending.length === 0) return;

            const now = new Date();
            const timestamp = now.toLocaleString('en-GB');
            const pendingTransaction = {
                timestamp,
                items: itemsToMarkPending,
                total: itemsToMarkPending.reduce((sum, item) => sum + item.total, 0)
            };

            let pending = loadPendingTransactions();
            pending.push(pendingTransaction);
            savePendingTransactions(pending);

            transactions[currentTransaction] = [{ status: "Payment Pending" }];
            saveTransactionsToStorage();
            updateTransactionView();
            alert("Transaction marked for Pay Later.");
            window.location.href = 'index.html';
        });
    }

    function savePendingTransactions(pendingTransactions) {
        localStorage.setItem('pos_pending', JSON.stringify(pendingTransactions));
    }

    function loadTransactionsFromStorage() {
        const data = localStorage.getItem('pos_transactions');
        return data ? JSON.parse(data) : { 1: [], 2: [], 3: [] };
    }

    // Carrier Bag Button
    const carrierBagButton = document.getElementById('carrier-bag-btn');
    if (carrierBagButton) {
        carrierBagButton.addEventListener('click', () => {
            addItem("Carrier Bag", 1, 0.30);
        });
    }

    document.querySelectorAll('[data-select-direction]').forEach(button => {
        button.addEventListener('click', () => selectTransactionItem(button.dataset.selectDirection));
    });

    document.querySelectorAll('.remove-selected-item').forEach(button => {
        button.addEventListener('click', () => {
            if (selectedItemIndex < 0) return;
            removeItem(selectedItemIndex);
        });
    });

    document.querySelectorAll('.scroll-btns:not(.transaction-controls)').forEach(group => {
        const page = group.closest('.container-fluid') || document;
        const target = page.querySelector('.history-list-container, .pending-items-list, .item-list');
        const buttons = group.querySelectorAll('button');
        if (!target || buttons.length < 2) return;
        buttons[0].setAttribute('aria-label', 'Scroll up');
        buttons[1].setAttribute('aria-label', 'Scroll down');
        buttons[0].addEventListener('click', () => target.scrollBy({ top: -180, behavior: 'smooth' }));
        buttons[1].addEventListener('click', () => target.scrollBy({ top: 180, behavior: 'smooth' }));
    });

    // Home Button (for footer)
    document.querySelectorAll('button').forEach(button => {
        if (button.textContent.trim().toLowerCase() === 'home') {
            button.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }
    });

    // Print Receipt Button (for footer)
    const printBtn = document.getElementById('print-receipt');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            const items = transactions[currentTransaction].filter(item => !item.status && !item.voided);
            if (!items.length) {
                alert("No valid items in transaction to print.");
                return;
            }

            let receiptWindow = window.open('', '', 'width=400,height=600');
            receiptWindow.document.write('<html><head><title>Receipt</title></head><body>');
            receiptWindow.document.write('<h2>Transaction Receipt</h2>');
            receiptWindow.document.write(`<p>Date: ${new Date().toLocaleString('en-GB')}</p>`);
            receiptWindow.document.write('<table border="1" width="100%" style="border-collapse: collapse;"><tr><th>Item</th><th>Qty</th><th>Total</th></tr>');

            let total = 0;
            items.forEach(item => {
                receiptWindow.document.write(`<tr><td>${item.name}</td><td>${item.qty}</td><td>£${item.total.toFixed(2)}</td></tr>`);
                total += item.total;
            });

            receiptWindow.document.write('</table>');
            receiptWindow.document.write(`<h3>Total: £${total.toFixed(2)}</h3>`);
            receiptWindow.document.write('</body></html>');

            receiptWindow.document.close();
            receiptWindow.print();
        });
    }
});

// ========== Initialize ==========
updateTransactionView();

// Back button functionality
document.addEventListener('DOMContentLoaded', () => {
    const backButtons = document.querySelectorAll('.footer-buttons button');

    backButtons.forEach(button => {
        if (button.textContent.trim() === '←' || button.textContent.trim() === '&larr;') {
            button.addEventListener('click', () => {
                window.history.back();
            });
        }
    });
});

    // ========== Pending Transactions ==========
    function savePendingTransactions(pendingTransactions) {
        localStorage.setItem('pos_pending', JSON.stringify(pendingTransactions));
    }

    function loadPendingTransactions() {
        const data = localStorage.getItem('pos_pending');
        return data ? JSON.parse(data) : [];
    }

    function addTransactionToPending(transaction) {
        let pendingTransactions = loadPendingTransactions();
        pendingTransactions.push(transaction);
        savePendingTransactions(pendingTransactions);
    }

    function getPendingTransactionsAndClear() { // Changed function name
        let pendingTransactions = loadPendingTransactions();
        savePendingTransactions([]); // Clear the pending transactions
        return pendingTransactions;
    }

    // New Function to Add Cleared Transaction
    function addClearedTransaction(transaction) {
        if (!transaction || !transaction.items) return;

        transaction.items.forEach(item => {
            addItem(item.name, item.qty, item.total / item.qty); // Assuming total holds the item's total
        });
    }

    //pending button functionality
    document.addEventListener('DOMContentLoaded', () => {
        const pendingButton = document.getElementById('pending-payment');
        if (pendingButton) {
            pendingButton.addEventListener('click', () => {
                window.location.href = 'pending.html';
            });
        }
    });

    function clearPendingTransaction(index) {
        let pendingTransactions = loadPendingTransactions();
        const transactionToClear = pendingTransactions[index];
    
        // Remove the transaction from the pending list
        pendingTransactions.splice(index, 1);
        savePendingTransactions(pendingTransactions); // You'll need to define this function
    
        // Get existing transactions from localStorage
        let currentTransactions = loadTransactionsFromStorage(); // Make sure this function exists
    
        // Add the cleared transaction to the current transactions object.  Use currentTransaction as the key
        if (!currentTransactions[currentTransaction]) {
            currentTransactions[currentTransaction] = [];
        }
        currentTransactions[currentTransaction].push(transactionToClear);
        saveTransactionsToStorage();  // Make sure this function exists
    
        //  No redirection here.  We'll handle updating the UI in pending.html's script.
        renderPendingTransactions(); // Re-render the pending list in pending.html
        // Inform index.html to update
        localStorage.setItem('refresh_index', 'true');
    }
    
    function loadPendingTransactions() {
        const data = localStorage.getItem('pos_pending');
        return data ? JSON.parse(data) : [];
    }
    
    function savePendingTransactions(pendingTransactions) {
        localStorage.setItem('pos_pending', JSON.stringify(pendingTransactions));
    }
    
