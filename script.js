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
        names: [
            "Azure Dobby Midi Dress", "Sienna Pleated Day Dress", "Noir Botanical Blouse Set", "Ivory Riviera Wrap Dress",
            "Celeste Linen Co-ord", "Marigold Junior Occasion Dress", "Rosewood Satin Blouse", "Ivory Maroon Embroidered Suit",
            "Lagoon Resort Shirt Dress", "Bordeaux Tailored Jumpsuit", "Pearl Jacquard Evening Dress", "Terracotta Belted Midi Dress",
            "Sage Cotton Poplin Set", "Midnight Velvet Occasion Dress", "Champagne Draped Blouse", "Coral Riviera Maxi Dress",
            "Emerald Brocade Jacket Set", "Sandstone Minimalist Co-ord", "Verona Woven Cape", "Cobalt Pleated Column Dress"
        ],
        prices: [69.90,74.90,79.90,64.90,72.90,76.90,68.90,82.90,71.90,77.90,84.90,73.90,66.90,81.90,75.90,78.90,86.90,70.90,83.90,79.90],
        sizes: [sizes.standardXL,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.youth,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.xs,sizes.standard,sizes.standardXL,sizes.xs,"One Size",sizes.standardXL]
    },
    men: {
        code: "MN", category: "Men's Fashion", imageFolder: "men", imageSuffix: "m",
        names: [
            "Navy Riviera Linen Shirt", "Stone Harbour Polo", "Charcoal Executive Overshirt", "Espresso Signature Suit",
            "Atlantic Textured Knit Polo", "Sand Tailored Chino", "Midnight Double-Breasted Suit", "Olive Resort Camp Shirt",
            "Graphite Formal Waistcoat", "Modern Tailored Blazer", "Bordeaux Merino Polo", "Ivory Coastal Shirt",
            "Slate Weekend Bomber", "Indigo Mandarin-Collar Shirt", "Urban Linen Layered Set", "Camel Heritage Overshirt",
            "Marine Pique Polo", "Onyx Travel Co-ord", "Pearl Grey Ceremony Suit", "Mediterranean Linen Suit"
        ],
        prices: [89.90,94.90,99.90,84.90,92.90,96.90,104.90,87.90,98.90,91.90,106.90,93.90,88.90,101.90,95.90,103.90,90.90,97.90,108.90,99.90],
        sizes: [sizes.standardXL,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.waist,sizes.euXL,sizes.menXL,sizes.eu,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.menXL,sizes.waist,sizes.menXL,sizes.menXL,sizes.standardXL,sizes.eu,sizes.euXL]
    },
    accessories: {
        code: "AC", category: "Accessories", imageFolder: "accessories", imageSuffix: "a",
        names: [
            "Canvas Equestrian Travel Bag", "Monogram Weekend Holdall", "Coastal Stripe Tote Set", "Saffiano Document Case",
            "Heritage Leather Briefcase", "Riviera Woven Sun Hat", "Noir Executive Card Holder", "Porto Structured Handbag",
            "Cognac Bifold Wallet", "Marina Braided Belt", "Aurelia Classic Timepiece", "Linen Resort Scarf",
            "Oxford Leather Key Case", "Lisbon City Crossbody", "Évora Weekender Set", "Atlantic Canvas Cap",
            "Verona Chain Shoulder Bag", "Minimalist Travel Organiser", "Regent Automatic Watch", "Algarve Woven Tote"
        ],
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
        type, category: group.category, name: group.names[index],
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
        const media = document.createElement("div"); media.className = "product-media";
        const image = document.createElement("img");
        image.src = product.image; image.alt = product.name; image.loading = "lazy";
        image.addEventListener("error", () => { image.alt = "Product image unavailable"; image.classList.add("image-error"); }, { once: true });
        const badge = document.createElement("span"); badge.className = "product-badge"; badge.textContent = "Wholesale";
        media.append(image, badge);
        const info = document.createElement("div"); info.className = "product-info";
        const name = document.createElement("h3"); name.className = "product-name"; name.textContent = product.name;
        const category = document.createElement("p"); category.className = "product-category"; category.textContent = product.category;
        const price = document.createElement("p"); price.className = "product-price"; price.innerHTML = `<span>Unit price</span><strong>${euros(product.price)}</strong><small>per unit</small>`;
        const moq = document.createElement("p"); moq.className = "product-moq"; moq.innerHTML = `<span>Minimum order</span><strong>${product.moq} units</strong>`;
        const reference = document.createElement("p"); reference.className = "product-reference"; reference.innerHTML = `<span>Product reference</span><strong>${product.sku}</strong>`;
        info.append(name, category, price, moq, reference);
        const controls = document.createElement("div"); controls.className = "product-order-controls";
        const select = document.createElement("select"); select.setAttribute("aria-label", `Size for ${product.sku}`);
        sizeOptions(product).forEach(value => select.add(new Option(value, value)));
        const quantity = document.createElement("input"); quantity.type = "number"; quantity.min = String(product.moq); quantity.step = "1"; quantity.value = String(product.moq); quantity.setAttribute("aria-label", `Quantity for ${product.sku}`);
        const sizeField = document.createElement("label"); sizeField.className = "product-field"; sizeField.append(Object.assign(document.createElement("span"), { textContent: "Sizes" }), select);
        const quantityField = document.createElement("label"); quantityField.className = "product-field"; quantityField.append(Object.assign(document.createElement("span"), { textContent: "Quantity" }), quantity);
        const button = document.createElement("button"); button.className = "btn add-order-btn"; button.type = "button"; button.innerHTML = '<span>Add to Order</span><span aria-hidden="true">&#8594;</span>';
        button.addEventListener("click", () => {
            if (Number(quantity.value) < product.moq) { quantity.value = String(product.moq); quantity.setCustomValidity(`Minimum order is ${product.moq} units.`); quantity.reportValidity(); quantity.setCustomValidity(""); return; }
            addToCart(product.sku, select.value, quantity.value);
            button.classList.add("is-added"); button.innerHTML = '<span>Added to Order</span><span aria-hidden="true">&#10003;</span>';
            setTimeout(() => { button.classList.remove("is-added"); button.innerHTML = '<span>Add to Order</span><span aria-hidden="true">&#8594;</span>'; }, 1400);
        });
        controls.append(sizeField, quantityField); card.append(media, info, controls, button); return card;
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
    document.querySelectorAll(".featured-add[data-sku]").forEach(featuredButton => featuredButton.addEventListener("click", () => {
        const product = getProduct(featuredButton.dataset.sku); const size = featuredButton.closest(".shop-product-info")?.querySelector(".featured-size select")?.value;
        if (!product || !size) return;
        addToCart(product.sku, size, product.moq); featuredButton.classList.add("is-added"); featuredButton.textContent = "Added to Order";
        setTimeout(() => { featuredButton.classList.remove("is-added"); featuredButton.textContent = "Add to Order"; }, 1400);
    }));
    if (!button || !navigation) return;
    const setMenu = open => { navigation.classList.toggle("active", open); button.setAttribute("aria-expanded", String(open)); };
    button.setAttribute("aria-expanded", "false"); const closeMenu = () => setMenu(false);
    button.addEventListener("click", () => setMenu(!navigation.classList.contains("active")));
    navigation.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
    document.addEventListener("click", event => { if (navigation.classList.contains("active") && !navigation.contains(event.target) && !button.contains(event.target)) closeMenu(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMenu(); button.focus(); } });
});
