// RIVAL PRAXIS - SHARED PRODUCT CATALOGUE AND WHOLESALE ORDER CART

const RP_CART_KEY = "rivalPraxisWholesaleCartV1";
const dot = " \u2022 ";
const sizes = {
    standard: ["S", "M", "L"].join(dot), standardXL: ["S", "M", "L", "XL"].join(dot),
    youth: ["4Y", "6Y", "8Y", "10Y"].join(dot), xs: ["XS", "S", "M", "L"].join(dot),
    menXL: ["M", "L", "XL"].join(dot), waist: ["30", "32", "34", "36"].join(dot),
    eu: ["48", "50", "52"].join(dot), euXL: ["48", "50", "52", "54"].join(dot),
    shoes: ["EU 36", "EU 37", "EU 38", "EU 39", "EU 40"].join(dot)
};

const productGroups = {
    women: {
        code: "WM", imageFolder: "women", imageSuffix: "w",
        names: [
            "Powder Blue Belted Tiered Midi Dress", "Olive Button-Front Tailored Playsuit", "Midnight Floral Satin Trouser Set", "Sand Sleeveless Draped Jumpsuit",
            "Cobalt Porcelain Print Halter Set", "Buttercream Ruffle Blouse and Shorts Set", "Mosaic Print Puff-Sleeve Blouse", "Ivory Burgundy Embroidered Tunic Set",
            "White Linen Shirt and Black Shorts Set", "Natural Crochet Resort Maxi Dress", "Emerald Scallop-Trim Swing Dress", "Black Strapless Tiered Maxi Dress",
            "Black Blouse and Denim Shorts Set", "Indigo Belted Denim Jumpsuit", "Pastel Watercolour Shift Dress", "Powder Blue Crop Top and Skirt Set",
            "White Fitted Tee and Black Shorts Set", "Sky Blue Pinstripe Shirt and Shorts Set", "Aqua Tiered Beach Maxi Dress", "Ecru Knit Tee and Shorts Set",
            "Pearl Boucle Jacket and Midi Skirt", "Sapphire Satin Wrap Maxi Dress", "Terracotta Linen Waistcoat and Trousers", "Emerald Pleated Halter Maxi Dress",
            "Blush Embroidered Bolero and Dress", "Charcoal Pinstripe Waistcoat and Trousers", "Ivory Chiffon Long-Sleeve Midi Dress", "Teal Belted Satin Shirt Dress",
            "Burgundy Velvet Blazer and Trousers", "Sand Crochet Tunic and Trousers"
        ],
        categories: [
            "Women's Tiered Dresses", "Women's Tailored Playsuits", "Women's Floral Trouser Sets", "Women's Draped Jumpsuits",
            "Women's Printed Halter Sets", "Women's Blouse and Shorts Sets", "Women's Printed Blouses", "Women's Embroidered Tunic Sets",
            "Women's Shirt and Shorts Sets", "Women's Crochet Maxi Dresses", "Women's Swing Dresses", "Women's Strapless Maxi Dresses",
            "Women's Blouse and Shorts Sets", "Women's Denim Jumpsuits", "Women's Shift Dresses", "Women's Crop Top and Skirt Sets",
            "Women's Tee and Shorts Sets", "Women's Shirt and Shorts Sets", "Women's Beach Maxi Dresses", "Women's Knit Shorts Sets",
            "Women's Boucle Skirt Suits", "Women's Satin Maxi Dresses", "Women's Linen Waistcoat Sets", "Women's Pleated Maxi Dresses",
            "Women's Embroidered Dress Sets", "Women's Pinstripe Waistcoat Sets", "Women's Chiffon Midi Dresses", "Women's Satin Shirt Dresses",
            "Women's Velvet Trouser Suits", "Women's Crochet Trouser Sets"
        ],
        prices: [69.90,74.90,79.90,64.90,72.90,76.90,68.90,82.90,71.90,77.90,84.90,73.90,66.90,81.90,75.90,78.90,86.90,70.90,83.90,79.90,88.90,76.90,84.90,79.90,74.90,86.90,81.90,83.90,92.90,78.90],
        sizes: [sizes.standardXL,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.youth,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.xs,sizes.standard,sizes.standardXL,sizes.xs,"One Size",sizes.standardXL,sizes.xs,sizes.standardXL,sizes.standardXL,sizes.standard,sizes.xs,sizes.standardXL,sizes.xs,sizes.standardXL,sizes.standardXL,sizes.standard]
    },
    men: {
        code: "MN", imageFolder: "men", imageSuffix: "m",
        names: [
            "Ivory Linen Resort Shirt and Shorts", "Midnight Botanical Resort Shirt", "Navy Polo and Sand Chinos Set", "Espresso Tailored Business Suit",
            "Ecru Linen Shirt and Blue Shorts", "Sage Mandarin Shirt and White Trousers", "Blush Polo and Cobalt Trousers", "Ivory Stripe Short-Sleeve Shirt",
            "Navy Breton Tee and Black Trousers", "Stone Linen Blazer and Trousers", "Navy Single-Breasted Summer Suit", "Light Wash Denim Jacket",
            "Sand Linen Blazer and White Trousers", "White Linen Shirt and Taupe Trousers", "Ecru Cardigan and Teal Trousers", "Navy Overshirt and Shorts Set",
            "Red Check Short-Sleeve Shirt", "Black Resort Shirt and Pale Denim", "Taupe Cuban Shirt and Pinstripe Trousers", "Citron Pocket Tee and Black Trousers",
            "Forest Overshirt and Black Trousers", "Navy Bomber and Stone Trousers", "Camel Double-Breasted Blazer and Black Trousers", "Sky Linen Resort Shirt and Shorts",
            "Charcoal Quarter-Zip and Grey Trousers", "Ecru Polo and Olive Trousers", "Burgundy Corduroy Overshirt", "Charcoal Windowpane Three-Piece Suit",
            "Rust Suede Trucker Jacket", "White Band-Collar Shirt and Navy Trousers"
        ],
        categories: [
            "Men's Linen Resort Sets", "Men's Printed Resort Shirts", "Men's Polo and Chino Sets", "Men's Business Suits",
            "Men's Linen Shirt and Shorts Sets", "Men's Mandarin Shirts", "Men's Polo and Trouser Sets", "Men's Striped Shirts",
            "Men's Breton Tee Sets", "Men's Linen Blazer Sets", "Men's Summer Suits", "Men's Denim Jackets",
            "Men's Linen Blazer Sets", "Men's Linen Shirt Sets", "Men's Cardigan Sets", "Men's Overshirt and Shorts Sets",
            "Men's Check Shirts", "Men's Resort Shirts", "Men's Cuban Shirt Sets", "Men's Pocket Tee Sets",
            "Men's Overshirt Sets", "Men's Bomber Jacket Sets", "Men's Double-Breasted Blazer Sets", "Men's Linen Resort Sets",
            "Men's Quarter-Zip Sets", "Men's Polo and Trouser Sets", "Men's Corduroy Overshirts", "Men's Three-Piece Suits",
            "Men's Trucker Jackets", "Men's Band-Collar Shirt Sets"
        ],
        prices: [89.90,94.90,99.90,84.90,92.90,96.90,104.90,87.90,98.90,91.90,106.90,93.90,88.90,101.90,95.90,103.90,90.90,97.90,108.90,99.90,94.90,89.90,109.90,86.90,82.90,91.90,96.90,119.90,104.90,84.90],
        sizes: [sizes.standardXL,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.waist,sizes.euXL,sizes.menXL,sizes.eu,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.menXL,sizes.waist,sizes.menXL,sizes.menXL,sizes.standardXL,sizes.eu,sizes.euXL,sizes.standardXL,sizes.standardXL,sizes.euXL,sizes.standardXL,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.euXL,sizes.standardXL,sizes.standardXL]
    },
    accessories: {
        code: "AC", imageFolder: "accessories", imageSuffix: "a",
        names: [
            "Sand Canvas Zip-Top Carry Bag", "Natural Crochet Shoulder Tote", "Blue Stripe Seersucker Travel Pouch Set", "Black Gold Cat-Eye Sunglasses",
            "Navy Sport Sunglasses Pair", "Cognac Leather Family Photo Wallet", "Cobalt Quilted Belt Bag", "Taupe Leather Zip Card Holder",
            "Crimson Leather Card Wallet", "Monogram Zip Card Organiser", "Mocha Leather Bifold Wallet Set", "Black Floral Embroidered Ankle Boots",
            "Assorted Cotton Baseball Cap Set", "Olive Felt Fedora Hat", "Silver Black Chronograph Watch", "Black Steel Dive Watch",
            "Pearl Ceramic Skeleton Watch", "Silver Dress Watch Duo", "Ocean Blue Eau de Parfum", "Ruby Floral Eau de Parfum"
        ],
        categories: [
            "Canvas Carry Bags", "Crochet Tote Bags", "Travel Pouch Sets", "Cat-Eye Sunglasses",
            "Sport Sunglasses", "Leather Photo Wallets", "Quilted Belt Bags", "Leather Card Holders",
            "Leather Card Wallets", "Zip Card Organisers", "Leather Wallet Sets", "Embroidered Ankle Boots",
            "Baseball Cap Sets", "Felt Fedora Hats", "Chronograph Watches", "Dive Watches",
            "Skeleton Watches", "Dress Watch Sets", "Men's Fragrances", "Women's Fragrances"
        ],
        prices: [24.90,29.90,39.90,44.90,49.90,27.90,34.90,41.90,32.90,46.90,52.90,36.90,28.90,43.90,54.90,31.90,47.90,38.90,56.90,42.90],
        sizes: Array.from({ length: 20 }, (_, index) => index === 11 ? sizes.shoes : "One Size")
    }
};

function productMoq(type, index) {
    return type === "accessories" ? (index < 2 ? 600 : index < 4 ? 500 : 400) : (index < 3 ? 500 : 400);
}

const RIVAL_PRODUCTS = Object.freeze(Object.entries(productGroups).flatMap(([type, group]) =>
    group.prices.map((price, index) => Object.freeze({
        sku: `RP-${group.code}-${String(index + 1).padStart(4, "0")}`,
        legacyReference: `${type.toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
        type, category: group.categories[index], name: group.names[index],
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
