// src/server/data/generateData.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'public', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Generate synthetic KPI time series data
const months = Array.from({ length: 12 }, (_, i) => {
  const date = new Date();
  date.setMonth(date.getMonth() - (11 - i));
  return date.toISOString().slice(0, 7); // YYYY-MM
});
const regions = ['North', 'South', 'East', 'West'];
const products = ['A', 'B', 'C', 'D', 'E'];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

const kpis = [];
months.forEach((month) => {
  regions.forEach((region) => {
    products.forEach((product) => {
      kpis.push({
        month,
        region,
        product,
        revenue: Math.round(randomBetween(50000, 200000)),
        orders: Math.round(randomBetween(1000, 5000)),
        aov: Math.round(randomBetween(50, 200)),
      });
    });
  });
});

fs.writeFileSync(
  path.join(dataDir, 'kpis.json'),
  JSON.stringify(kpis, null, 2),
  'utf-8'
);

// Generate synthetic unstructured evidence documents
const topics = ['Delivery', 'Pricing', 'Conversion', 'Inventory', 'Seasonality'];
const sources = ['SupportTicket', 'CustomerReview', 'InternalReport'];

function randomDate() {
  const start = new Date();
  start.setMonth(start.getMonth() - 11);
  const end = new Date();
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
    .toISOString()
    .slice(0, 10);
}

const evidence = [];
for (let i = 1; i <= 200; i++) {
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const source = sources[Math.floor(Math.random() * sources.length)];
  evidence.push({
    id: i,
    text: `Sample ${source} about ${topic} issues observed on ${randomDate()}.`,
    source,
    region: regions[Math.floor(Math.random() * regions.length)],
    topic,
    date: randomDate(),
  });
}

fs.writeFileSync(
  path.join(dataDir, 'evidence.json'),
  JSON.stringify(evidence, null, 2),
  'utf-8'
);

// Initialize empty decisions file
fs.writeFileSync(
  path.join(dataDir, 'decisions.json'),
  JSON.stringify([], null, 2),
  'utf-8'
);

console.log('Synthetic data generated in public/data');
