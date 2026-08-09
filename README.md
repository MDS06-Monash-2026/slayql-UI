<div align="center">
  <h1>✨ SlayQL</h1>
  <p><strong>Scalable Schema Exploration & Value-Grounded Text-to-SQL</strong></p>
</div>

<br />

SlayQL is an advanced, agentic Text-to-SQL framework designed for graph-based schema reasoning and value grounding. This repository contains the **interactive frontend prototype**, built with **React**, **Vite**, and **Tailwind CSS v4**, serving as a product-prototype landing page and interactive mock workspace to demonstrate the reasoning trace end-to-end.

> **Note**: This is a frontend-only mock. Query execution, reasoning traces, and database connections are simulated via timed state machines and static datasets found in `src/mock/mockData.js`. It is not wired to the actual SlayQL Python pipeline.

---

## 📁 Directory & Component Architecture

```
SlayQL/
├── index.html                    # Entry point HTML container
├── package.json                  # Scripts and node dependency definitions
├── vite.config.js                # Vite configuration with React & Tailwind v4
└── src/
    ├── main.jsx                  # React 19 StrictMode mount point
    ├── App.jsx                   # Global router and state synchronizer
    ├── index.css                 # Custom Tailwind v4 styling overrides & animations
    ├── mock/
    │   └── mockData.js           # Example queries, reasoning trace, benchmark & ablation figures
    ├── views/
    │   ├── LandingView.jsx       # Research/product landing page view container
    │   ├── OnboardingView.jsx    # Database connection wizard (mock)
    │   └── DashboardView.jsx     # Workspace shell with sidebars
    └── components/
        ├── Navbar.jsx            # Sticky glassmorphism navigation
        ├── Hero.jsx               # Animated typing preview of an agentic reasoning trace
        ├── ChatWorkspace.jsx      # Natural language workspace: retrieval → RBP → BM25 → SQL/table/chart
        ├── ProblemSection.jsx     # Why dense-retrieval-only Text-to-SQL fails
        ├── ArchitectureSection.jsx# The 8-stage SlayQL pipeline
        ├── BentoGrid.jsx          # Capability grid (schema exploration, value grounding, etc.)
        ├── BenchmarkSection.jsx   # Spider 2.0-Lite execution accuracy results
        ├── AblationSection.jsx    # Leave-one-out component ablation results
        ├── DatabaseConnectors.jsx # SQLite / BigQuery / Snowflake connection simulator
        ├── AboutSection.jsx       # Project & team attribution
        ├── RightSidebar.jsx       # Dashboard schema catalog & metrics panel
        └── Footer.jsx             # GitHub / paper / documentation links
```

---

## 🌟 Core Interactive Mock States

### 1. Agentic Reasoning Trace
Running a query in `ChatWorkspace` steps through a simulated version of the SlayQL pipeline:
1. **Dense Retrieval** (BGE-Large) over candidate schema columns
2. **Relevance-Based Propagation (RBP)** across the foreign-key graph
3. **BM25 Value Grounding** of string literals to columns
4. **SQL Generation** under a strict output contract (QOC)
5. **Execution & Selection** via pairwise consistency

Each step reveals a corresponding mock panel — a retrieved schema tree, a graph propagation chain, and a value-grounding hint — before showing the generated SQL, a data table, and a chart.

### 2. Example Queries
Three example prompts, grounded in the Spider 2.0-Lite public BigQuery datasets used in the project's case studies:
* Monthly IoT-related patent filings (`patents-public-data.patents.publications`)
* Hottest dates for a given weather station (`bigquery-public-data.noaa_gsod`)
* Multi-hop join reasoning across patent metadata tables

### 3. Benchmark & Ablation Sections
Static figures pulled from the project's evaluation artifacts (`run/comparison_report.md`, ablation `eval_result.txt` summaries): **40.45% execution accuracy** (72/178) on Spider 2.0-Lite, and leave-one-out component ablations for RBP, BM25, IT-EE, and QOC.

### 4. Database Connection Simulator
Renders SQLite (local), BigQuery, and Snowflake connectors — the dialects actually supported by the evaluation suite. Clicking "Connect" opens a mock credential form and indexing sequence.

---

## 🚀 Getting Started & Local Server

### Prerequisites
- Node.js (v18+)
- npm or yarn

### 1. Install Dependencies
```bash
git clone https://github.com/dcdc-png/SlayQL.git
cd SlayQL
npm install
```

### 2. Launch Local Development Server
```bash
npm run dev
```

### 3. Build for Production
```bash
npm run build
```
This generates files inside the `/dist` output directory.

### 4. Preview Production Build
```bash
npm run preview
```

---

## 📚 Related Work

This frontend showcases the **SlayQL** research project, which builds upon and extends the AutoLink baseline:

> Wang, Z., Zheng, Y., Cao, Z., Zhang, X., Wei, Z., Fu, P., Luo, Z., Chen, W., & Bai, X. (2025). *AutoLink: Autonomous Schema Exploration and Expansion for Scalable Schema Linking in Text-to-SQL at Scale.* [arXiv:2511.17190](https://arxiv.org/abs/2511.17190)
