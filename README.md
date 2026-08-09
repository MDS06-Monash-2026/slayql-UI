<div align="center">
  <h1>✨ SlayQL</h1>
  <p><strong>Scalable Schema Exploration & Value-Grounded Text-to-SQL</strong></p>
</div>

<br />

SlayQL is an advanced, agentic Text-to-SQL framework designed for graph-based schema reasoning and value grounding. This repository contains the **interactive frontend prototype**, built with **React**, **Vite**, and **Tailwind CSS v4**, serving as a product-prototype landing page and interactive mock workspace to demonstrate the reasoning trace end-to-end.

> **Note**: This is a frontend-only mock. Query execution, reasoning traces, and database connections are simulated via timed state machines and static datasets found in `src/mock/mockData.js`. It is not wired to the actual SlayQL Python pipeline.

---

## 🌟 Key Features & Interactive States

### 🧠 Agentic Reasoning Trace
Running a query in the natural language workspace steps through a simulated version of the SlayQL pipeline:
1. **Dense Retrieval** (BGE-Large) over candidate schema columns
2. **Relevance-Based Propagation (RBP)** across the foreign-key graph
3. **BM25 Value Grounding** of string literals to columns
4. **SQL Generation** under a strict output contract (QOC)
5. **Execution & Selection** via pairwise consistency

### 📊 Benchmark & Ablation Data
Static figures derived from our evaluation artifacts on **Spider 2.0-Lite**:
- **40.45% Execution Accuracy** (72/178)
- Detailed leave-one-out component ablations for RBP, BM25, IT-EE, and QOC

### 🔌 Database Connection Simulator
Interactive mock connections for **SQLite**, **BigQuery**, and **Snowflake** — the dialects supported by our evaluation suite.

---

## 🚀 Getting Started

Follow these instructions to run the frontend locally:

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/dcdc-png/SlayQL.git

# Navigate into the project directory
cd SlayQL

# Install dependencies
npm install
```

### Development
```bash
# Launch the local development server
npm run dev
```

### Production Build
```bash
# Build the app for production
npm run build

# Preview the production build
npm run preview
```

---

## 📁 Project Structure

```
SlayQL/
├── index.html                    # Entry point HTML
├── vite.config.js                # Vite configuration
└── src/
    ├── main.jsx                  # React mount point
    ├── App.jsx                   # Global router & state
    ├── index.css                 # Tailwind v4 styling overrides
    ├── mock/                     # Mock datasets & static assets
    ├── views/                    # Main application views (Landing, Dashboard, etc.)
    └── components/               # Reusable UI components
```

---

## 📚 Related Work

This frontend showcases the **SlayQL** research project, which builds upon and extends the AutoLink baseline:

> Wang, Z., Zheng, Y., Cao, Z., Zhang, X., Wei, Z., Fu, P., Luo, Z., Chen, W., & Bai, X. (2025). *AutoLink: Autonomous Schema Exploration and Expansion for Scalable Schema Linking in Text-to-SQL at Scale.* [arXiv:2511.17190](https://arxiv.org/abs/2511.17190)
