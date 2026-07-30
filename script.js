// RIVAL PRAXIS - PRODUCT CATALOG

const dot = " \u2022 ";
const sizes = {
    standard: ["S", "M", "L"].join(dot),
    standardXL: ["S", "M", "L", "XL"].join(dot),
    youth: ["4Y", "6Y", "8Y", "10Y"].join(dot),
    xs: ["XS", "S", "M", "L"].join(dot),
    menXL: ["M", "L", "XL"].join(dot),
    waist: ["30", "32", "34", "36"].join(dot),
    eu: ["48", "50", "52"].join(dot),
    euXL: ["48", "50", "52", "54"].join(dot)
};

function createProducts(folder, suffix, productSizes = []) {
    return Array.from({ length: 20 }, (_, index) => ({
        image: `images/${folder}/${index + 1}${suffix}.jpg`,
        ...(productSizes[index] && { sizes: productSizes[index] })
    }));
}

const catalog = {
    women: createProducts("women", "w", [sizes.standardXL, sizes.standard, sizes.standardXL, sizes.standard, sizes.standard, sizes.youth, sizes.standard, sizes.standardXL, sizes.standard, sizes.standard, sizes.standardXL, sizes.standard, sizes.standard, sizes.standardXL, sizes.xs, sizes.standard, sizes.standardXL, sizes.xs, "One Size", sizes.standardXL]),
    men: createProducts("men", "m", [sizes.standardXL, sizes.standardXL, sizes.standardXL, sizes.menXL, sizes.standardXL, sizes.waist, sizes.euXL, sizes.menXL, sizes.eu, sizes.standardXL, sizes.standardXL, sizes.menXL, sizes.standardXL, sizes.menXL, sizes.waist, sizes.menXL, sizes.menXL, sizes.standardXL, sizes.eu, sizes.euXL]),
    accessories: createProducts("accessories", "a")
};

function getQuoteLink(reference) {
    const subject = `Quotation Request - ${reference}`;
    const body = `Hello RIVAL PRAXIS,\n\nI would like to request a quotation for product reference: ${reference}.\n\nPlease send me more information about availability, minimum order quantity and pricing.\n\nThank you.`;
    return `mailto:rivalpraxisunipessoallda@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function loadProducts(type) {
    const gallery = document.getElementById("gallery");
    const products = catalog[type];
    if (!gallery || !products) return;

    gallery.replaceChildren(...products.map((product, index) => {
        const reference = `${type.toUpperCase()}-${String(index + 1).padStart(2, "0")}`;
        const card = document.createElement("div");
        const image = document.createElement("img");
        const button = document.createElement("a");
        card.className = "product-card";
        card.dataset.reference = reference;
        image.src = product.image;
        image.alt = `${reference} product image`;
        image.loading = "lazy";
        image.addEventListener("error", () => { image.alt = "Product image unavailable"; image.classList.add("image-error"); }, { once: true });
        card.append(image);
        if (product.sizes) {
            const sizeText = document.createElement("p");
            const label = document.createElement("strong");
            sizeText.className = "product-sizes";
            label.textContent = "Sizes:";
            sizeText.append(label, ` ${product.sizes}`);
            card.append(sizeText);
        }
        button.className = "btn";
        button.textContent = "Request a Quote";
        button.href = getQuoteLink(reference);
        card.append(button);
        return card;
    }));
}

function searchProducts() {
    const input = document.getElementById("search");
    if (!input) return;
    const filter = input.value.trim().toLowerCase();
    document.querySelectorAll(".product-card").forEach((card) => {
        card.hidden = !`${card.textContent} ${card.dataset.reference || ""}`.toLowerCase().includes(filter);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    const button = document.querySelector(".menu-toggle");
    const navigation = document.querySelector("nav");
    const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    if (!button || !navigation) return;
    const closeMenu = () => navigation.classList.remove("active");
    button.addEventListener("click", () => navigation.classList.toggle("active"));
    navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("click", (event) => {
        if (navigation.classList.contains("active") && !navigation.contains(event.target) && !button.contains(event.target)) closeMenu();
    });
});
