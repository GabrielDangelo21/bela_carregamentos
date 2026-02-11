import Chart from 'chart.js/auto';

const BATTERY_CAPACITY = 81.4; // kWh
const PRICE_DAY = 0.145; // €/kWh
const PRICE_NIGHT = 0.111; // €/kWh
const CHARGE_POWER = 3.68; // Fixed power in kW
const LOSS_MARGIN = 1.15; // 15% losses
const EFFICIENCY_PER_100KM = 18; // Average kWh/100km

const elements = {
    batteryPercent: document.getElementById('battery-percent'),
    startTime: document.getElementById('start-time'),
    totalPrice: document.getElementById('total-price'),
    totalEnergy: document.getElementById('total-energy'),
    chargeDuration: document.getElementById('charge-duration'),
    finishTime: document.getElementById('finish-time'),
    costPer100: document.getElementById('cost-per-100'),
    barDay: document.getElementById('bar-day'),
    barNight: document.getElementById('bar-night'),
    btnSave: document.getElementById('btn-save'),
    historyList: document.getElementById('history-list'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    views: document.querySelectorAll('.view'),
    btnExport: document.getElementById('btn-export'),
    btnImport: document.getElementById('btn-import'),
    fileImport: document.getElementById('file-import')
};

let historyChart = null;

function calculate() {
    const percent = parseFloat(elements.batteryPercent.value) || 0;
    const power = CHARGE_POWER;
    const startStr = elements.startTime.value;

    // 1. Calculate energy needed (with losses)
    const energyNeeded = (BATTERY_CAPACITY * (percent / 100)) * LOSS_MARGIN;
    const durationHours = energyNeeded / power;

    // 2. Parse start time
    const [startH, startM] = startStr.split(':').map(Number);
    let currentTotalMinutes = startH * 60 + startM;
    let totalCost = 0;
    let dayEnergy = 0;
    let nightEnergy = 0;

    const chargeDurationMinutes = durationHours * 60;
    let processedMinutes = 0;

    while (processedMinutes < chargeDurationMinutes) {
        let currentDayMinutes = currentTotalMinutes % 1440;
        const dayStart = 6 * 60;
        const dayEnd = 21 * 60;

        let isDay = currentDayMinutes >= dayStart && currentDayMinutes < dayEnd;
        let nextTransition;

        if (isDay) {
            nextTransition = dayEnd - currentDayMinutes;
        } else {
            if (currentDayMinutes < dayStart) {
                nextTransition = dayStart - currentDayMinutes;
            } else {
                nextTransition = (1440 - currentDayMinutes) + dayStart;
            }
        }

        let minutesInCurrentWindow = Math.min(chargeDurationMinutes - processedMinutes, nextTransition);
        let energyInWindow = (minutesInCurrentWindow / 60) * power;

        if (isDay) {
            totalCost += energyInWindow * PRICE_DAY;
            dayEnergy += energyInWindow;
        } else {
            totalCost += energyInWindow * PRICE_NIGHT;
            nightEnergy += energyInWindow;
        }

        processedMinutes += minutesInCurrentWindow;
        currentTotalMinutes += minutesInCurrentWindow;
    }

    // 4. Update UI
    elements.totalPrice.innerText = totalCost.toFixed(2);
    elements.totalEnergy.innerText = energyNeeded.toFixed(1);

    const h = Math.floor(chargeDurationMinutes / 60);
    const m = Math.round(chargeDurationMinutes % 60);
    elements.chargeDuration.innerText = `${h}h ${m}m`;

    const endTotalMinutes = (startH * 60 + startM + chargeDurationMinutes) % 1440;
    const endH = Math.floor(endTotalMinutes / 60);
    const endM = Math.floor(endTotalMinutes % 60);
    elements.finishTime.innerText = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const cost100 = (totalCost / (energyNeeded / LOSS_MARGIN)) * EFFICIENCY_PER_100KM;
    elements.costPer100.innerText = `${cost100.toFixed(2)}€`;

    const dayPercent = (dayEnergy / energyNeeded) * 100;
    const nightPercent = 100 - dayPercent;
    elements.barDay.style.width = `${dayPercent}%`;
    elements.barNight.style.width = `${nightPercent}%`;
}

// Tab Management
elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;

        elements.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        elements.views.forEach(v => {
            v.classList.remove('active');
            if (v.id === `view-${target}`) v.classList.add('active');
        });

        if (target === 'stats') {
            renderHistory();
            initChart();
        }
    });
});

// History Logic
function saveCharge() {
    const history = JSON.parse(localStorage.getItem('charge_history') || '[]');
    const newCharge = {
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
        energy: parseFloat(elements.totalEnergy.innerText),
        price: parseFloat(elements.totalPrice.innerText),
        percent: elements.batteryPercent.value
    };

    history.push(newCharge);
    localStorage.setItem('charge_history', JSON.stringify(history.slice(-10))); // Last 10

    // Feedback and Switch Tab
    const btnText = elements.btnSave.innerText;
    elements.btnSave.innerText = '✅ Registado!';
    elements.btnSave.style.background = '#4CAF50';

    setTimeout(() => {
        elements.btnSave.innerText = btnText;
        elements.btnSave.style.background = '';
        document.querySelector('[data-tab="stats"]').click();
    }, 1000);
}

function renderHistory() {
    const rawHistory = JSON.parse(localStorage.getItem('charge_history') || '[]');
    const history = [...rawHistory].reverse();

    if (history.length === 0) {
        elements.historyList.innerHTML = '<p style="text-align: center; opacity: 0.5; padding: 20px;">Nenhum registo disponível.</p>';
        return;
    }

    elements.historyList.innerHTML = history.map(item => {
        // Robustness: ensure price and energy are numbers (handles old string data)
        const price = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
        const energy = typeof item.energy === 'string' ? parseFloat(item.energy) : item.energy;
        const displayPrice = isNaN(price) ? '0.00' : price.toFixed(2);
        const displayEnergy = isNaN(energy) ? '0.0' : energy.toFixed(1);

        return `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-date">${item.date}</span>
                    <span class="history-details">${item.percent}% • ${displayEnergy} kWh</span>
                </div>
                <div class="history-right">
                    <span class="history-price">${displayPrice}€</span>
                    <button class="btn-delete" onclick="window.deleteCharge(${item.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.deleteCharge = function (id) {
    const history = JSON.parse(localStorage.getItem('charge_history') || '[]');
    const filtered = history.filter(item => item.id !== id);
    localStorage.setItem('charge_history', JSON.stringify(filtered));
    renderHistory();
    initChart();
};

function initChart() {
    try {
        const history = JSON.parse(localStorage.getItem('charge_history') || '[]');
        const ctx = document.getElementById('historyChart');
        if (!ctx) return;

        if (historyChart) historyChart.destroy();

        if (history.length === 0) return;

        historyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: history.map(h => h.date),
                datasets: [{
                    label: 'Custo (€)',
                    data: history.map(h => {
                        const p = typeof h.price === 'string' ? parseFloat(h.price) : h.price;
                        return isNaN(p) ? 0 : p;
                    }),
                    backgroundColor: '#DE7461',
                    borderRadius: 8,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, border: { display: false } },
                    x: { grid: { display: false }, border: { display: false } }
                }
            }
        });
    } catch (e) {
        console.error('Erro ao inicializar gráfico:', e);
    }
}

// Backup Logic
function exportBackup() {
    const history = localStorage.getItem('charge_history') || '[]';
    const blob = new Blob([history], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bela_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('Formato inválido');

            if (confirm('Deseja substituir o histórico atual pelo backup?')) {
                localStorage.setItem('charge_history', JSON.stringify(data));
                renderHistory();
                initChart();
                alert('Backup importado com sucesso!');
            }
        } catch (err) {
            alert('Erro ao importar backup: Ficheiro inválido.');
        }
    };
    reader.readAsText(file);
}

// Listeners
elements.batteryPercent.addEventListener('input', calculate);
elements.startTime.addEventListener('input', calculate);
elements.btnSave.addEventListener('click', saveCharge);
elements.btnExport.addEventListener('click', exportBackup);
elements.btnImport.addEventListener('click', () => elements.fileImport.click());
elements.fileImport.addEventListener('change', importBackup);

// Init
calculate();
