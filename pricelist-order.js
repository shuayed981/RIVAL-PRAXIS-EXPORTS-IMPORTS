(() => {
  const tableBody = document.getElementById("price-list-body");
  if (!tableBody || !window.RIVAL_PRODUCTS) return;
  tableBody.replaceChildren(...RIVAL_PRODUCTS.map(product => {
    const row = document.createElement("tr");
    [["Product",product.name],["Category",product.category],["Reference",product.sku],["Sizes",product.sizes],["MOQ",`${product.moq} pcs`],["Wholesale Price",RIVAL_CART.money(product.price)]].forEach(([label,value], index) => {
      const cell = document.createElement("td"); cell.dataset.label = label; cell.textContent = value; if (index === 5) cell.className = "price"; row.append(cell);
    });
    const action = document.createElement("td"); action.dataset.label = "Order";
    const link = document.createElement("a"); link.className = "quote-btn"; link.href = `${product.type}.html#${encodeURIComponent(product.sku)}`; link.textContent = "Select Product"; link.setAttribute("aria-label", `Select ${product.name}, ${product.sku}`); action.append(link); row.append(action); return row;
  }));
})();
