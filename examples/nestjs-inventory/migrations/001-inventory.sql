CREATE TABLE products (sku TEXT PRIMARY KEY NOT NULL, stock INTEGER NOT NULL CHECK (stock >= 0));
CREATE TABLE reservations (
  reference TEXT PRIMARY KEY NOT NULL,
  sku TEXT NOT NULL REFERENCES products(sku),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
