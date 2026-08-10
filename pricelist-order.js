(() => {
  const tableBody = document.getElementById("price-list-body");
  if (!tableBody || !window.RIVAL_PRODUCTS) return;
  tableBody.replaceChildren(...RIVAL_PRODUCTS.map(product => {
    const row = document.createElement("tr");
    [["Product",product.name],["Category",product.category],["Reference",product.sku],["Sizes",product.sizes],["MOQ",`${product.moq} pcs`],["Wholesale Price",RIVAL_CART.money(product.price)]].forEach(([label,value], index) => {
      const cell = document.createElement("td"); cell.dataset.label = label; cell.textContent = value; if (index === 5) cell.className = "price"; row.append(cell);
    });
    const action = document.createElement("td"); action.dataset.label = "Order / Quote";
    const actions = document.createElement("div"); actions.className = "price-actions";
    const link = document.createElement("a"); link.className = "quote-btn"; link.href = `${product.type}.html#${encodeURIComponent(product.sku)}`; link.textContent = "Add to Order"; link.setAttribute("aria-label", `Add ${product.name}, ${product.sku} to order`);
    const quote = document.createElement("a"); quote.className = "quote-btn secondary"; quote.href = RIVAL_QUOTATION_URL(product); quote.textContent = "Request Quote"; quote.setAttribute("aria-label", `Request a quotation for ${product.name}, ${product.sku}`);
    actions.append(link, quote); action.append(actions); row.append(action); return row;
  }));
})();
