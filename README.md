# TRACE --- From Signal to Decision

> **The AI Engine That Investigates, Not Just Explains.**

TRACE is an AI-native Business Intelligence and decision-intelligence
platform designed to answer the question conventional dashboards leave
unresolved:

> **What changed, why did it change, what evidence supports that
> explanation, how confident are we, and what should we do next?**

TRACE combines governed KPI computation, statistical signal detection,
driver analysis, hybrid evidence retrieval, evidence graphs,
persona-aware narratives, recommendations, and governance into a single
investigation workflow.

**Accenture Innovation Challenge 2026 --- Round 2 \|
BusinessIntelligence.ai \| Team TRACE, IIT Kharagpur**

------------------------------------------------------------------------

## Table of Contents

-   [Problem](#problem)
-   [Solution](#solution)
-   [Core Workflow](#core-workflow)
-   [Architecture](#architecture)
-   [Functional Modules](#functional-modules)
-   [KPI Intelligence](#kpi-intelligence)
-   [Evidence and RAG](#evidence-and-rag)
-   [Evidence Graph](#evidence-graph)
-   [AI and LLM Design](#ai-and-llm-design)
-   [Persona-Aware Intelligence](#persona-aware-intelligence)
-   [Recommendations](#recommendations)
-   [Trust and Governance](#trust-and-governance)
-   [Data Sources](#data-sources)
-   [Technology Stack](#technology-stack)
-   [Getting Started](#getting-started)
-   [Testing](#testing)
-   [Example Investigation](#example-investigation)
-   [Design Principles](#design-principles)
-   [Business Value](#business-value)
-   [Scalability](#scalability)
-   [Challenge Alignment](#challenge-alignment)
-   [Team](#team)

------------------------------------------------------------------------

## Problem

Traditional Business Intelligence systems are excellent at answering:

-   What is our revenue?
-   Which KPI moved?
-   Which region is underperforming?
-   How far are we from target?

But a KPI movement is only the beginning of an investigation.

When revenue drops, business users may need to inspect transaction data,
pricing, product mix, inventory, operations, customer feedback, regional
performance, historical trends, and contextual business reports. These
sources often have different formats, definitions, grains, owners, and
refresh cadences.

The result is a slow and difficult workflow:

``` text
Dashboard
   ↓
KPI movement
   ↓
Analyst investigation
   ↓
Multiple systems
   ↓
Manual comparison
   ↓
Evidence gathering
   ↓
Hypothesis formation
   ↓
Business decision
```

The BusinessIntelligence.ai challenge asks for an intelligence-to-action
engine that detects material KPI movements, reconciles heterogeneous
sources, identifies explanatory drivers, produces traceable narratives,
communicates uncertainty, recommends practical actions, and learns from
feedback. fileciteturn558file1L4-L5

------------------------------------------------------------------------

## Solution

TRACE turns the investigation into a governed end-to-end pipeline:

``` text
RAW BUSINESS DATA
       ↓
MODULE 1 — GOVERNED KPI
       ↓
MODULE 2 — SIGNAL
       ↓
MODULE 3 — HYPOTHESIS
       ↓
MODULE 4 — EVIDENCE + RAG
       ↓
MODULE 5 — STORY + ACTION
       ↓
MODULE 6 — TRUST + GOVERNANCE
       ↓
MODULE 7 — DECISION WORKSPACE
```

The responsibility boundary is deliberately explicit:

  Module     Question answered
  ---------- -------------------------------------------------
  Module 1   **What happened?**
  Module 2   **Is it meaningful?**
  Module 3   **What might explain it?**
  Module 4   **What evidence supports or contradicts it?**
  Module 5   **How should we explain and act on it?**
  Module 6   **Can we trust, audit, and learn from it?**
  Module 7   **How does the user interact with the result?**

This separation prevents generative AI from becoming the source of
quantitative truth.

------------------------------------------------------------------------

## Core Workflow

### 1. WHAT --- Governed KPI Intelligence

TRACE computes governed KPIs from structured business data and
maintains:

-   KPI definitions
-   semantic contracts
-   calculation logic
-   dimensions
-   historical observations
-   data quality
-   freshness
-   lineage

The KPI layer is deterministic and acts as the quantitative source of
truth.

### 2. SIGNAL --- Material Movement Detection

The signal engine evaluates whether a KPI movement is meaningful using:

-   historical baselines
-   period-over-period analysis
-   statistical significance
-   business materiality
-   seasonality
-   volatility
-   anomaly detection
-   signal confidence
-   prioritization

### 3. WHY --- Driver and Hypothesis Analysis

TRACE decomposes material KPI movements into candidate explanatory
drivers.

Example:

``` text
Revenue ↓ 9.9%

├── AOV decline       → 54%
├── Order decline     → 28%
├── Product mix       → 12%
└── Other             → 6%
```

Candidate explanations are represented as explicit hypotheses rather
than unsupported AI statements.

### 4. EVIDENCE --- Retrieval and Verification

For every important hypothesis, TRACE retrieves relevant evidence from
structured and unstructured sources.

``` text
EvidenceRequest
      ↓
Query Builder
      ↓
Structured + Keyword + Vector Retrieval
      ↓
Hybrid Retrieval
      ↓
Reranking
      ↓
Evidence Scoring
      ↓
Support / Contradict / Neutral
      ↓
Confidence Update
      ↓
Provenance
      ↓
Evidence Graph
```

### 5. SO WHAT --- Decision Intelligence

The final intelligence layer combines:

``` text
KPI
+ Signal
+ Drivers
+ Evidence
+ Confidence
+ Persona
+ Business Rules
```

and produces:

-   executive summaries
-   analytical explanations
-   uncertainty
-   evidence citations
-   recommended actions
-   monitoring plans
-   decision context

------------------------------------------------------------------------

## Architecture

``` text
┌───────────────────────────────────────────────────────────────┐
│                           TRACE                               │
│                                                               │
│  BUSINESS DATA                                                │
│  CSV / Excel / Structured Data / Documents / Knowledge       │
│                         │                                     │
│                         ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ MODULE 1 — GOVERNED KPI                                 │  │
│  │ Schema → Validation → Normalization → Semantics         │  │
│  │ → Calculation → History → Freshness → Lineage           │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ MODULE 2 — SIGNAL ENGINE                                │  │
│  │ Baseline → Significance → Materiality → Anomaly         │  │
│  │ → Prioritization → Confidence                            │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ MODULE 3 — DRIVER / HYPOTHESIS ENGINE                   │  │
│  │ Decomposition → Drivers → Hypotheses → Ranking          │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ MODULE 4 — EVIDENCE + RAG                               │  │
│  │ Structured + Keyword + Vector → Hybrid → Rerank         │  │
│  │ → Evidence Score → Contradiction → Provenance           │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ MODULE 5 — STORY + ACTION                                │  │
│  │ WHAT → WHY → EVIDENCE → UNCERTAINTY → SO WHAT           │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ MODULE 6 — TRUST + GOVERNANCE                            │  │
│  │ Feedback → Audit → Confidence → Decision Memory         │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ MODULE 7 — DECISION WORKSPACE                            │  │
│  │ Dashboard → Evidence → Graph → Story → Action           │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

## Functional Modules

### Module 1 --- Governed KPI Layer

Module 1 establishes quantitative truth.

Capabilities:

-   user data onboarding
-   business data modelling
-   schema inference
-   column mapping
-   validation
-   profiling
-   data-quality assessment
-   normalization
-   synthetic data generation
-   SQLite persistence
-   KPI semantic contracts
-   KPI calculation engine
-   historical KPI layer
-   data freshness
-   KPI lineage
-   KPI API

A semantic contract explicitly defines correct KPI aggregation. For
example:

``` text
AOV = Total Revenue / Total Orders
```

rather than summing or averaging regional AOV values.

### Module 2 --- Signal Engine

The signal engine determines whether a movement deserves investigation.

Capabilities:

-   historical baseline
-   period-over-period analysis
-   statistical significance
-   business materiality
-   seasonality
-   volatility
-   anomaly detection
-   signal prioritization
-   signal confidence
-   signal classification
-   signal API

Detection is intentionally separated from root-cause explanation.

### Module 3 --- Driver / Hypothesis Engine

Capabilities:

-   driver decomposition
-   contribution analysis
-   candidate hypothesis generation
-   driver ranking
-   multi-factor analysis
-   business-context filtering
-   hypothesis confidence
-   evidence-request generation

Example structured output:

``` json
{
  "metric": "Revenue",
  "movement": -9.88,
  "hypotheses": [
    {
      "driver": "AOV decline",
      "contribution": 54,
      "confidence": 0.87
    },
    {
      "driver": "Order decline",
      "contribution": 28,
      "confidence": 0.79
    }
  ]
}
```

------------------------------------------------------------------------

## KPI Intelligence

TRACE treats KPIs as governed business definitions rather than arbitrary
dashboard calculations.

A KPI definition contains its:

-   business meaning
-   formula
-   dimensions
-   thresholds
-   historical context
-   lineage
-   access constraints
-   freshness metadata

The KPI layer produces clean historical observations for downstream
analysis.

This is important because incorrect aggregation can create incorrect
conclusions. TRACE therefore keeps quantitative computation outside the
LLM.

------------------------------------------------------------------------

## Evidence and RAG

TRACE treats retrieval as an analytical verification layer, not simply a
chatbot feature.

### Structured retrieval

Used for:

-   KPI values
-   transactions
-   dates
-   regions
-   products
-   operational metrics
-   business dimensions

### Keyword retrieval

Useful for exact business terminology, identifiers, names, and phrases.

### Vector retrieval

Useful for semantic matching across:

-   reports
-   operational documents
-   customer feedback
-   internal knowledge
-   business notes
-   contextual documents

### Hybrid retrieval

Multiple retrieval channels are combined before reranking.

### Evidence scoring

Each retrieved item is evaluated against the active hypothesis.

  Classification      Meaning
  ------------------- -----------------------------------------
  **Supporting**      Strengthens the hypothesis
  **Contradictory**   Weakens or challenges it
  **Neutral**         Relevant but not directionally decisive

### Provenance

Evidence records preserve:

-   source
-   document
-   chunk
-   retrieval method
-   timestamp
-   model

This creates a traceable chain from insight to source.

------------------------------------------------------------------------

## Evidence Graph

TRACE represents an investigation as a graph:

``` text
                    ┌─────────────┐
                    │     KPI     │
                    │  Revenue ↓  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   SIGNAL    │
                    │  Material   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ AOV ↓    │ │ Orders ↓ │ │ Mix      │
        │ Driver   │ │ Driver   │ │ Driver   │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Evidence │ │ Evidence │ │ Evidence │
        │ Support  │ │ Support  │ │ Neutral  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └────────────┼────────────┘
                          ▼
                   ┌─────────────┐
                   │ Confidence  │
                   └──────┬──────┘
                          ▼
                   ┌─────────────┐
                   │   Action    │
                   └─────────────┘
```

Users can move from:

**KPI → Signal → Hypothesis → Evidence → Confidence → Decision**

rather than receiving an opaque AI-generated answer.

------------------------------------------------------------------------

## AI and LLM Design

TRACE uses AI where it adds value and deterministic computation where
correctness matters.

### Deterministic layer

Used for:

-   KPI calculations
-   aggregation
-   historical baselines
-   statistical analysis
-   contribution analysis
-   materiality
-   signal scoring
-   evidence scoring
-   provenance
-   lineage

### LLM layer

Used for:

-   intent understanding
-   contextual synthesis
-   natural-language narratives
-   persona adaptation
-   evidence summarization
-   uncertainty explanation
-   recommendation phrasing
-   decision-context interpretation

The LLM receives a verified context package rather than unrestricted raw
database access:

``` text
Verified Analytics
       +
Verified Evidence
       +
Confidence
       +
Business Rules
       ↓
      LLM
       ↓
Persona-specific narrative
```

The LLM must not:

-   calculate authoritative KPI values
-   invent contribution percentages
-   fabricate evidence
-   invent sources
-   override evidence confidence
-   make unsupported causal claims
-   fabricate expected financial impact

This architecture follows the challenge's explicit requirement to
distinguish deterministic logic, SQL, business rules, statistics, ML,
retrieval, and LLM processing. fileciteturn558file1L4-L5

------------------------------------------------------------------------

## Persona-Aware Intelligence

Different decision-makers require different levels of detail.

TRACE supports configurable personas including:

-   Executive
-   Analyst
-   Regional Manager
-   Finance Manager
-   Operations Manager
-   Marketing Manager

### Executive

Prioritizes:

-   concise insight
-   business impact
-   decision
-   risk
-   high-value action

Example:

``` text
Revenue declined 9.9% in North, primarily driven by
lower AOV.

Evidence confidence: High.

Recommended:
Review pricing and product mix.

Risk:
If the trend persists, monthly revenue may remain
below target.
```

### Analyst

Prioritizes:

-   driver decomposition
-   contribution
-   evidence
-   contradictions
-   data gaps
-   methodology
-   confidence
-   lineage

Example:

``` text
Revenue declined 9.9%.

Driver decomposition:
AOV       -54%
Orders    -28%
Mix       -12%

Evidence:
Inventory report — supports
Pricing report — supports
Support tickets — supports
Operations report — partial contradiction

Confidence: 86%

Method:
Contribution analysis + hybrid evidence retrieval
```

The underlying analytical truth remains shared. Persona configuration
changes presentation and decision focus.

------------------------------------------------------------------------

## Recommendations

TRACE converts analytical findings into structured actions:

``` text
Driver
   ↓
Controllable Lever
   ↓
Action
   ↓
Expected Impact
   ↓
Owner
   ↓
Confidence
   ↓
Monitoring Plan
```

Recommendations are constrained by:

-   evidence
-   confidence
-   business rules
-   decision rights
-   available data
-   identified uncertainty

The goal is not to produce generic suggestions, but to connect a
recommendation to the investigation that justified it.

------------------------------------------------------------------------

## Trust and Governance

TRACE treats trust as part of the product rather than an afterthought.

### Confidence

Confidence reflects the quality and consistency of the analytical and
evidence chain.

### Contradiction handling

Conflicting evidence is explicitly surfaced.

### Abstention

When evidence is insufficient, sparse, stale, or contradictory, TRACE
communicates uncertainty rather than forcing an unsupported conclusion.

### Freshness

Source freshness is visible so users can distinguish current evidence
from stale information.

### Lineage

Metrics and evidence can be traced back to their underlying sources.

### Audit trail

An investigation can be represented as:

``` text
Input
→ KPI
→ Signal
→ Hypothesis
→ Evidence
→ Confidence
→ Narrative
→ Recommendation
→ Decision
→ Feedback
```

### Feedback loop

User feedback supports:

-   correction
-   validation
-   overrides
-   evaluation
-   continuous improvement
-   decision memory

------------------------------------------------------------------------

## Data Sources

TRACE is designed for heterogeneous business information.

### Structured

-   CSV
-   Excel
-   tabular business datasets
-   transaction data
-   KPI data
-   operational metrics

### Unstructured

-   business reports
-   text documents
-   operational notes
-   customer feedback
-   internal knowledge

### Metadata

TRACE maintains contextual information such as:

-   source
-   document
-   timestamp
-   business dimension
-   retrieval method
-   lineage
-   freshness

The challenge specifically emphasizes multiple sources with different
grains and refresh cadences, inconsistent KPI definitions, business
rules, security, evidence, confidence, and lineage.
fileciteturn558file1L4-L5

------------------------------------------------------------------------

## Technology Stack

  -----------------------------------------------------------------------
  Layer                               Technology
  ----------------------------------- -----------------------------------
  Frontend                            Next.js, React, TypeScript

  Visualization                       Recharts, React Flow

  Application                         Next.js server architecture,
                                      Node.js

  Structured persistence              SQLite

  Analytics                           Statistical analysis, contribution
                                      analysis, anomaly detection

  Retrieval                           Structured + keyword + vector
                                      hybrid retrieval

  AI                                  LLM-based synthesis and narrative
                                      generation

  Testing                             Jest, Supertest

  Graph                               React Flow / graph-based evidence
                                      representation
  -----------------------------------------------------------------------

The prototype architecture uses **Next.js + TypeScript + SQLite**, with
Recharts, React Flow, Jest, Supertest, and the modular server-side
analytical layers defined by the TRACE architecture.

------------------------------------------------------------------------

## Getting Started

### Prerequisites

-   Node.js 18+
-   npm

Verify:

``` bash
node --version
npm --version
```

### Clone

``` bash
git clone https://github.com/mobashshir-ubn-zainuddin/TRACE_IITKHARAGPUR.git
cd TRACE_IITKHARAGPUR
```

### Enter the application

``` bash
cd trace-app
```

### Install dependencies

``` bash
npm install
```

### Configure environment

Create the local environment file:

``` bash
cp .env.example .env.local
```

Configure the required application and AI-provider variables.

### Initialize the database

``` bash
npm run db:init
```

If database initialization is integrated into startup, this step is
handled automatically.

### Start development

``` bash
npm run dev
```

Open:

``` text
http://localhost:3000
```

------------------------------------------------------------------------

## Testing

Run the test suite:

``` bash
npm test
```

Run coverage when supported:

``` bash
npm run test:coverage
```

Tests cover the core analytical and application behaviour, including:

-   KPI correctness
-   aggregation
-   signal calculations
-   driver decomposition
-   evidence scoring
-   contradiction handling
-   sparse evidence
-   no-evidence scenarios
-   wrong-region / wrong-period retrieval
-   provenance
-   API behaviour

------------------------------------------------------------------------

## Example Investigation

Suppose:

``` text
Revenue
North Region
Month-over-month
↓ 9.9%
```

### Step 1 --- Signal

``` text
Revenue movement: -9.9%
Materiality: High
Signal confidence: 0.91
```

### Step 2 --- Drivers

``` text
AOV decline       54%
Order decline     28%
Product mix       12%
Other              6%
```

### Step 3 --- Hypotheses

``` text
H1: Pricing / AOV deterioration
H2: Lower order volume
H3: Product mix shift
```

### Step 4 --- Evidence

``` text
Pricing report
Inventory report
Transaction data
Customer support records
Operations report
```

### Step 5 --- Evidence evaluation

``` text
H1
├── Pricing report       SUPPORT
├── Transaction data     SUPPORT
└── Operations report   PARTIAL CONTRADICTION

H2
├── Transaction data     SUPPORT
└── Regional demand     SUPPORT

H3
└── Product mix data     SUPPORT
```

### Step 6 --- Confidence

``` text
Primary hypothesis:
AOV decline

Evidence confidence:
86%
```

### Step 7 --- Decision intelligence

``` text
Revenue declined 9.9% in North, primarily driven by
lower AOV.

Evidence confidence is high.

Recommended action:
Review pricing and product mix.

Monitoring:
Track AOV, order volume, and product-level mix in the
next reporting cycle.
```

The user can inspect the evidence graph and trace the recommendation
back through the driver and evidence chain.

------------------------------------------------------------------------

## Design Principles

### 1. Quantitative truth is deterministic

The LLM does not own KPI calculations.

### 2. Explanation must be evidence-backed

A plausible explanation is not automatically a verified explanation.

### 3. Contradictions are first-class information

Conflicting evidence is surfaced instead of hidden.

### 4. Confidence is explicit

Important inferences carry uncertainty.

### 5. Abstention is a feature

When evidence is insufficient, TRACE can refuse to overstate the
conclusion.

### 6. Provenance is mandatory

Insights should be traceable to their analytical and information
sources.

### 7. Persona changes presentation, not truth

Different users can receive different narratives from the same verified
analytical foundation.

### 8. LLMs synthesize; analytical systems calculate

Generative AI is deliberately separated from quantitative computation.

### 9. Every recommendation has a reasoning chain

``` text
KPI
→ Signal
→ Driver
→ Evidence
→ Confidence
→ Action
```

### 10. Humans remain decision-makers

TRACE is a decision-support system, not a replacement for accountable
business judgment.

------------------------------------------------------------------------

## Business Value

### Faster investigation

Automates the first-pass investigation analysts perform across multiple
systems.

### Better explainability

Major conclusions are connected to supporting evidence and provenance.

### Lower hallucination risk

The LLM receives verified analytical context rather than unrestricted
raw business data.

### Better decision quality

Recommendations are grounded in quantified drivers, evidence,
uncertainty, and business context.

### Analyst productivity

Analysts spend less time collecting evidence and more time validating
decisions and acting on high-value questions.

### Cross-functional applicability

The framework can support:

-   sales
-   finance
-   marketing
-   supply chain
-   operations
-   customer experience
-   product analytics

------------------------------------------------------------------------

## Scalability

### Prototype

``` text
Next.js
+
SQLite
+
Hybrid Retrieval
+
LLM
```

### Production evolution

``` text
Enterprise Data Sources
        ↓
Warehouse / Data Platform
        ↓
Semantic + KPI Layer
        ↓
Signal Engine
        ↓
Driver Engine
        ↓
Enterprise Search / Vector Store
        ↓
Evidence Graph
        ↓
LLM Orchestration
        ↓
Decision Workspace
```

The architecture allows individual layers to scale independently.

Potential production extensions include:

-   PostgreSQL or warehouse-backed persistence
-   enterprise data connectors
-   row/column/domain-level security
-   distributed vector retrieval
-   model routing
-   caching
-   asynchronous insight generation
-   observability
-   model and data drift monitoring
-   cost telemetry
-   role-based access control
-   enterprise identity integration
-   scheduled KPI refresh
-   proactive alerts
-   decision memory
-   continuous evaluation

The challenge explicitly calls for realistic consideration of security,
cost, latency, scalability, model/data drift, feedback and LLM
economics. fileciteturn558file1L4-L5

------------------------------------------------------------------------

## Challenge Alignment

  Round 2 requirement               TRACE capability
  --------------------------------- -----------------------------------
  Detect material KPI movements     Signal Engine
  Reconcile heterogeneous sources   Data onboarding + semantic layer
  Identify explanatory drivers      Driver / Hypothesis Engine
  Rank drivers                      Contribution + confidence scoring
  Persona-specific narratives       Persona-aware Story Engine
  Traceable evidence                Hybrid RAG + provenance
  Contradictory evidence            Evidence classification
  Uncertainty                       Confidence + abstention
  Practical actions                 Recommendation Engine
  Feedback mechanism                Governance + feedback loop
  Security and auditability         Governance layer
  LLM/non-LLM separation            Explicit architecture
  Source freshness                  Freshness metadata
  Analytical lineage                KPI and evidence lineage
  Decision workspace                Dashboard + investigation + graph

The design directly addresses the BusinessIntelligence.ai track's Round
2 objective: detect and prioritize material KPI movements, reconcile
heterogeneous sources, rank explanatory drivers, generate
evidence-backed persona-specific narratives, communicate uncertainty,
recommend actions, and learn from business-user feedback.
fileciteturn558file1L4-L5

------------------------------------------------------------------------

## End-to-End TRACE

``` text
                    ┌──────────────┐
                    │  BUSINESS    │
                    │     DATA     │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ GOVERNED KPI │
                    └──────┬───────┘
                           │
                        WHAT?
                           │
                           ▼
                    ┌──────────────┐
                    │    SIGNAL    │
                    └──────┬───────┘
                           │
                     MATERIAL?
                           │
                           ▼
                    ┌──────────────┐
                    │  HYPOTHESIS  │
                    └──────┬───────┘
                           │
                         WHY?
                           │
                           ▼
                    ┌──────────────┐
                    │   EVIDENCE   │
                    └──────┬───────┘
                           │
                   SUPPORT / CONTRADICT
                           │
                           ▼
                    ┌──────────────┐
                    │  CONFIDENCE  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    STORY     │
                    └──────┬───────┘
                           │
                        SO WHAT?
                           │
                           ▼
                    ┌──────────────┐
                    │    ACTION    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   FEEDBACK   │
                    └──────────────┘
```

> **TRACE turns a KPI movement into an auditable investigation and a
> decision.**

------------------------------------------------------------------------

## Team

### Team TRACE --- IIT Kharagpur

  Member                     Role
  -------------------------- -------------
  **Mobashshir Zainuddin**   Team Leader
  **Eisa Shaiju**            Team Member
  **Aadil Mulani**           Team Member

**Institution:** IIT Kharagpur\
**Stream:** Engineering\
**Graduation:** 2028

------------------------------------------------------------------------

## Repository

``` text
https://github.com/mobashshir-ubn-zainuddin/TRACE_IITKHARAGPUR
```

------------------------------------------------------------------------

## Final Statement

TRACE is built around a simple proposition:

> **A business does not need another dashboard that tells it what
> happened. It needs an intelligence layer that can investigate why,
> show the evidence, communicate uncertainty, and help decide what to do
> next.**

# TRACE --- From Signal to Decision.
