const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.join(process.cwd(), 'db', 'trace.db');

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rand = seededRandom(42);

function randomBetween(min, max) {
  return min + rand() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function pickOne(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA foreign_keys = ON;");
  await db.exec("PRAGMA journal_mode = WAL;");

  await db.exec(`
    DELETE FROM sales_transactions;
    DELETE FROM marketing_daily;
    DELETE FROM operations_daily;
    DELETE FROM data_sources;
    DELETE FROM products;
    DELETE FROM regions;
  `).catch(() => {
    // Tables might not exist yet, that's fine
  });

  const regions = [
    { id: 1, name: "North" },
    { id: 2, name: "South" },
    { id: 3, name: "East" },
    { id: 4, name: "West" },
  ];

  const products = [
    { id: 1, name: "Product A", category: "Premium", base_price: 25000, launch_date: "2024-01-01" },
    { id: 2, name: "Product B", category: "Standard", base_price: 15000, launch_date: "2024-01-01" },
    { id: 3, name: "Product C", category: "Standard", base_price: 12000, launch_date: "2024-01-01" },
    { id: 4, name: "Product D", category: "Budget", base_price: 8000, launch_date: "2024-01-01" },
    { id: 5, name: "Product E", category: "Premium", base_price: 30000, launch_date: "2024-06-01" },
  ];

  for (const r of regions) {
    await db.run("INSERT INTO regions (id, name) VALUES (?, ?)", r.id, r.name);
  }
  for (const p of products) {
    await db.run("INSERT INTO products (id, name, category, base_price, launch_date) VALUES (?, ?, ?, ?, ?)",
      p.id, p.name, p.category, p.base_price, p.launch_date);
  }

  const sources = [
    { id: 1, name: "Sales System", source_type: "transactional", grain: "transaction", refresh_cadence: "near-real-time", last_refreshed_at: "2026-08-25T10:00:00Z", description: "ERP sales transactions" },
    { id: 2, name: "Marketing Platform", source_type: "marketing", grain: "daily", refresh_cadence: "daily", last_refreshed_at: "2026-08-25T06:00:00Z", description: "Daily marketing performance by region/product" },
    { id: 3, name: "Operations System", source_type: "operations", grain: "daily", refresh_cadence: "6-hourly", last_refreshed_at: "2026-08-25T08:00:00Z", description: "Inventory and fulfillment metrics" },
  ];
  for (const s of sources) {
    await db.run("INSERT INTO data_sources (id, name, source_type, grain, refresh_cadence, last_refreshed_at, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
      s.id, s.name, s.source_type, s.grain, s.refresh_cadence, s.last_refreshed_at, s.description);
  }

  const months = [];
  const startDate = new Date("2025-03-01");
  for (let i = 0; i < 18; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    months.push(d.toISOString().slice(0, 7));
  }

  const channels = ["Online", "Retail", "Partner"];
  let orderCounter = 10000;

  const baseParams = {};
  for (const region of regions) {
    baseParams[region.id] = {};
    for (const product of products) {
      const baseOrders = randomInt(800, 2500);
      const basePrice = product.base_price + randomInt(-2000, 2000);
      const seasonality = randomBetween(0.9, 1.1);
      baseParams[region.id][product.id] = { baseOrders, basePrice, seasonality };
    }
  }

  const salesBatch = [];
  const marketingBatch = [];
  const opsBatch = [];

  for (const month of months) {
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    for (const region of regions) {
      for (const product of products) {
        const params = baseParams[region.id][product.id];
        const isGroundTruthMonth = (month === "2026-08" && region.id === 1);
        const isPreGroundTruth = (month === "2026-07" && region.id === 1);

        const seasonalFactor = 0.9 + 0.2 * Math.sin((monthNum - 1) * Math.PI / 6);
        let monthlyOrders = Math.round(params.baseOrders * seasonalFactor);

        if (isGroundTruthMonth) {
          if (product.id === 2) monthlyOrders = Math.round(monthlyOrders * 0.4);
          else if (product.id === 1) monthlyOrders = Math.round(monthlyOrders * 0.7);
          else monthlyOrders = Math.round(monthlyOrders * 0.9);
        } else if (isPreGroundTruth) {
          if (product.id === 2) monthlyOrders = Math.round(monthlyOrders * 0.85);
        }

        for (let o = 0; o < monthlyOrders; o++) {
          const orderId = `ORD${orderCounter++}`;
          const quantity = randomInt(1, 3);
          const basePrice = params.basePrice;
          const discountPct = isGroundTruthMonth ? randomBetween(0.1, 0.25) : randomBetween(0, 0.15);
          const gross = quantity * basePrice;
          const discount = Math.round(gross * discountPct);
          const net = gross - discount;
          const day = randomInt(1, daysInMonth);
          const dateStr = `${month}-${day.toString().padStart(2, "0")}`;

          salesBatch.push([orderId, dateStr, region.id, product.id, pickOne(channels), quantity, gross, discount, net]);
        }

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${month}-${day.toString().padStart(2, "0")}`;
          const baseSessions = randomInt(500, 2000);
          const baseConvRate = randomBetween(0.02, 0.06);
          const sessions = Math.round(baseSessions * seasonalFactor * randomBetween(0.8, 1.2));
          let conversions = Math.round(sessions * baseConvRate * randomBetween(0.8, 1.2));
          const spend = randomInt(50000, 200000);
          const attributed = Math.round(conversions * params.basePrice * randomBetween(0.8, 1.2));

          if (isGroundTruthMonth && region.id === 1) {
            conversions = Math.round(conversions * 0.75);
          }

          marketingBatch.push([dateStr, region.id, product.id, sessions, conversions, spend, attributed]);
        }

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${month}-${day.toString().padStart(2, "0")}`;
          const baseInventory = randomInt(500, 2000);
          let stockoutRate = randomBetween(0.01, 0.08);
          const deliveryDelay = randomBetween(0.02, 0.1);

          if (isGroundTruthMonth && region.id === 1) {
            if (product.id === 2) stockoutRate = randomBetween(0.25, 0.4);
            else if (product.id === 1) stockoutRate = randomBetween(0.15, 0.25);
            else stockoutRate = randomBetween(0.05, 0.15);
          } else if (isPreGroundTruth && region.id === 1 && product.id === 2) {
            stockoutRate = randomBetween(0.1, 0.2);
          }

          opsBatch.push([dateStr, region.id, product.id, baseInventory, stockoutRate, deliveryDelay]);
        }
      }
    }

    if (months.indexOf(month) % 3 === 2 || month === months[months.length - 1]) {
      if (salesBatch.length > 0) {
        await db.exec("BEGIN TRANSACTION");
        const stmt = await db.prepare(
          `INSERT INTO sales_transactions (order_id, transaction_date, region_id, product_id, channel, quantity, gross_revenue, discount, net_revenue)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const row of salesBatch) {
          await stmt.run(row);
        }
        await stmt.finalize();
        await db.exec("COMMIT");
        salesBatch.length = 0;
      }
      if (marketingBatch.length > 0) {
        await db.exec("BEGIN TRANSACTION");
        const stmt = await db.prepare(
          `INSERT INTO marketing_daily (date, region_id, product_id, sessions, conversions, marketing_spend, attributed_revenue)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        for (const row of marketingBatch) {
          await stmt.run(row);
        }
        await stmt.finalize();
        await db.exec("COMMIT");
        marketingBatch.length = 0;
      }
      if (opsBatch.length > 0) {
        await db.exec("BEGIN TRANSACTION");
        const stmt = await db.prepare(
          `INSERT INTO operations_daily (date, region_id, product_id, inventory_available, stockout_rate, delivery_delay_rate)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const row of opsBatch) {
          await stmt.run(row);
        }
        await stmt.finalize();
        await db.exec("COMMIT");
        opsBatch.length = 0;
      }
      console.log(`Committed batch ending ${month}`);
    }
  }

  console.log("Synthetic data generation complete.");
  console.log("Ground truth scenario: North region August 2026 revenue decline");
  console.log("  - Product B stockouts: 25-40%");
  console.log("  - Premium mix shift (Product A down)");
  console.log("  - Higher discounting (10-25%)");
  console.log("  - Conversion rate drop (~25%)");

  await db.close();
}

main().catch((err) => {
  console.error("Generation failed:", err);
  process.exit(1);
});