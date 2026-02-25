// --- LOCALIZATION DATA ---
const TRANSLATIONS = {
    en: {
        welcome_hero: "Back to Campus Sale!",
        welcome_sub: "Get 20% cashback on all orders this week.",
        menu_title: "Lunch Menu",
        basket_title: "Your Basket",
        basket_empty: "Basket is empty",
        checkout: "Checkout",
        processing: "Processing...",
        browse: "Browse Menu",
        total: "Total",
        confirm_loc: "Confirm Location",
        select_loc_title: "Select Delivery Location",
        my_orders_db: "My Orders DB",
        total_spent: "Total Spent",
        total_orders: "Total Orders",
        last_activity: "Last Activity",
        db_records: "Database Records",
        back_menu: "Back to Menu",
        logout: "Log Out",
        login_btn: "Log In",
        signup_btn: "Sign Up",
        verify_student: "Verify Student Status",
        verify_desc: "Upload your ID card for bonuses.",
        click_upload: "Click to Upload ID",
        upload_status_pending: "Processing Verification...",
        upload_status_verified: "Verified! Student Bonuses Active.",
        role_user: "Student / User",
        role_rest: "Restaurant Partner",
        ph_phone: "Phone Number",
        ph_pass: "Password",
        ph_name: "Full Name",
        ph_rest_name: "Restaurant Name",
        create_acc: "Create Account",
        demo_text: "Demo: Use any phone/pass",
        loc_select: "Select Location",
        loc_pin: "Pin",
        loc_using_gps: "Finding your location...",
        loc_denied: "GPS access denied",
        btn_use_gps: "📍 Use My Location",
        delivery_status: "Delivery Status",
        order_placed: "Order Placed",
        preparing: "Preparing",
        on_the_way: "On the Way",
        delivered: "Delivered"
    },
    ru: {
        welcome_hero: "Скидки к началу учебы!",
        welcome_sub: "Кэшбек 20% на все заказы.",
        menu_title: "Обеденное Меню",
        basket_title: "Корзина",
        basket_empty: "Корзина пуста",
        checkout: "Оформить",
        processing: "Обработка...",
        browse: "К Меню",
        total: "Итого",
        confirm_loc: "Подтвердить",
        select_loc_title: "Место доставки",
        my_orders_db: "База Заказов",
        total_spent: "Потрачено",
        total_orders: "Заказы",
        last_activity: "Активность",
        db_records: "Записи",
        back_menu: "В Меню",
        logout: "Выйти",
        login_btn: "Войти",
        signup_btn: "Регистрация",
        verify_student: "Статус студента",
        verify_desc: "Загрузите карту.",
        click_upload: "Загрузить",
        upload_status_pending: "Проверка...",
        upload_status_verified: "Подтверждено!",
        role_user: "Студент",
        role_rest: "Ресторан",
        ph_phone: "Телефон",
        ph_pass: "Пароль",
        ph_name: "Имя",
        ph_rest_name: "Название",
        create_acc: "Создать",
        demo_text: "Демо режим",
        loc_select: "Адрес",
        loc_pin: "Точка",
        loc_using_gps: "Поиск GPS...",
        loc_denied: "GPS недоступен",
        btn_use_gps: "📍 Моя геолокация",
        delivery_status: "Статус доставки",
        order_placed: "Заказ принят",
        preparing: "Готовится",
        on_the_way: "В пути",
        delivered: "Доставлен",
    },
    uz: {
        welcome_hero: "O'qish chegirmalari!",
        welcome_sub: "20% keshbek.",
        menu_title: "Tushlik",
        basket_title: "Savat",
        basket_empty: "Bo'sh",
        checkout: "Rasmiylashtirish",
        processing: "Jarayonda...",
        browse: "Menyuga",
        total: "Jami",
        confirm_loc: "Tasdiqlash",
        select_loc_title: "Manzil",
        my_orders_db: "Buyurtmalar",
        total_spent: "Sarlandi",
        total_orders: "Buyurtmalar",
        last_activity: "Faoliyat",
        db_records: "Yozuvlar",
        back_menu: "Menyuga",
        logout: "Chiqish",
        login_btn: "Kirish",
        signup_btn: "Ro'yxatdan",
        verify_student: "Talaba statusi",
        verify_desc: "Kartangizni yuklang.",
        click_upload: "Yuklash",
        upload_status_pending: "Tekshirilmoqda...",
        upload_status_verified: "Tasdiqlandi!",
        role_user: "Talaba",
        role_rest: "Restoran",
        ph_phone: "Telefon",
        ph_pass: "Parol",
        ph_name: "Ism",
        ph_rest_name: "Nom",
        create_acc: "Yaratish",
        demo_text: "Demo",
        loc_select: "Manzil",
        loc_pin: "Manzil",
        loc_using_gps: "GPS...",
        loc_denied: "GPS o'chiq",
        btn_use_gps: "📍 Mening joylashuvim",
        delivery_status: "Yetkazish holati",
        order_placed: "Buyurtma qabul qilindi",
        preparing: "Tayyorlanmoqda",
        on_the_way: "Yo'lda",
        delivered: "Yetkazildi"
    }
};

let currentLang = 'en';

function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return;
    currentLang = lang;
    localStorage.setItem('campuseats_lang', lang);
    applyTranslations();
    updateUserDisplay();
}

function applyTranslations() {
    const t = TRANSLATIONS[currentLang];

    safeText('heroTitle', t.welcome_hero);
    safeText('heroSub', t.welcome_sub);
    safeText('tabLogin', t.login_btn);
    safeText('tabSignup', t.signup_btn);
    safeText('roleUser', t.role_user);
    safeText('roleRest', t.role_rest);
    safeText('loginBtnText', t.login_btn);
    safeText('signupBtnText', t.create_acc);
    safeText('demoHint', t.demo_text);

    safePlaceholder('loginPhone', t.ph_phone);
    safePlaceholder('loginPass', t.ph_pass);
    safePlaceholder('regName', t.ph_name);
    safePlaceholder('regPhone', t.ph_phone);
    safePlaceholder('regPass', t.ph_pass);
    safePlaceholder('regRestName', t.ph_rest_name);

    safeText('menuTitle', t.menu_title);
    safeText('basketTitle', t.basket_title);
    safeText('cartTotalLabel', t.total);

    safeText('navOrdersDB', t.my_orders_db);
    safeText('logoutBtn', t.logout);
    safeText('backToMenuBtn', t.back_menu);
    safeText('dbTitle', t.my_orders_db);
    safeText('dbRecordsTitle', t.db_records);

    safeText('lblTotalSpent', t.total_spent);
    safeText('lblTotalOrders', t.total_orders);
    safeText('lblLastAct', t.last_activity);

    safeText('verifyTitle', t.verify_student);
    safeText('verifyDesc', t.verify_desc);
    safeText('uploadCta', t.click_upload);

    safeText('mapModalTitle', t.select_loc_title);
    safeText('confirmLocationBtn', t.confirm_loc);
    safeText('useGpsBtn', t.btn_use_gps);
}

function safeText(id, text) {
    const el = document.getElementById(id);
    if (el && el.children.length === 0) el.textContent = text;
}
function safePlaceholder(id, text) {
    const el = document.getElementById(id);
    if (el) el.placeholder = text;
}

// --- APP LOGIC ---

const API_BASE = "http://localhost:5000/api";
const MENU_ITEMS = [
    { id: 101, category: 'burgers', name: 'Original Burger', price: 8.99, image: '🍔', desc: 'Flame-grilled with secret sauce.' },
    { id: 102, category: 'burgers', name: 'Cheese Explosion', price: 10.50, image: '🧀', desc: 'Double cheese, double joy.' },
    { id: 103, category: 'pizza', name: 'Pepperoni Classic', price: 12.00, image: '🍕', desc: 'Spicy pepperoni on crispy crust.' },
    { id: 104, category: 'pizza', name: 'Margherita', price: 11.00, image: '🍅', desc: 'Simple, fresh basil & mozzarella.' },
    { id: 105, category: 'asian', name: 'Sushi Set A', price: 15.00, image: '🍱', desc: 'Salmon, Tuna, and Avocado rolls.' },
    { id: 106, category: 'asian', name: 'Ramen Bowl', price: 13.50, image: '🍜', desc: 'Rich broth with chashu pork.' },
    { id: 107, category: 'drinks', name: 'Iced Latte', price: 4.50, image: '🥤', desc: 'Cold brew with oat milk.' },
    { id: 108, category: 'drinks', name: 'Green Tea', price: 3.00, image: '🍵', desc: 'Authentic Japanese sencha.' },
];
const CATEGORIES = [
    { id: 'all', name: 'All' },
    { id: 'burgers', name: 'Burgers' },
    { id: 'pizza', name: 'Pizza' },
    { id: 'asian', name: 'Asian' },
    { id: 'drinks', name: 'Drinks' }
];

let currentUser = null;
let currentCart = [];
let mapInstance = null;
let currentMarker = null;
let selectedLocation = {
    lat: 40.7128,
    lng: -74.0060,
    name: "Main Campus",
    address: "",
    street: "",
    houseNumber: "",
    city: ""
};

// --- DOM References ---
const cartItemsContainer = document.getElementById('cartItems');
const cartTotalDisplay = document.getElementById('cartTotal');
const checkoutBtn = document.getElementById('checkoutBtn');
const menuGrid = document.getElementById('menuGrid');
const categoryScroll = document.getElementById('categoryScroll');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

function init() {
    const savedLang = localStorage.getItem('campuseats_lang');
    if (savedLang) setLanguage(savedLang);
    else setLanguage('en');

    const savedUser = localStorage.getItem('campuseats_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        handleLoginSuccess();
    }
}

// --- AUTH HANDLERS ---
function handleLoginSuccess() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');
    document.getElementById('appContent').style.display = 'flex';
    document.querySelector('.navbar').style.display = 'grid';

    checkVerification();
    updateUserDisplay();
    renderCategories();
    renderMenu('all');
    loadLocalOrders();
    updateCartUI();
}

window.switchRole = function (role) {
    document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('active'));
    if (role === 'user') {
        document.getElementById('roleUser').classList.add('active');
        document.getElementById('restFields').classList.add('hidden');
    } else {
        document.getElementById('roleRest').classList.add('active');
        document.getElementById('restFields').classList.remove('hidden');
    }
};

window.switchAuthMode = function (mode) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    if (mode === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    } else {
        document.getElementById('tabSignup').classList.add('active');
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    }
};

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value;
    currentUser = {
        id: Date.now(),
        username: phone || "Student",
        phone: phone,
        balance: 50.00,
        verified: false
    };
    saveUser();
    handleLoginSuccess();
});

signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    currentUser = {
        id: Date.now(),
        username: name || "New User",
        balance: 100.00,
        verified: false
    };
    saveUser();
    handleLoginSuccess();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('campuseats_user');
    location.reload();
});

function saveUser() {
    localStorage.setItem('campuseats_user', JSON.stringify(currentUser));
}

// --- VERIFICATION ---
document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const statusDiv = document.getElementById('uploadStatus');
        statusDiv.classList.remove('hidden');
        statusDiv.textContent = TRANSLATIONS[currentLang].upload_status_pending;

        setTimeout(() => {
            statusDiv.textContent = TRANSLATIONS[currentLang].upload_status_verified;
            statusDiv.className = "upload-status status-verified";
            currentUser.verified = true;
            saveUser();
        }, 2000);
    }
});

function checkVerification() {
    if (currentUser.verified) {
        const statusDiv = document.getElementById('uploadStatus');
        if (statusDiv) {
            statusDiv.classList.remove('hidden');
            statusDiv.textContent = TRANSLATIONS[currentLang].upload_status_verified;
            statusDiv.className = "upload-status status-verified";
        }
    }
}

// --- GPS & MAP WITH REVERSE GEOCODING ---
document.getElementById('locationTrigger').addEventListener('click', openMap);
document.getElementById('closeMapBtn').addEventListener('click', () => document.getElementById('mapModal').classList.remove('open'));
document.getElementById('confirmLocationBtn').addEventListener('click', confirmLocation);
document.getElementById('useGpsBtn').addEventListener('click', useGPS);

function openMap() {
    const modal = document.getElementById('mapModal');
    modal.classList.add('open');
    if (!mapInstance) {
        mapInstance = L.map('leafletMap').setView([selectedLocation.lat, selectedLocation.lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapInstance);
        mapInstance.on('click', function (e) { placeMarker(e.latlng); });
        placeMarker({ lat: selectedLocation.lat, lng: selectedLocation.lng });
    }
    setTimeout(() => { mapInstance.invalidateSize(); }, 300);
}

async function placeMarker(latlng) {
    if (currentMarker) mapInstance.removeLayer(currentMarker);
    currentMarker = L.marker(latlng).addTo(mapInstance);
    selectedLocation.lat = latlng.lat;
    selectedLocation.lng = latlng.lng;

    const status = document.getElementById('locationStatus');
    status.innerHTML = `<small>Loading address...</small>`;

    // Reverse geocoding - get street address
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`);
        const data = await response.json();

        if (data && data.address) {
            const addr = data.address;
            const houseNumber = addr.house_number || '';
            const road = addr.road || addr.street || addr.pedestrian || '';
            const neighbourhood = addr.neighbourhood || addr.suburb || '';
            const city = addr.city || addr.town || addr.village || '';

            let addressParts = [];
            if (road) {
                if (houseNumber) addressParts.push(`${road}, ${houseNumber}`);
                else addressParts.push(road);
            }
            if (neighbourhood && neighbourhood !== road) addressParts.push(neighbourhood);
            if (city) addressParts.push(city);

            const fullAddress = addressParts.join(', ') || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;

            selectedLocation.address = fullAddress;
            selectedLocation.street = road;
            selectedLocation.houseNumber = houseNumber;
            selectedLocation.city = city;

            status.innerHTML = `<strong>📍 ${fullAddress}</strong><br><small>Lat: ${latlng.lat.toFixed(5)}, Lng: ${latlng.lng.toFixed(5)}</small>`;

        } else {
            selectedLocation.address = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
            status.textContent = `Pin: ${selectedLocation.address}`;
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        selectedLocation.address = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
        status.textContent = `Pin: ${selectedLocation.address}`;
    }
}

function useGPS() {
    const status = document.getElementById('locationStatus');
    status.textContent = TRANSLATIONS[currentLang].loc_using_gps;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            mapInstance.setView([lat, lng], 16);
            placeMarker({ lat, lng });
        }, (err) => {
            status.textContent = TRANSLATIONS[currentLang].loc_denied;
        });
    } else {
        status.textContent = "GPS Not Supported";
    }
}

function confirmLocation() {
    selectedLocation.name = selectedLocation.address || selectedLocation.name;
    updateUserDisplay();
    document.getElementById('mapModal').classList.remove('open');
}

function updateUserDisplay() {
    if (document.getElementById('navBalance') && currentUser) {
        document.getElementById('navBalance').textContent = currentUser.balance.toFixed(2);
    }
    if (document.getElementById('navLocationText')) {
        const displayName = selectedLocation.address || selectedLocation.name;
        document.getElementById('navLocationText').textContent = displayName.length > 30 ? displayName.substring(0, 30) + '...' : displayName;
    }
}

// --- CART & MENU ---
function renderCategories() {
    categoryScroll.innerHTML = '';
    CATEGORIES.forEach(cat => {
        const btn = document.createElement('div');
        btn.className = `cat-pill ${cat.id === 'all' ? 'active' : ''}`;
        btn.textContent = cat.name;
        btn.onclick = () => {
            document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMenu(cat.id);
        };
        categoryScroll.appendChild(btn);
    });
}

function renderMenu(category) {
    menuGrid.innerHTML = '';
    const items = category === 'all' ? MENU_ITEMS : MENU_ITEMS.filter(i => i.category === category);
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'food-card fade-in';
        card.innerHTML = `
            <div class="food-img">${item.image}</div>
            <div class="food-info">
                <div class="food-name">${item.name}</div>
                <div class="food-desc">${item.desc}</div>
                <div class="food-action">
                    <span class="food-price">$${item.price.toFixed(2)}</span>
                    <button class="btn-add" onclick="addToCart(${item.id})">+</button>
                </div>
            </div>`;
        menuGrid.appendChild(card);
    });
}

window.addToCart = function (itemId) {
    const item = MENU_ITEMS.find(i => i.id === itemId);
    const existing = currentCart.find(i => i.id === itemId);
    if (existing) existing.qty++;
    else currentCart.push({ ...item, qty: 1 });
    updateCartUI();
};

window.changeQty = function (itemId, delta) {
    const idx = currentCart.findIndex(i => i.id === itemId);
    if (idx > -1) {
        currentCart[idx].qty += delta;
        if (currentCart[idx].qty <= 0) currentCart.splice(idx, 1);
        updateCartUI();
    }
};

function updateCartUI() {
    if (!cartItemsContainer) return;
    cartItemsContainer.innerHTML = '';
    let total = 0;
    const t = TRANSLATIONS[currentLang];

    if (currentCart.length === 0) {
        cartItemsContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#999;">${t.basket_empty}</div>`;
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = t.browse;
    } else {
        currentCart.forEach(item => {
            total += item.price * item.qty;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.9rem; align-items:center;';
            row.innerHTML = `
                <span style="flex:1;">${item.name}</span> 
                <div class="cart-controls" style="display:flex;gap:6px;align-items:center;">
                    <button class="btn-qty" onclick="changeQty(${item.id}, -1)">−</button> 
                    <span style="min-width:20px; text-align:center; font-weight:600;">${item.qty}</span> 
                    <button class="btn-qty" onclick="changeQty(${item.id}, 1)">+</button>
                </div>`;
            cartItemsContainer.appendChild(row);
        });
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = `${t.checkout} ($${total.toFixed(2)})`;
    }
    cartTotalDisplay.textContent = total.toFixed(2);
}

// --- CHECKOUT & DB ---
checkoutBtn.addEventListener('click', handleCheckout);

async function handleCheckout() {
    if (!currentUser || currentCart.length === 0) return;
    const t = TRANSLATIONS[currentLang];
    const total = parseFloat(cartTotalDisplay.textContent);
    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = t.processing;

    const payload = {
        user_id: currentUser.id,
        total_amount: total,
        payment_method: 'card',
        delivery_lat: selectedLocation.lat,
        delivery_lng: selectedLocation.lng,
        delivery_address: selectedLocation.address || selectedLocation.name
    };

    try {
        try {
            await fetch(`${API_BASE}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) { }

        const newOrder = {
            id: Date.now(),
            date: new Date().toISOString(),
            items: [...currentCart],
            ...payload,
            status: 'pending'
        };

        let orders = getLocalOrders();
        orders.push(newOrder);
        localStorage.setItem(`campuseats_orders_${currentUser.id}`, JSON.stringify(orders));

        currentCart = [];
        updateCartUI();
        loadLocalOrders();
        alert(t.checkout + " Success!");

    } catch (err) { console.error(err); }
    finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = t.checkout;
    }
}

function getLocalOrders() {
    if (!currentUser) return [];
    const data = localStorage.getItem(`campuseats_orders_${currentUser.id}`);
    return data ? JSON.parse(data) : [];
}

function loadLocalOrders() {
    renderDatabaseStats();
}

function renderDatabaseStats() {
    const orders = getLocalOrders();
    const tableBody = document.getElementById('dbTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let totalSpent = 0;

    [...orders].reverse().forEach(order => {
        totalSpent += order.total_amount;
        const tr = document.createElement('tr');
        const dateStr = new Date(order.date || Date.now()).toLocaleString();
        const itemsStr = order.items ? order.items.map(i => `${i.qty}x ${i.name}`).join(', ') : '...';
        const locationStr = order.delivery_address || `${order.delivery_lat.toFixed(4)}, ${order.delivery_lng.toFixed(4)}`;

        tr.innerHTML = `
            <td>#${order.id.toString().slice(-6)}</td>
            <td>${dateStr}</td>
            <td>${itemsStr}</td>
            <td>${locationStr}</td>
            <td><span class="pill-badge" style="background:var(--primary-light);color:var(--primary);">${order.status}</span></td>
            <td><strong>$${order.total_amount.toFixed(2)}</strong></td>
        `;
        tableBody.appendChild(tr);
    });

    const t = TRANSLATIONS[currentLang];
    const statSpent = document.getElementById('statTotalSpent');
    const statOrders = document.getElementById('statTotalOrders');
    const statLast = document.getElementById('statLastOrder');

    if (statSpent) statSpent.textContent = '$' + totalSpent.toFixed(2);
    if (statOrders) statOrders.textContent = orders.length;
    if (statLast) statLast.textContent = orders.length > 0 ? new Date(orders[orders.length - 1].date).toLocaleDateString() : 'N/A';
}

window.showSection = function (section) {
    const dash = document.getElementById('dashboardSection');
    const stats = document.getElementById('statsSection');

    if (section === 'stats') {
        dash.classList.add('hidden');
        stats.classList.remove('hidden');
        renderDatabaseStats();
    } else {
        stats.classList.add('hidden');
        dash.classList.remove('hidden');
    }
    document.querySelector('.navbar').style.display = 'grid';
}

// Modal
const settingsModal = document.getElementById('settingsModal');
document.getElementById('profileBtn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
document.getElementById('closeSettingsBtn').addEventListener('click', () => settingsModal.classList.add('hidden'));
document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    settingsModal.classList.add('hidden');
    alert("Settings Saved!");
});

init();