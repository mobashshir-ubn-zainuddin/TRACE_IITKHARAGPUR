// Generates realistic unstructured business documents (reviews, tickets, reports,
// manager notes) grounded in the actual structured data already seeded in trace.db.
// Documents are NOT hand-labeled with the "answer" — topics/products/regions are
// derived from real stockout/discount/conversion/delivery numbers per region-month,
// so the hypothesis engine still has to discover which explanation fits.
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(process.cwd(), "db", "trace.db");
const outPath = path.join(process.cwd(), "public", "data", "evidence.json");

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = seededRandom(1337);
const randomInt = (min, max) => Math.floor(min + rand() * (max - min + 1));
const pickOne = (arr) => arr[randomInt(0, arr.length - 1)];
const pct = (v) => Math.round(v * 1000) / 10; // 0.234 -> 23.4

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function std(arr, m) {
  if (arr.length < 2) return 0;
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}
function zScore(value, series) {
  const others = series.filter((v) => v !== value);
  if (others.length < 2) return 0;
  const m = mean(others);
  const s = std(others, m);
  return s > 0 ? (value - m) / s : 0;
}

function randomDateIn(month) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const day = randomInt(1, days).toString().padStart(2, "0");
  return `${month}-${day}`;
}

let nextId = 1;
const docs = [];
function addDoc({ source, region, topic, date, text, product }) {
  docs.push({ id: nextId++, text, source, region, topic, date, ...(product ? { product } : {}) });
}

const INVENTORY_REVIEW_TEMPLATES = [
  (p, r) => `Tried to order the ${p} in ${r} region but it kept showing "out of stock" for most of the month. Ended up settling for a different, cheaper model instead.`,
  (p, r) => `Really disappointed — ${p} was unavailable at the ${r} store for weeks. Staff said it was on backorder with no clear delivery date.`,
  (p, r) => `Waited two weeks for ${p} to come back in stock in ${r}. Almost cancelled the order.`,
  (p, r) => `Website showed ${p} as available in ${r}, but my order was cancelled a day later due to "inventory mismatch."`,
];
const INVENTORY_TICKET_TEMPLATES = [
  (p, r) => `Customer inquiry: ${p} inventory unavailable at ${r} distribution hub; order placed on backorder for over a week.`,
  (p, r) => `Support case opened — customer in ${r} reports repeated stockouts on ${p}, requesting refund after 10-day wait.`,
  (p, r) => `Escalation: multiple ${r}-region customers reporting ${p} orders auto-cancelled due to stock unavailability.`,
];
const INVENTORY_REPORT_TEMPLATES = [
  (p, r, v) => `${r} operations note: ${p} stockout rate reached ${v}% this month, driven by a supplier delay at the regional distribution center.`,
  (p, r, v) => `Fulfillment review: ${p} availability in ${r} dropped sharply (stockout rate ~${v}%). Replenishment lead time from the primary supplier has doubled.`,
  (p, r) => `Flagging repeated ${p} availability issues in ${r} this month; store teams report lost walk-in sales due to empty shelves and cancelled online orders.`,
];

const DISCOUNT_REPORT_TEMPLATES = [
  (r, v) => `Pricing team note: average discount depth in ${r} rose to ${v}% this month as the team pushed promotions to offset weak sell-through on constrained SKUs.`,
  (r, v) => `${r} regional manager comment: we increased markdowns to ${v}% to move available inventory toward lower-demand alternatives while premium items stay out of stock.`,
];
const DISCOUNT_REVIEW_TEMPLATES = [
  (p, r) => `Got a surprisingly good deal on ${p} in ${r} this month — discount was much bigger than usual.`,
];

const CONVERSION_REPORT_TEMPLATES = [
  (r, v) => `${r} marketing report: session volume held roughly steady this month but conversion rate fell to ${v}%, well below the recent trend.`,
  (r, v) => `Weekly funnel review (${r}): traffic is on plan, but checkout completion is down; conversion sitting near ${v}% versus a healthier baseline.`,
];
const CONVERSION_REVIEW_TEMPLATES = [
  (p, r) => `Wanted to buy ${p} online in ${r} but checkout kept failing — item was in my cart one minute and unavailable the next.`,
  (p, r) => `Frustrating experience: added ${p} to cart in the ${r} app, but it was removed automatically before I could pay.`,
];
const CONVERSION_TICKET_TEMPLATES = [
  (p, r) => `User reported inability to complete purchase for ${p} in ${r}; item removed from cart due to an inventory sync issue.`,
];

const DELIVERY_REPORT_TEMPLATES = [
  (r, v) => `${r} logistics report: average delivery SLA remained within target (~${v}% delay rate) this month; no material change in delivery performance.`,
  (r, v) => `Ops sync (${r}): last-mile delivery times are stable month over month (${v}% delay rate), consistent with prior quarters.`,
];
const DELIVERY_REVIEW_TEMPLATES_NOISE = [
  (p, r) => `Delivery for my ${p} order in ${r} took a little longer than expected, but support kept me updated.`,
  (p, r) => `Package arrived a couple of days late in ${r}, minor inconvenience but not a big deal.`,
];

const SATISFACTION_REPORT_TEMPLATES = [
  (r) => `Customer satisfaction survey (NPS) for ${r} region showed no significant change from the prior period.`,
  (r) => `${r} customer experience summary: overall satisfaction scores remained flat month over month; no new complaint themes identified in the survey panel.`,
];

const POSITIVE_NOISE_TEMPLATES = [
  (p, r) => `Great experience shopping for ${p} in ${r}. Fast, easy, and exactly as described.`,
  (p, r) => `Second time ordering ${p} from the ${r} store — consistently reliable service.`,
  (p, r) => `${p} arrived quickly in ${r} and was well packaged. Would buy again.`,
];
const GENERIC_TICKET_NOISE = [
  (p, r) => `Routine support inquiry about warranty terms for ${p} purchased in ${r}. Resolved same day.`,
  (p, r) => `Customer asked about ${p} return policy in ${r}; no complaints, question answered.`,
];

async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  const regions = await db.all("SELECT id, name FROM regions ORDER BY id");
  const products = await db.all("SELECT id, name, category FROM products ORDER BY id");
  const months = (await db.all("SELECT DISTINCT substr(transaction_date,1,7) as m FROM sales_transactions ORDER BY m")).map((r) => r.m);

  // Pull per-region-per-month aggregates once.
  const seriesByRegion = {}; // region -> { months: [...], stockout: [], discount: [], conversion: [], delay: [], productStockout: {productName: []} }
  for (const region of regions) {
    const stockoutSeries = [];
    const discountSeries = [];
    const conversionSeries = [];
    const delaySeries = [];
    const productStockoutSeries = {};
    for (const p of products) productStockoutSeries[p.name] = [];

    for (const month of months) {
      const ops = await db.get(
        `SELECT AVG(stockout_rate) as stockout, AVG(delivery_delay_rate) as delay
         FROM operations_daily WHERE region_id = ? AND date LIKE ?`,
        region.id, month + "%"
      );
      const disc = await db.get(
        `SELECT AVG(1.0 * discount / NULLIF(gross_revenue, 0)) as discRate
         FROM sales_transactions WHERE region_id = ? AND transaction_date LIKE ?`,
        region.id, month + "%"
      );
      const conv = await db.get(
        `SELECT SUM(conversions) as conv, SUM(sessions) as sess
         FROM marketing_daily WHERE region_id = ? AND date LIKE ?`,
        region.id, month + "%"
      );
      stockoutSeries.push(ops?.stockout || 0);
      delaySeries.push(ops?.delay || 0);
      discountSeries.push(disc?.discRate || 0);
      conversionSeries.push(conv?.sess ? conv.conv / conv.sess : 0);

      for (const p of products) {
        const pOps = await db.get(
          `SELECT AVG(stockout_rate) as stockout FROM operations_daily WHERE region_id = ? AND product_id = ? AND date LIKE ?`,
          region.id, p.id, month + "%"
        );
        productStockoutSeries[p.name].push(pOps?.stockout || 0);
      }
    }
    seriesByRegion[region.name] = { stockoutSeries, delaySeries, discountSeries, conversionSeries, productStockoutSeries };
  }

  // Generate documents per region-month based on real anomaly signals.
  for (const region of regions) {
    const rName = region.name;
    const s = seriesByRegion[rName];
    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const stockoutZ = zScore(s.stockoutSeries[i], s.stockoutSeries);
      const discountZ = zScore(s.discountSeries[i], s.discountSeries);
      const conversionZ = zScore(s.conversionSeries[i], s.conversionSeries); // negative = drop
      const delayZ = zScore(s.delaySeries[i], s.delaySeries);

      const inventoryNotable = stockoutZ > 1.5;
      const discountNotable = discountZ > 1.5;
      const conversionNotable = conversionZ < -1.5;
      const delayNotable = delayZ > 1.5; // rarely true in this dataset — kept for generality

      // Identify the worst product for inventory narrative this month.
      let worstProduct = null, worstProductRate = 0;
      for (const p of products) {
        const rate = s.productStockoutSeries[p.name][i];
        if (rate > worstProductRate) { worstProductRate = rate; worstProduct = p.name; }
      }

      if (inventoryNotable && worstProduct) {
        const n = randomInt(4, 7);
        for (let k = 0; k < n; k++) {
          addDoc({ source: "CustomerReview", region: rName, topic: "inventory", product: worstProduct, date: randomDateIn(month), text: pickOne(INVENTORY_REVIEW_TEMPLATES)(worstProduct, rName) });
        }
        const t = randomInt(2, 4);
        for (let k = 0; k < t; k++) {
          addDoc({ source: "SupportTicket", region: rName, topic: "inventory", product: worstProduct, date: randomDateIn(month), text: pickOne(INVENTORY_TICKET_TEMPLATES)(worstProduct, rName) });
        }
        addDoc({ source: "InternalReport", region: rName, topic: "inventory", product: worstProduct, date: randomDateIn(month), text: pickOne(INVENTORY_REPORT_TEMPLATES)(worstProduct, rName, pct(worstProductRate)) });
      }

      if (discountNotable) {
        addDoc({ source: "InternalReport", region: rName, topic: "discount", date: randomDateIn(month), text: pickOne(DISCOUNT_REPORT_TEMPLATES)(rName, pct(s.discountSeries[i])) });
        if (rand() > 0.5 && worstProduct) {
          addDoc({ source: "CustomerReview", region: rName, topic: "discount", product: worstProduct, date: randomDateIn(month), text: pickOne(DISCOUNT_REVIEW_TEMPLATES)(worstProduct, rName) });
        }
      }

      if (conversionNotable) {
        addDoc({ source: "InternalReport", region: rName, topic: "conversion", date: randomDateIn(month), text: pickOne(CONVERSION_REPORT_TEMPLATES)(rName, pct(s.conversionSeries[i])) });
        const n = randomInt(3, 5);
        for (let k = 0; k < n; k++) {
          const p = worstProduct || pickOne(products).name;
          addDoc({ source: "CustomerReview", region: rName, topic: "conversion", product: p, date: randomDateIn(month), text: pickOne(CONVERSION_REVIEW_TEMPLATES)(p, rName) });
        }
        addDoc({ source: "SupportTicket", region: rName, topic: "conversion", product: worstProduct || pickOne(products).name, date: randomDateIn(month), text: pickOne(CONVERSION_TICKET_TEMPLATES)(worstProduct || pickOne(products).name, rName) });
      }

      if (delayNotable) {
        const n = randomInt(3, 6);
        for (let k = 0; k < n; k++) {
          addDoc({ source: "CustomerReview", region: rName, topic: "delivery", product: pickOne(products).name, date: randomDateIn(month), text: pickOne(DELIVERY_REVIEW_TEMPLATES_NOISE)(pickOne(products).name, rName) });
        }
      } else {
        // Delivery SLA is stable almost everywhere — occasionally document that explicitly,
        // and drop in rare anecdotal complaints as noise even when nothing is structurally wrong.
        if (rand() > 0.7) {
          addDoc({ source: "InternalReport", region: rName, topic: "delivery", date: randomDateIn(month), text: pickOne(DELIVERY_REPORT_TEMPLATES)(rName, pct(s.delaySeries[i])) });
        }
        if (rand() > 0.85) {
          const p = pickOne(products).name;
          addDoc({ source: "CustomerReview", region: rName, topic: "delivery", product: p, date: randomDateIn(month), text: pickOne(DELIVERY_REVIEW_TEMPLATES_NOISE)(p, rName) });
        }
      }

      // Contradiction signal: even in an anomalous month, satisfaction surveys often lag or miss the issue.
      if ((inventoryNotable || conversionNotable) && rand() > 0.4) {
        addDoc({ source: "InternalReport", region: rName, topic: "satisfaction", date: randomDateIn(month), text: pickOne(SATISFACTION_REPORT_TEMPLATES)(rName) });
      }

      // Baseline noise so the corpus isn't only "problem" documents.
      if (!inventoryNotable && !discountNotable && !conversionNotable) {
        const n = randomInt(1, 3);
        for (let k = 0; k < n; k++) {
          const p = pickOne(products).name;
          addDoc({ source: "CustomerReview", region: rName, topic: "general", product: p, date: randomDateIn(month), text: pickOne(POSITIVE_NOISE_TEMPLATES)(p, rName) });
        }
        if (rand() > 0.6) {
          const p = pickOne(products).name;
          addDoc({ source: "SupportTicket", region: rName, topic: "general", product: p, date: randomDateIn(month), text: pickOne(GENERIC_TICKET_NOISE)(p, rName) });
        }
      }
    }
  }

  await db.close();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(docs, null, 2), "utf-8");
  console.log(`Generated ${docs.length} evidence documents -> ${outPath}`);
  const byTopic = {};
  for (const d of docs) byTopic[d.topic] = (byTopic[d.topic] || 0) + 1;
  console.log("By topic:", byTopic);
  const northAug = docs.filter((d) => d.region === "North" && d.date.startsWith("2026-08"));
  console.log(`North / 2026-08 documents: ${northAug.length}`);
}

main().catch((err) => {
  console.error("Evidence generation failed:", err);
  process.exit(1);
});
