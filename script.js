// RIVAL PRAXIS - PRODUCT CATALOG

const catalog = {
    women: [
        { image: "images/women/1w.jpg", sizes: "S • M • L • XL" },
        { image: "images/women/2w.jpg", sizes: "S • M • L" },
        { image: "images/women/3w.jpg", sizes: "S • M • L • XL" },
        { image: "images/women/4w.jpg", sizes: "S • M • L" },
        { image: "images/women/5w.jpg", sizes: "S • M • L" },
        { image: "images/women/6w.jpg", sizes: "4Y • 6Y • 8Y • 10Y" },
        { image: "images/women/7w.jpg", sizes: "S • M • L" },
        { image: "images/women/8w.jpg", sizes: "S • M • L • XL" },
        { image: "images/women/9w.jpg", sizes: "S • M • L" },
        { image: "images/women/10w.jpg", sizes: "S • M • L" },
        { image: "images/women/11w.jpg", sizes: "S • M • L • XL" },
        { image: "images/women/12w.jpg", sizes: "S • M • L" },
        { image: "images/women/13w.jpg", sizes: "S • M • L" },
        { image: "images/women/14w.jpg", sizes: "S • M • L • XL" },
        { image: "images/women/15w.jpg", sizes: "XS • S • M • L" },
        { image: "images/women/16w.jpg", sizes: "S • M • L" },
        { image: "images/women/17w.jpg", sizes: "S • M • L • XL" },
        { image: "images/women/18w.jpg", sizes: "XS • S • M • L" },
        { image: "images/women/19w.jpg", sizes: "One Size" },
        { image: "images/women/20w.jpg", sizes: "S • M • L • XL" }
    ],

    men: [
        { image: "images/men/1m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/2m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/3m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/4m.jpg", sizes: "M • L • XL" },
        { image: "images/men/5m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/6m.jpg", sizes: "30 • 32 • 34 • 36" },
        { image: "images/men/7m.jpg", sizes: "48 • 50 • 52 • 54" },
        { image: "images/men/8m.jpg", sizes: "M • L • XL" },
        { image: "images/men/9m.jpg", sizes: "48 • 50 • 52" },
        { image: "images/men/10m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/11m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/12m.jpg", sizes: "M • L • XL" },
        { image: "images/men/13m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/14m.jpg", sizes: "M • L • XL" },
        { image: "images/men/15m.jpg", sizes: "30 • 32 • 34 • 36" },
        { image: "images/men/16m.jpg", sizes: "M • L • XL" },
        { image: "images/men/17m.jpg", sizes: "M • L • XL" },
        { image: "images/men/18m.jpg", sizes: "S • M • L • XL" },
        { image: "images/men/19m.jpg", sizes: "48 • 50 • 52" },
        { image: "images/men/20m.jpg", sizes: "48 • 50 • 52 • 54" }
    ],

    accessories: [
        { image: "images/accessories/1a.jpg" },
        { image: "images/accessories/2a.jpg" },
        { image: "images/accessories/3a.jpg" },
        { image: "images/accessories/4a.jpg" },
        { image: "images/accessories/5a.jpg" },
        { image: "images/accessories/6a.jpg" },
        { image: "images/accessories/7a.jpg" },
        { image: "images/accessories/8a.jpg" },
        { image: "images/accessories/9a.jpg" },
        { image: "images/accessories/10a.jpg" },
        { image: "images/accessories/11a.jpg" },
        { image: "images/accessories/12a.jpg" },
        { image: "images/accessories/13a.jpg" },
        { image: "images/accessories/14a.jpg" },
        { image: "images/accessories/15a.jpg" },
        { image: "images/accessories/16a.jpg" },
        { image: "images/accessories/17a.jpg" },
        { image: "images/accessories/18a.jpg" },
        { image: "images/accessories/19a.jpg" },
        { image: "images/accessories/20a.jpg" }
    ]
};

function loadProducts(type) {
    const gallery = document.getElementById("gallery");
    if (!gallery || !catalog[type]) return;

    gallery.innerHTML = "";

    catalog[type].forEach((product, index) => {
        const reference = `${type.toUpperCase()}-${String(index + 1).padStart(2, "0")}`;

        const card = document.createElement("div");
        card.className = "product-card";
        card.dataset.reference = reference;

        const image = document.createElement("img");
        image.src = product.image;
        image.alt = `${reference} product image`;
        image.loading = "lazy";
        image.onerror = function () {
            this.alt = "Product image unavailable";
            this.classList.add("image-error");
        };
        card.appendChild(image);

        if (product.sizes) {
            const sizes = document.createElement("p");
            sizes.className = "product-sizes";
            sizes.innerHTML = `<strong>Sizes:</strong> ${product.sizes}`;
            card.appendChild(sizes);
        }

        const button = document.createElement("a");
        button.className = "btn";
        button.textContent = "Request a Quote";
        button.href =
            "mailto:rivalpraxisunipessoallda@gmail.com" +
            "?subject=" + encodeURIComponent("Quotation Request - " + reference) +
            "&body=" + encodeURIComponent(
                "Hello RIVAL PRAXIS,\n\n" +
                "I would like to request a quotation for product reference: " + reference + ".\n\n" +
                "Please send me more information about availability, minimum order quantity and pricing.\n\n" +
                "Thank you."
            );
        card.appendChild(button);

        gallery.appendChild(card);
    });
}

function searchProducts() {
    const input = document.getElementById("search");
    if (!input) return;

    const filter = input.value.toLowerCase().trim();

    document.querySelectorAll(".product-card").forEach(card => {
        const searchable = (
            card.textContent + " " + (card.dataset.reference || "")
        ).toLowerCase();

        card.style.display = searchable.includes(filter) ? "" : "none";
    });
}
