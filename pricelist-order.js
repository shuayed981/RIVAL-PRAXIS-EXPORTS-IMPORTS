(() => {
  const tableBody = document.getElementById("price-list-body");
  if (!tableBody || !window.RIVAL_PRODUCTS) return;
  tableBody.replaceChildren(...RIVAL_PRODUCTS.map(product => {
    const row = document.createElement("tr");
    [["Reference",product.sku],["Category",product.category],["MOQ",`${product.moq} pcs`],["Wholesale Price",RIVAL_CART.money(product.price)]].forEach(([label,value], index) => {
      const cell = document.createElement("td"); cell.dataset.label = label; cell.textContent = value; if (index === 3) cell.className = "price"; row.append(cell);
    });
    const action = document.createElement("td"); action.dataset.label = "Order";
    const link = document.createElement("a"); link.className = "quote-btn"; link.href = `${product.type}.html`; link.textContent = "Select Product"; link.setAttribute("aria-label", `Select ${product.sku}`); action.append(link); row.append(action); return row;
  }));
})();
