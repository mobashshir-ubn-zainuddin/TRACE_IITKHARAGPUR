# TRACE — Trustworthy Root-cause Analytics & Causal Evidence

> **AI-native Business Intelligence for explainable KPI investigation, evidence-backed root-cause analysis, and decision support.**

TRACE (Trustworthy Root-cause Analytics & Causal Evidence) is a business intelligence application designed to move beyond dashboards that merely report **what changed**. TRACE detects material KPI movements, identifies and ranks potential drivers, retrieves supporting or contradictory evidence, exposes the reasoning path, and presents an evidence-grounded investigation to business users.

The application is implemented as a full-stack Next.js application with a deterministic analytics layer, SQLite persistence, structured evidence storage, hybrid evidence/retrieval components, a graph-based evidence view, and Gemini-powered conversational analysis.

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution](#solution)
4. [Core Capabilities](#core-capabilities)
5. [Implementation Approach](#implementation-approach)
6. [Solution Architecture](#solution-architecture)
7. [End-to-End Data Flow](#end-to-end-data-flow)
8. [Module Architecture](#module-architecture)
9. [Analytics and Reasoning Methodology](#analytics-and-reasoning-methodology)
10. [AI / LLM Architecture](#ai--llm-architecture)
11. [Evidence and Retrieval Architecture](#evidence-and-retrieval-architecture)
12. [Evidence Graph](#evidence-graph)
13. [Data Architecture](#data-architecture)
14. [Database Model](#database-model)
15. [Repository Structure](#repository-structure)
16. [Technology Stack](#technology-stack)
17. [Dependencies](#dependencies)
18. [Prerequisites](#prerequisites)
19. [Environment Configuration](#environment-configuration)
20. [Installation](#installation)
21. [Database Initialization and Synthetic Data](#database-initialization-and-synthetic-data)
22. [Running the Application](#running-the-application)
23. [Demo Workflow](#demo-workflow)
24. [API Architecture](#api-architecture)
25. [Testing](#testing)
26. [Production Build](#production-build)
27. [Troubleshooting](#troubleshooting)
28. [Security and Governance](#security-and-governance)
29. [Design Principles](#design-principles)
30. [Business Value](#business-value)
31. [Challenge Alignment](#challenge-alignment)
32. [Future Scalability](#future-scalability)
33. [Team](#team)
34. [License](#license)

---

# Overview

Traditional BI systems are optimized for visualization:

> **What happened?**

TRACE extends this workflow toward:

> **What changed → how material is it → what could explain it → what evidence supports or contradicts those explanations → how confident are we → what should a decision-maker investigate next?**

TRACE combines:

- governed KPI computation
- historical trend analysis
- signal and anomaly detection
- dimensional breakdown
- driver decomposition
- hypothesis generation
- statistical association
- structured and unstructured evidence
- evidence scoring
- contradiction detection
- provenance and lineage
- graph-based reasoning visualization
- uncertainty and confidence
- conversational investigation
- decision-oriented recommendations

The architecture deliberately separates **deterministic business analytics** from **retrieval** and **LLM reasoning**.

---

# Problem Statement

Modern organizations have data distributed across multiple systems and formats:

- transactional systems
- marketing platforms
- operational systems
- spreadsheets
- structured datasets
- reports and documents
- business context

A conventional dashboard can show that revenue fell, but the analyst still has to manually:

1. identify the material movement
2. investigate historical context
3. segment the movement
4. determine potential drivers
5. retrieve business evidence
6. compare conflicting signals
7. judge confidence
8. communicate the conclusion

This creates several problems:

- long investigation cycles
- inconsistent analytical methodology
- weak linkage between KPIs and evidence
- difficult-to-audit AI-generated explanations
- overconfidence when data is sparse
- inability to distinguish correlation from causation
- fragmented reasoning across dashboards, spreadsheets, and documents

TRACE addresses this by turning KPI investigation into a structured, traceable analytical workflow.

---

# Solution

TRACE is organized around a layered intelligence pipeline:

```text
┌──────────────────────────────────────────────────────────────┐
│                         TRACE UI                              │
│ Dashboard │ Data │ Investigations │ Chat │ Evidence Graph   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     APPLICATION / API LAYER                  │
│ Upload │ Analyze │ KPI │ Signals │ Drivers │ Hypotheses      │
│ Evidence │ Decisions │ Uncertainty │ Chat                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌────────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│ Deterministic      │ │ Evidence /      │ │ LLM Reasoning    │
│ Analytics          │ │ Retrieval       │ │                  │
│                    │ │                 │ │ Gemini           │
│ KPI                │ │ Documents       │ │ grounded in      │
│ Signals            │ │ Chunks          │ │ supplied context │
│ Drivers            │ │ Embeddings      │ │                  │
│ Contributions      │ │ Evidence scores │ │ No KPI invention │
└─────────┬──────────┘ └────────┬────────┘ └────────┬─────────┘
          │                     │                   │
          └─────────────────────┼───────────────────┘
                                ▼
                    ┌──────────────────────┐
                    │ SQLite Persistence   │
                    │                      │
                    │ KPI / Sales / Ops    │
                    │ Marketing / Evidence │
                    │ Uploads / Analyses   │
                    └──────────────────────┘
```

---

# Core Capabilities

## 1. KPI Intelligence

TRACE maintains KPI context including:

- current value
- previous-period value
- percentage movement
- historical series
- dimensional breakdown
- materiality
- statistical significance
- z-score
- year-over-year movement

Supported business metrics include the current analytical model's revenue and related commercial/operational measures such as:

- Revenue
- Orders
- Average Order Value
- Conversion Rate
- Marketing ROI
- Stockout / revenue-impact indicators
- Discount
- Product Mix
- Price
- Refunds

---

## 2. Signal Detection

TRACE converts KPI movement into a structured signal containing:

- signal strength
- priority
- status
- materiality
- statistical significance
- deviation
- temporal context
- historical context

This allows the system to prioritize movements that deserve investigation.

---

## 3. Driver Analysis

The driver layer decomposes a KPI movement across business dimensions such as:

- region
- product
- channel

Candidate drivers are ranked using analytical evidence such as:

- magnitude
- association
- direction
- timing
- segment consistency
- structured evidence availability
- causal plausibility
- contradictions

---

## 4. Evidence Retrieval

Evidence can be associated with hypotheses and scored according to multiple signals:

```text
Semantic relevance
        +
Source authority
        +
Temporal alignment
        +
Entity alignment
        +
Hypothesis alignment
        ↓
Final evidence score
```

Evidence can support or contradict a hypothesis.

---

## 5. Evidence Graph

TRACE represents relationships between:

```text
KPI
 ↓
Signal
 ↓
Hypothesis
 ↓
Evidence
 ↓
Relationship
```

The graph makes the analytical chain inspectable instead of hiding reasoning inside a generated paragraph.

---

## 6. Conversational Investigation

The TRACE Chat interface allows users to ask questions about an existing analysis.

Examples:

- Why did revenue change?
- What is the strongest driver?
- What evidence supports the conclusion?
- Are there contradictions?
- Which hypothesis should be investigated first?

The chat API constructs its context from the structured analysis rather than allowing the model to invent KPI calculations.

---

# Implementation Approach

TRACE follows a staged analytical pipeline.

## Phase 1 — Data Ingestion

Input sources are parsed and normalized.

Supported upload formats include:

- CSV
- XLSX
- XLS
- JSON
- PDF
- TXT
- Markdown

The upload layer:

1. validates file type
2. validates extension
3. enforces a file-size limit
4. calculates a content hash
5. detects schema
6. detects dimensions and measures
7. detects date and numeric columns
8. estimates data grain
9. maps source fields to canonical fields
10. persists dataset metadata and rows

The upload API is implemented under:

```text
src/app/api/upload/
```

---

## Phase 2 — Governed Data Layer

Structured data is persisted in SQLite.

The database layer creates and manages:

- dimensions
- source metadata
- sales transactions
- marketing observations
- operational observations
- uploaded datasets
- uploaded rows
- analysis runs
- evidence records

The database implementation is centered around:

```text
src/server/db.ts
```

---

## Phase 3 — KPI Computation

The KPI layer reads normalized business data and calculates:

```text
Current KPI
Previous KPI
Absolute Change
Percentage Change
Historical Context
Dimensional Context
```

The KPI implementation is organized under:

```text
src/server/kpi/
src/app/api/kpi/
```

---

## Phase 4 — Signal Detection

The signal layer evaluates KPI movement using the available historical observations.

The output is a structured signal with:

```text
signal strength
priority
status
materiality
statistical significance
z-score
temporal comparison
```

Implementation:

```text
src/server/signal/
src/app/api/signals/
```

---

## Phase 5 — Driver Decomposition

TRACE examines business dimensions and ranks candidate drivers.

The driver layer combines:

- KPI movement
- dimensional movement
- contribution
- statistical association
- expected direction
- segment consistency
- evidence availability
- contradictions

Implementation:

```text
src/server/driver/
src/app/api/drivers/
src/app/driver-decomposition/
```

---

## Phase 6 — Hypothesis Generation

The system converts candidate drivers into explicit hypotheses.

A hypothesis contains information such as:

```text
name
driver
claim
expected direction
confidence
status
association
evidence availability
contradictions
```

This prevents the system from collapsing all possible explanations into one unsupported answer.

Implementation:

```text
src/app/api/hypotheses/
```

---

## Phase 7 — Evidence Retrieval and Scoring

Structured and unstructured evidence are evaluated independently from the deterministic KPI calculations.

The evidence subsystem contains:

```text
src/server/evidence/
```

The subsystem supports:

- documents
- chunks
- embeddings
- evidence scoring
- evidence relations
- retrieval
- provenance

---

## Phase 8 — Decision Support

The decision layer transforms analytical findings into business-oriented recommendations.

Implementation:

```text
src/server/decision/
src/app/api/decisions/
```

The decision layer is designed to preserve:

- rationale
- evidence
- confidence
- uncertainty
- recommended action

---

## Phase 9 — Conversational AI

The Chat API receives:

```text
analysis context
+
user question
```

It constructs a grounded prompt containing:

- KPI information
- signal information
- driver hypotheses
- evidence
- contradictions
- provenance

The LLM is instructed to:

- answer only from supplied context
- distinguish association from causation
- explicitly acknowledge insufficient evidence
- cite hypotheses/evidence by name
- never invent missing data

Implementation:

```text
src/app/api/chat/route.ts
src/app/chat/
```

---

# Solution Architecture

## Frontend

The frontend is implemented using Next.js App Router and React.

Major application routes include:

```text
/
├── dashboard
├── data
├── investigate
├── chat
├── driver-decomposition
└── evidence-graph
```

The UI uses:

- React components
- Tailwind CSS
- Recharts
- React Flow
- Lucide icons

---

## Backend

The backend uses Next.js Route Handlers.

Major API domains:

```text
/api/analyze
/api/chat
/api/decisions
/api/drivers
/api/evidence
/api/files
/api/hypotheses
/api/kpi
/api/signals
/api/uncertainty
/api/upload
```

---

## Persistence

SQLite is used as the application database.

Database file:

```text
db/trace.db
```

The database is created automatically in the application working directory.

---

# End-to-End Data Flow

```text
CSV / XLSX / JSON / Document
              │
              ▼
       Upload Validation
              │
              ▼
        File Metadata
              │
              ▼
       Schema Detection
              │
              ▼
     Canonical Field Mapping
              │
              ▼
        SQLite Storage
              │
              ▼
       KPI Computation
              │
              ▼
       Signal Detection
              │
              ▼
      Driver Decomposition
              │
              ▼
     Hypothesis Generation
              │
       ┌──────┴───────┐
       ▼              ▼
 Structured       Unstructured
 Evidence         Evidence
       │              │
       └──────┬───────┘
              ▼
       Evidence Scoring
              │
              ▼
       Contradiction Check
              │
              ▼
       Confidence / Uncertainty
              │
              ▼
       Decision / Recommendation
              │
       ┌──────┴────────┐
       ▼               ▼
   Dashboard         Chat
       │
       ▼
 Evidence Graph
```

---

# Module Architecture

| Layer | Responsibility | Main Location |
|---|---|---|
| UI | Dashboard, data, investigation, chat and graph views | `src/app/`, `src/components/` |
| API | HTTP interfaces for application features | `src/app/api/` |
| Data | Synthetic data generation and ingestion | `src/server/data/` |
| Database | SQLite connection and migrations | `src/server/db.ts` |
| KPI | KPI calculations and history | `src/server/kpi/` |
| Signal | Material movement detection | `src/server/signal/` |
| Driver | Driver/hypothesis analysis | `src/server/driver/` |
| Evidence | Documents, embeddings, scoring, retrieval | `src/server/evidence/` |
| Decision | Decision support | `src/server/decision/` |
| Uncertainty | Confidence/uncertainty logic | `src/server/uncertainty/` |
| Types | Shared server-side domain types | `src/server/types.ts` |
| Utilities | Shared helper functions | `src/server/utils/`, `src/server/utils.ts` |

---

# Analytics and Reasoning Methodology

TRACE intentionally separates three kinds of computation.

## Deterministic Analytics

These calculations are performed by application code:

- KPI values
- percentage changes
- historical comparisons
- dimensional aggregation
- contribution calculations
- signal metrics
- statistical association
- confidence-related structured calculations

The objective is reproducibility.

---

## Retrieval

Retrieval identifies relevant evidence from:

- stored documents
- document chunks
- metadata
- embeddings
- structured relationships

Retrieval does not replace KPI computation.

---

## LLM Reasoning

The LLM is responsible for:

- interpreting structured analytical results
- answering user questions
- synthesizing evidence
- producing business-readable explanations
- communicating uncertainty

It is not the source of truth for numerical KPI calculations.

---

# AI / LLM Architecture

TRACE integrates Google's Gemini API through:

```text
@google/genai
```

The Chat API obtains the key from:

```text
GEMINI_API_KEY
```

or:

```text
GOOGLE_AI_API_KEY
```

The conversational pipeline is:

```text
User Question
      │
      ▼
Analysis Context
      │
      ├── KPI
      ├── Signal
      ├── Drivers
      ├── Hypotheses
      ├── Evidence
      ├── Contradictions
      └── Provenance
      │
      ▼
Grounded Prompt
      │
      ▼
Gemini
      │
      ▼
Business Explanation
      │
      ▼
UI
```

The prompt explicitly instructs the model to distinguish:

```text
associated with
```

from:

```text
caused by
```

and to abstain when evidence is insufficient.

---

# Evidence and Retrieval Architecture

The evidence subsystem stores evidence in multiple layers.

## Documents

```text
documents
```

Stores:

- source
- title
- document type
- region
- product
- topic
- document date
- authority score
- content hash

---

## Document Chunks

```text
document_chunks
```

Stores:

- document relationship
- chunk index
- text
- region
- product
- temporal boundaries
- metadata

---

## Embeddings

```text
embeddings
```

Stores:

- chunk relationship
- embedding vector
- provider
- model
- dimension
- content hash
- timestamp

---

## Evidence Scores

```text
evidence_scores
```

Stores:

- semantic score
- source score
- temporal score
- entity score
- alignment score
- final score
- classification

---

## Evidence Relations

```text
evidence_relations
```

Stores the relationship between:

```text
hypothesis → evidence
```

with:

- relation
- strength
- timestamp

---

# Evidence Graph

The evidence graph is implemented using React Flow:

```text
@xyflow/react
```

The graph exposes the relationship between analytical objects.

Example:

```text
                  ┌──────────────┐
                  │    Revenue   │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ Revenue Drop │
                  └──────┬───────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          Orders     Stockouts    Discount
              │          │          │
              ▼          ▼          ▼
           Evidence   Evidence   Evidence
```

This provides an inspectable evidence chain rather than an opaque AI narrative.

---

# Data Architecture

The synthetic demonstration dataset models three connected business systems.

## Sales System

**Grain:** transaction

Contains:

- order
- transaction date
- region
- product
- channel
- quantity
- gross revenue
- discount
- net revenue

---

## Marketing Platform

**Grain:** daily

Contains:

- date
- region
- product
- channel
- campaign
- sessions
- conversions
- marketing spend
- attributed revenue

---

## Operations System

**Grain:** daily

Contains:

- date
- region
- product
- inventory available
- stockout rate
- delivery delay rate

The synthetic data therefore demonstrates heterogeneous business data at different grains and refresh cadences.

---

# Database Model

The SQLite schema is created by `runMigrations()` in:

```text
src/server/db.ts
```

## Core entities

```text
regions
products
data_sources

sales_transactions
marketing_daily
operations_daily

documents
document_chunks
embeddings
evidence_scores
evidence_relations

uploaded_files
uploaded_datasets
dataset_columns
dataset_mappings
uploaded_rows

analysis_runs
decisions
```

### Analysis Run

`analysis_runs` provides persistence for the analytical pipeline and stores:

```text
dataset
metric
period
filters
status
KPI result
signal result
driver result
evidence result
error message
timestamps
```

This allows the UI and Chat layer to reference a completed investigation.

---

# Repository Structure

The repository is organized as follows:

```text
TRACE_IITKHARAGPUR/
│
├── README.md
├── TRACE_PS.txt
├── Implementation_plan.txt
├── TRACE_IITKharagpur.pptx
├── round2_detailed_problem_statements_final.pdf
│
└── trace-app/
    │
    ├── package.json
    ├── package-lock.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── eslint.config.mjs
    ├── jest.config.js
    ├── check-types.js
    ├── AGENTS.md
    │
    ├── src/
    │   ├── app/
    │   │   ├── api/
    │   │   │   ├── analyze/
    │   │   │   ├── chat/
    │   │   │   ├── decisions/
    │   │   │   ├── drivers/
    │   │   │   ├── evidence/
    │   │   │   ├── files/
    │   │   │   ├── hypotheses/
    │   │   │   ├── kpi/
    │   │   │   ├── signals/
    │   │   │   ├── uncertainty/
    │   │   │   └── upload/
    │   │   │
    │   │   ├── chat/
    │   │   ├── dashboard/
    │   │   ├── data/
    │   │   ├── driver-decomposition/
    │   │   ├── evidence-graph/
    │   │   ├── investigate/
    │   │   ├── globals.css
    │   │   ├── layout.tsx
    │   │   └── page.tsx
    │   │
    │   ├── components/
    │   │   └── EvidenceGraph.tsx
    │   │
    │   ├── lib/
    │   │
    │   └── server/
    │       ├── data/
    │       │   └── generateData.ts
    │       ├── decision/
    │       ├── driver/
    │       ├── evidence/
    │       ├── kpi/
    │       ├── signal/
    │       ├── uncertainty/
    │       ├── db.ts
    │       ├── types.ts
    │       ├── utils.ts
    │       └── utils/
    │
    ├── graphify-out/
    ├── scripts/
    └── public/
```

The exact repository may contain additional generated, configuration, or supporting files. The directories above represent the principal application architecture.

---

# Technology Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16.3.2 |
| UI | React 19.2.8 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 3.10.1 |
| Graph Visualization | React Flow / `@xyflow/react` 12.11.3 |
| Icons | Lucide React |
| Database | SQLite |
| Spreadsheet Parsing | SheetJS / `xlsx` |
| AI | Google Gemini via `@google/genai` |
| Testing | Jest |
| API Testing | Supertest |
| TypeScript Runtime | `tsx`, `ts-node` |
| Linting | ESLint |
| Build | Next.js |

---

# Dependencies

The application dependencies are defined in:

```text
trace-app/package.json
```

## Runtime dependencies

```text
@google/genai
@xyflow/react
lucide-react
next
react
react-dom
recharts
sqlite3
xlsx
```

## Development dependencies

```text
@tailwindcss/postcss
@types/jest
@types/node
@types/react
@types/react-dom
@types/supertest
eslint
eslint-config-next
jest
sqlite
supertest
tailwindcss
ts-jest
ts-node
tsx
typescript
```

The lockfile:

```text
trace-app/package-lock.json
```

should be used for reproducible dependency installation.

---

# Prerequisites

Before running TRACE locally, install:

- Node.js
- npm
- Git

Recommended environment:

```text
Node.js 18+
npm
Git
```

For AI-powered chat responses, internet connectivity and a valid Gemini API key are required.

The deterministic dashboard and structured analytical functionality can operate independently of the LLM response path.

---

# Environment Configuration

Create an environment file in:

```text
trace-app/.env.local
```

For Gemini-powered conversational analysis:

```env
GEMINI_API_KEY=your_gemini_api_key
```

The application also recognizes:

```env
GOOGLE_AI_API_KEY=your_gemini_api_key
```

Do **not** commit API keys or other secrets to GitHub.

Example:

```text
.env.local
```

should remain local and be covered by the repository's ignore rules.

---

# Installation

Clone the repository:

```bash
git clone https://github.com/mobashshir-ubn-zainuddin/TRACE_IITKHARAGPUR.git
```

Enter the application:

```bash
cd TRACE_IITKHARAGPUR
cd trace-app
```

Install dependencies:

```bash
npm install
```

Create the environment file:

```text
.env.local
```

and configure the Gemini API key if AI chat is required.

---

# Database Initialization and Synthetic Data

TRACE includes its own migration and synthetic data generation workflow.

## Initialize / migrate the database

Run:

```bash
npm run migrate
```

This executes:

```text
scripts/migrate.ts
```

and prepares the SQLite database.

---

## Generate demonstration data

Run:

```bash
npm run seed
```

This executes:

```text
src/server/data/generateData.ts
```

The generator uses a deterministic random seed and creates the connected demonstration dataset.

The synthetic scenario is designed around a business decline in:

```text
North region
August 2026
```

with controlled changes involving:

- orders
- Product B stockouts
- Product A / premium mix
- discounting
- conversion rate
- marketing channel effects

This provides a repeatable scenario for demonstrating TRACE's investigation workflow.

---

## Reset and regenerate

To rebuild the local analytical dataset:

```bash
npm run db:reset
```

This runs the migration followed by synthetic data generation.

---

# Running the Application

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The application is built using Next.js App Router.

---

# Demo Workflow

For the recommended demonstration:

## Step 1 — Start TRACE

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Step 2 — Open Dashboard

Navigate to:

```text
/dashboard
```

Review:

- total revenue
- average order value
- total orders
- active investigations
- system health

---

## Step 3 — Investigate a KPI

Open:

```text
/investigate
```

Select the revenue investigation.

TRACE presents:

- current value
- previous value
- percentage change
- materiality
- statistical significance
- z-score
- year-over-year context

---

## Step 4 — Inspect Top Signals

Review the ranked KPI signals.

Signals contain:

- change percentage
- priority
- strength
- confidence

---

## Step 5 — Inspect Driver Analysis

Open the driver analysis.

Review candidate drivers such as:

- Orders
- Stockouts
- Discount
- Average Order Value
- Product Mix
- Price
- Refunds

Each hypothesis exposes its analytical status and evidence limitations.

---

## Step 6 — Inspect Dimensions

TRACE provides dimensional breakdowns across:

```text
Region
Product
Channel
```

This helps identify where the KPI movement is concentrated.

---

## Step 7 — Inspect Evidence

Evidence is associated with hypotheses and can be classified as:

```text
Supporting
Contradictory
Insufficient
```

The system also exposes evidence gaps and confidence.

---

## Step 8 — Inspect the Evidence Graph

Open:

```text
/evidence-graph
```

The graph exposes relationships between hypotheses and evidence.

---

## Step 9 — Ask TRACE

Open:

```text
/chat
```

Ask questions such as:

```text
Why did revenue change?
```

```text
What is the strongest driver?
```

```text
What evidence supports the conclusion?
```

```text
Are there any contradictions?
```

The chat response is grounded in the available investigation context.

---

# API Architecture

TRACE uses Next.js Route Handlers.

The principal API domains are:

| API | Purpose |
|---|---|
| `/api/analyze` | Execute analytical workflow |
| `/api/chat` | Grounded conversational investigation |
| `/api/decisions` | Decision-support operations |
| `/api/drivers` | Driver analysis |
| `/api/evidence` | Evidence operations |
| `/api/files` | File-related operations |
| `/api/hypotheses` | Hypothesis retrieval |
| `/api/kpi` | KPI calculations and history |
| `/api/signals` | Signal detection and ranking |
| `/api/uncertainty` | Confidence / uncertainty information |
| `/api/upload` | Dataset ingestion |

The API layer separates the browser UI from server-side analytics and persistence.

---

# File Upload Architecture

The upload endpoint supports:

```text
.csv
.xlsx
.xls
.json
.pdf
.txt
.md
```

Maximum configured file size:

```text
50 MB
```

The upload process is:

```text
File
 ↓
Validation
 ↓
Content Hash
 ↓
Duplicate Check
 ↓
Parser
 ↓
Schema Detection
 ↓
Canonical Mapping
 ↓
Dataset Metadata
 ↓
Rows
 ↓
Analysis-ready Dataset
```

For spreadsheets, SheetJS is loaded dynamically and workbook sheets are parsed into structured records.

---

# Testing

The project uses Jest and Supertest.

Run the complete test suite:

```bash
npm test
```

Run the Module 3 / driver-focused test suite:

```bash
npm run test:module3
```

Run linting:

```bash
npm run lint
```

The project also includes:

```text
check-types.js
```

for type-checking support.

A recommended validation sequence before submission is:

```bash
npm install
npm run migrate
npm run seed
npm run lint
npm test
npm run build
```

Then launch the production build locally.

---

# Production Build

Create a production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

The expected flow is:

```text
npm run build
    ↓
Next.js production build
    ↓
npm start
    ↓
http://localhost:3000
```

---

# Troubleshooting

## Port already in use

If port `3000` is occupied, stop the existing Next.js process or start on another port:

```bash
npm run dev -- -p 3001
```

---

## Database does not exist

Run:

```bash
npm run migrate
npm run seed
```

---

## Dashboard has no analytical data

Regenerate the deterministic demonstration dataset:

```bash
npm run db:reset
```

Then restart the application.

---

## Gemini chat does not respond with an AI answer

Check:

```text
GEMINI_API_KEY
```

or:

```text
GOOGLE_AI_API_KEY
```

in:

```text
trace-app/.env.local
```

Then restart the development server.

---

## Chat says that analysis context is unavailable

The chat workflow is analysis-context aware.

Run the analysis from the Data / investigation workflow first, then return to Chat with the resulting analysis context.

---

## Upload fails

Check:

- file extension
- MIME type
- file size
- non-empty file
- valid CSV / XLSX / JSON structure

The upload API validates supported formats and a 50 MB maximum file size.

---

# Security and Governance

TRACE follows a controlled AI architecture.

## Deterministic source of truth

Numerical business calculations are performed by application logic rather than generated by the LLM.

---

## Grounded generation

The Chat API instructs the model to answer only from supplied analysis/evidence context.

---

## Evidence-aware uncertainty

When evidence is incomplete, TRACE exposes:

- insufficient data
- evidence gaps
- contradictions
- low confidence
- missing segment evidence
- unavailable unstructured evidence

---

## Association vs causation

TRACE does not automatically treat statistical association as causal proof.

The system explicitly communicates the distinction between:

```text
statistical association
```

and:

```text
causal explanation
```

---

## Provenance

Analytical objects maintain relationships back to:

```text
KPI
Signal
Hypothesis
Evidence
Source
```

This supports auditability and traceability.

---

# Design Principles

TRACE is designed around the following principles.

## 1. Analytics before narrative

Compute the business facts first, then generate explanations.

---

## 2. Evidence before confidence

Confidence should reflect the quality and completeness of available evidence.

---

## 3. Explicit hypotheses

Potential drivers are represented as explicit hypotheses rather than hidden reasoning.

---

## 4. Contradictions are first-class signals

Contradictory evidence should weaken a conclusion rather than being silently ignored.

---

## 5. Abstention is a valid outcome

If evidence is insufficient, TRACE should say so.

---

## 6. Human-readable reasoning

Business users should be able to understand:

```text
What changed?
Why does it matter?
What could explain it?
What supports that explanation?
What contradicts it?
How confident are we?
What should we do next?
```

---

# Business Value

TRACE reduces the distance between raw business data and decision-making.

### Without TRACE

```text
Dashboard
   ↓
Analyst manually investigates
   ↓
Multiple spreadsheets / systems
   ↓
Manual evidence gathering
   ↓
Manual explanation
   ↓
Decision
```

### With TRACE

```text
Business Data
     ↓
TRACE
     ↓
Signal
     ↓
Drivers
     ↓
Evidence
     ↓
Confidence
     ↓
Decision
```

The principal value is not simply another dashboard. It is a **traceable investigation workflow** that makes analytical reasoning more consistent, explainable, and actionable.

---

# Challenge Alignment

TRACE is designed to address the core requirements of an AI-native BI investigation system.

| Requirement | TRACE Approach |
|---|---|
| Multiple connected KPIs | Revenue, Orders, AOV, Conversion Rate, Marketing ROI and related measures |
| Multiple data sources | Sales, Marketing, Operations and document evidence |
| Different data grains | Transactional sales and daily marketing/operations observations |
| Detect material movement | Signal engine |
| Statistical significance | Statistical analysis and signal metadata |
| Driver identification | Driver decomposition and hypotheses |
| Contribution analysis | Dimensional contribution and driver ranking |
| Unstructured evidence | Documents, chunks and retrieval |
| Evidence scoring | Multi-factor evidence scoring |
| Contradictory evidence | Explicit contradiction detection |
| Confidence | Hypothesis and evidence confidence |
| Lineage | Provenance and evidence relations |
| Explainability | Investigation UI and evidence graph |
| Conversational BI | Grounded TRACE Chat |
| Decision support | Decision layer and recommendations |
| Human oversight | Evidence visibility, confidence, uncertainty and feedback-oriented workflow |

---

# Future Scalability

The current architecture is intentionally modular so that the prototype can evolve into a production BI platform.

Potential production extensions include:

- PostgreSQL or cloud data warehouse persistence
- enterprise identity and SSO
- row-level and column-level security
- domain-specific authorization
- scheduled data refresh
- streaming ingestion
- production vector database
- enterprise document connectors
- model routing
- model evaluation
- observability
- audit logs
- distributed analytical execution
- workflow orchestration
- role-specific recommendations
- human feedback loops
- enterprise data catalog integration

The application layer can remain largely stable while infrastructure and data connectors evolve.

---

# Team

**TRACE — IIT Kharagpur**

Repository:

https://github.com/mobashshir-ubn-zainuddin/TRACE_IITKHARAGPUR

Application:

```text
trace-app/
```

---

# License

This project is developed as a prototype for the Accenture Innovation Challenge.

