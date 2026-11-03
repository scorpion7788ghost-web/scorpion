/* Hardcoded demonstration data. Not a production account database. */
window.DEMO_SEED={
  "accounts": [
    {
      "id": "nova-tech",
      "username": "nova",
      "name": "Nova Tech",
      "role": "seller",
      "email": "",
      "salt": "6c6b2d64656d6f2d6163636f756e742d73616c742d30",
      "hash": "4f78ad686b74d1558626fbb2b49c34bfdcf8e313c513dfdc4e7920ab32d5a208"
    },
    {
      "id": "orbit-supply",
      "username": "orbit",
      "name": "Orbit Supply",
      "role": "seller",
      "email": "",
      "salt": "6c6b2d64656d6f2d6163636f756e742d73616c742d31",
      "hash": "f12632b0f64b1b533c4cd81ee31a5cbc12f369d45a3a775a05d6657ea84fda7a"
    },
    {
      "id": "customer-alex",
      "username": "alex",
      "name": "Alex Morgan",
      "role": "customer",
      "email": "",
      "salt": "6c6b2d64656d6f2d6163636f756e742d73616c742d32",
      "hash": "e37d8c9283a0177f4855d22cb3b4f07e8030d5c5d7576ec2e3cca6723b60493e"
    }
  ],
  "sellers": [
    {
      "id": "nova-tech",
      "name": "Nova Tech",
      "tagline": "Thoughtful tech for your everyday.",
      "description": "A demo store for exploring modern electronics and desk essentials.",
      "email": "",
      "phone": "",
      "location": "",
      "color": "#c5a6f5"
    },
    {
      "id": "orbit-supply",
      "name": "Orbit Supply",
      "tagline": "Small upgrades. Everyday possibilities.",
      "description": "A demo collection of accessories, lifestyle finds, and creative essentials.",
      "email": "",
      "phone": "",
      "location": "",
      "color": "#d1f39a"
    }
  ],
  "products": [
    {
      "id": "headphones",
      "name": "Studio Headphones",
      "category": "Tech",
      "price": 89,
      "color": "#e7dbed",
      "summary": "A quieter kind of everyday.",
      "description": "An illustrative pair of wireless over-ear headphones, with soft cushions and a minimal finish. This sample shows how a product detail view will look.",
      "isNew": true,
      "sellerId": "nova-tech",
      "sku": "LK-0001",
      "stock": 24,
      "status": "active",
      "image": "assets/products/headphones.svg",
      "isCustom": false
    },
    {
      "id": "lamp",
      "name": "Arc Table Lamp",
      "category": "Home",
      "price": 64,
      "color": "#e8decf",
      "summary": "A warm glow for your corner.",
      "description": "A sculptural table lamp with a warm brass-inspired finish. A sample piece for the spaces where you read, work, and unwind.",
      "isNew": true,
      "sellerId": "nova-tech",
      "sku": "LK-0002",
      "stock": 18,
      "status": "active",
      "image": "assets/products/lamp.svg",
      "isCustom": false
    },
    {
      "id": "backpack",
      "name": "Everyday Backpack",
      "category": "Accessories",
      "price": 72,
      "color": "#d7e2da",
      "summary": "Room for wherever you’re going.",
      "description": "An understated sage backpack, illustrated with everyday organization in mind. This is a sample listing rather than a product available for sale.",
      "isNew": true,
      "sellerId": "nova-tech",
      "sku": "LK-0003",
      "stock": 12,
      "status": "active",
      "image": "assets/products/backpack.svg",
      "isCustom": false
    },
    {
      "id": "speaker",
      "name": "Pocket Speaker",
      "category": "Tech",
      "price": 49,
      "color": "#d5dfeb",
      "summary": "Little speaker. Good company.",
      "description": "A compact, portable speaker concept in a soft blue finish. Explore this sample product and add it to the demo cart.",
      "isNew": true,
      "sellerId": "nova-tech",
      "sku": "LK-0004",
      "stock": 31,
      "status": "active",
      "image": "assets/products/speaker.svg",
      "isCustom": false
    },
    {
      "id": "watch",
      "name": "Daylight Watch",
      "category": "Accessories",
      "price": 115,
      "color": "#e6ddd5",
      "summary": "Make time for the little things.",
      "description": "A simple watch concept with a warm neutral strap and a clean, easy-to-read face. All details and pricing are illustrative.",
      "isNew": true,
      "sellerId": "orbit-supply",
      "sku": "LK-0005",
      "stock": 8,
      "status": "active",
      "image": "assets/products/watch.svg",
      "isCustom": false
    },
    {
      "id": "bottle",
      "name": "Daily Water Bottle",
      "category": "Lifestyle",
      "price": 28,
      "color": "#e8ddce",
      "summary": "A small everyday essential.",
      "description": "A reusable bottle concept in a soft sand finish. A sample everyday accessory for demonstrating the storefront.",
      "isNew": true,
      "sellerId": "orbit-supply",
      "sku": "LK-0006",
      "stock": 25,
      "status": "active",
      "image": "assets/products/bottle.svg",
      "isCustom": false
    },
    {
      "id": "camera",
      "name": "Weekend Camera",
      "category": "Tech",
      "price": 189,
      "color": "#d9dfdf",
      "summary": "Keep the moments that matter.",
      "description": "A retro-inspired camera concept in a muted green finish. This sample listing is here to help you explore the product browsing experience.",
      "isNew": false,
      "sellerId": "orbit-supply",
      "sku": "LK-0007",
      "stock": 9,
      "status": "active",
      "image": "assets/products/camera.svg",
      "isCustom": false
    },
    {
      "id": "sneakers",
      "name": "Cloud Sneakers",
      "category": "Lifestyle",
      "price": 95,
      "color": "#dfdcec",
      "summary": "A lighter step, every day.",
      "description": "An illustrated pair of casual sneakers with soft lavender accents. Sample colors, details, and price are for demonstration only.",
      "isNew": false,
      "sellerId": "orbit-supply",
      "sku": "LK-0008",
      "stock": 16,
      "status": "active",
      "image": "assets/products/sneakers.svg",
      "isCustom": false
    }
  ],
  "orders": [
    {
      "id": "DEMO-1042",
      "sellerId": "nova-tech",
      "customerId": "customer-alex",
      "customer": "Alex Morgan",
      "productId": "headphones",
      "quantity": 1,
      "total": 89,
      "status": "Processing",
      "date": "2026-11-02"
    },
    {
      "id": "DEMO-1041",
      "sellerId": "orbit-supply",
      "customerId": "customer-alex",
      "customer": "Alex Morgan",
      "productId": "watch",
      "quantity": 1,
      "total": 115,
      "status": "Shipped",
      "date": "2026-11-01"
    }
  ]
};
