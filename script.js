// RIVAL PRAXIS - SHARED PRODUCT CATALOGUE AND WHOLESALE ORDER CART

const RP_CART_KEY = "rivalPraxisWholesaleCartV1";
const dot = " \u2022 ";
const sizes = {
    standard: ["S", "M", "L"].join(dot), standardXL: ["S", "M", "L", "XL"].join(dot),
    youth: ["4Y", "6Y", "8Y", "10Y"].join(dot), xs: ["XS", "S", "M", "L"].join(dot),
    menXL: ["M", "L", "XL"].join(dot), waist: ["30", "32", "34", "36"].join(dot),
    eu: ["48", "50", "52"].join(dot), euXL: ["48", "50", "52", "54"].join(dot)
};

const productGroups = {
    women: {
        code: "WM", category: "Women's Fashion", imageFolder: "women", imageSuffix: "w",
        prices: [69.90,74.90,79.90,64.90,72.90,76.90,68.90,82.90,71.90,77.90,84.90,73.90,66.90,81.90,75.90,78.90,86.90,70.90,83.90,79.90],
        sizes: [sizes.standardXL,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.youth,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.xs,sizes.standard,sizes.standardXL,sizes.xs,"One Size",sizes.standardXL]
    },
    men: {
        code: "MN", category: "Men's Fashion", imageFolder: "men", imageSuffix: "m",
        prices: [89.90,94.90,99.90,84.90,92.90,96.90,104.90,87.90,98.90,91.90,106.90,93.90,88.90,101.90,95.90,103.90,90.90,97.90,108.90,99.90],
        sizes: [sizes.standardXL,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.waist,sizes.euXL,sizes.menXL,sizes.eu,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.menXL,sizes.waist,sizes.menXL,sizes.menXL,sizes.standardXL,sizes.eu,sizes.euXL]
    },
    accessories: {
        code: "AC", category: "Accessories", imageFolder: "accessories", imageSuffix: "a",
        prices: [24.90,29.90,39.90,44.90,49.90,27.90,34.90,41.90,32.90,46.90,52.90,36.90,28.90,43.90,54.90,31.90,47.90,38.90,56.90,42.90],
        sizes: Array(20).fill("One Size")
    }
};

function productMoq(type, index) {
    return type === "accessories" ? (index < 2 ? 600 : index < 4 ? 500 : 400) : (index < 3 ? 500 : 400);
}

const RIVAL_PRODUCTS = Object.freeze(Object.entries(productGroups).flatMap(([type, group]) =>
    group.prices.map((price, index) => Object.freeze({
        sku: `RP-${group.code}-${String(index + 1).padStart(4, "0")}`,
        legacyReference: `${type.toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
        type, category: group.category, name: `${group.category} Style ${String(index + 1).padStart(2, "0")}`,
        image: `images/${group.imageFolder}/${index + 1}${group.imageSuffix}.jpg`,
        sizes: group.sizes[index] || "One Size", price, moq: productMoq(type, index)
    }))
));
window.RIVAL_PRODUCTS = RIVAL_PRODUCTS;

const euros = value => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
const getProduct = sku => RIVAL_PRODUCTS.find(product => product.sku === sku);
const sizeOptions = product => product.sizes.split(dot).map(value => value.trim()).filter(Boolean);

function readCart() {
    try { return JSON.parse(localStorage.getItem(RP_CART_KEY)) || []; } catch { return []; }
}
function writeCart(cart) {
    localStorage.setItem(RP_CART_KEY, JSON.stringify(cart));
    updateCartBadge();
    window.dispatchEvent(new CustomEvent("rival-cart-change", { detail: cart }));
}
function cartCount() { return readCart().length; }
function updateCartBadge() {
    document.querySelectorAll(".cart-count").forEach(badge => { badge.textContent = String(cartCount()); });
}
function addToCart(sku, size, quantity) {
    const product = getProduct(sku);
    const qty = Math.max(product?.moq || 1, Math.floor(Number(quantity) || 0));
    if (!product) return;
    const cart = readCart();
    const existing = cart.find(item => item.sku === sku && item.size === size);
    if (existing) existing.quantity += qty;
    else cart.push({ sku, size, quantity: qty });
    writeCart(cart);
}
window.RIVAL_CART = Object.freeze({ read: readCart, write: writeCart, add: addToCart, product: getProduct, money: euros, key: RP_CART_KEY });

function loadProducts(type) {
    const gallery = document.getElementById("gallery");
    const products = RIVAL_PRODUCTS.filter(product => product.type === type);
    if (!gallery || !products.length) return;
    gallery.replaceChildren(...products.map(product => {
        const card = document.createElement("article");
        card.className = "product-card"; card.dataset.reference = `${product.sku} ${product.legacyReference}`;
        const image = document.createElement("img");
        image.src = product.image; image.alt = `${product.sku} product image`; image.loading = "lazy";
        image.addEventListener("error", () => { image.alt = "Product image unavailable"; image.classList.add("image-error"); }, { once: true });
        const reference = document.createElement("p"); reference.className = "product-reference"; reference.textContent = product.sku;
        const price = document.createElement("p"); price.className = "product-price"; price.textContent = `${euros(product.price)} per unit`;
        const moq = document.createElement("p"); moq.className = "product-moq"; moq.textContent = `Minimum order: ${product.moq} units`;
        const controls = document.createElement("div"); controls.className = "product-order-controls";
        const select = document.createElement("select"); select.setAttribute("aria-label", `Size for ${product.sku}`);
        sizeOptions(product).forEach(value => select.add(new Option(value, value)));
        const quantity = document.createElement("input"); quantity.type = "number"; quantity.min = String(product.moq); quantity.step = "1"; quantity.value = String(product.moq); quantity.setAttribute("aria-label", `Quantity for ${product.sku}`);
        const button = document.createElement("button"); button.className = "btn add-order-btn"; button.type = "button"; button.textContent = "Add to Order";
        button.addEventListener("click", () => {
            if (Number(quantity.value) < product.moq) { quantity.value = String(product.moq); quantity.setCustomValidity(`Minimum order is ${product.moq} units.`); quantity.reportValidity(); quantity.setCustomValidity(""); return; }
            addToCart(product.sku, select.value, quantity.value);
            button.textContent = "Added to Order"; setTimeout(() => { button.textContent = "Add to Order"; }, 1400);
        });
        controls.append(select, quantity); card.append(image, reference, price, moq, controls, button); return card;
    }));
}

function searchProducts() {
    const input = document.getElementById("search"); if (!input) return;
    const filter = input.value.trim().toLowerCase();
    document.querySelectorAll(".product-card").forEach(card => { card.hidden = !`${card.textContent} ${card.dataset.reference || ""}`.toLowerCase().includes(filter); });
}

document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header"), button = document.querySelector(".menu-toggle"), navigation = document.querySelector("nav");
    const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 8); updateHeader(); window.addEventListener("scroll", updateHeader, { passive: true });
    if (navigation && !navigation.querySelector(".cart-link")) {
        const cartLink = document.createElement("a"); cartLink.href = "order.html"; cartLink.className = "cart-link"; cartLink.innerHTML = 'Order Cart <span class="cart-count" aria-label="items in cart">0</span>'; navigation.append(cartLink);
    }
    updateCartBadge();
    if (!button || !navigation) return;
    const setMenu = open => { navigation.classList.toggle("active", open); button.setAttribute("aria-expanded", String(open)); };
    button.setAttribute("aria-expanded", "false"); const closeMenu = () => setMenu(false);
    button.addEventListener("click", () => setMenu(!navigation.classList.contains("active")));
    navigation.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
    document.addEventListener("click", event => { if (navigation.classList.contains("active") && !navigation.contains(event.target) && !button.contains(event.target)) closeMenu(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMenu(); button.focus(); } });
});
