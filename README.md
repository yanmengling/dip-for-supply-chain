# DIP for Supply Chain

[English](README.md) | [中文](README.zh.md)

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**DIP for Supply Chain** is a DIP-based supply chain decision intelligence system. Built with React + TypeScript + Vite, its core supply chain knowledge network runs on **KWeaver AI Data Platform (ADP)**, and its Agents run on **KWeaver Decision Agent**. Before running this application, please ensure you have deployed the relevant [KWeaver](https://github.com/kweaver-ai/kweaver/) modules.

## Quick Links

- [Quick Start](#quick-start)
- [System Architecture](#system-architecture)
- [Feature Modules](#feature-modules)
- [Development Guide](#development-guide)
- [License](LICENSE) - Apache 2.0 License
- [Report Issues](https://github.com/kweaver-ai/dip-for-supply-chain/issues)
- [Feature Requests](https://github.com/kweaver-ai/dip-for-supply-chain/issues)

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- DIP Platform running (see [KWeaver](https://github.com/kweaver-ai/kweaver/))

### Setup

**1. Configure environment variables**

Copy `.env.example` to `.env.local` and fill in your ADP configuration:

```bash
cp .env.example .env.local
```

Set the following in `.env.local`:

```ini
VITE_AGENT_API_BASE_URL=your_adp_base_url
VITE_AGENT_APP_KEY=your_app_key
VITE_AGENT_API_TOKEN=your_api_token
```

**2. Install dependencies and start**

```bash
npm install
npm run dev
```

The frontend server will run on `http://127.0.0.1:5173`.

## Directory Structure

```
dip-for-supply-chain/
├── src/                        # Frontend source code
│   ├── components/             # React components (feature modules)
│   │   ├── planningV2/         # Dynamic Planning Coordination (core module)
│   │   │   ├── gantt/          # Gantt chart components
│   │   │   └── multiProduct/   # Multi-product monitoring tasks
│   │   ├── cockpit/            # Dashboard/cockpit
│   │   ├── product-supply-optimization/  # Product supply optimization
│   │   ├── mps/                # Master Production Schedule
│   │   ├── supplier-evaluation/ # Supplier evaluation
│   │   ├── agents/             # AI agent integration components
│   │   ├── config-backend/     # Configuration management backend
│   │   ├── shared/             # Shared components (AI assistant, etc.)
│   │   └── views/              # Page views (routing)
│   ├── services/               # Business logic layer
│   ├── api/                    # HTTP client and API wrappers
│   ├── types/                  # TypeScript type definitions
│   ├── hooks/                  # React custom hooks
│   ├── utils/                  # Utility functions
│   ├── config/                 # Configuration files
│   └── i18n/                   # Internationalization
├── backend/                    # Backend service (Python)
├── buildkit/                   # DIP application packaging toolkit
└── public/                     # Static assets
```

## System Architecture

**DIP for Supply Chain** is an upper-layer decision intelligence application built on the KWeaver ecosystem:

1. **DIP (Decision Intelligence Platform)** — Manages the lifecycle, installation, and runtime environment of intelligent applications

2. **DIP Studio** — Centralized account management and user authentication

3. **AI Data Platform (ADP)** — Unified data foundation: multi-source data ingestion, Business Knowledge Network (Ontology), and metric models

4. **Decision Agent** — Configuration, orchestration, and lifecycle management of intelligent agents

5. **DIP for Supply Chain (this application)** — Supply chain application providing visualization, prediction, and decision support

## Feature Modules

### Dashboard / Cockpit

Supply chain overview:
- Real-time KPI monitoring (inventory, orders, procurement)
- Risk alerts and anomaly detection
- AI analysis assistant

### Dynamic Planning Coordination (Core Module)

End-to-end planning coordination driven by forecast orders:

- **3-step task creation flow**: Select product → Confirm MRP data → Generate reverse-schedule Gantt chart
- **BOM reverse-schedule Gantt**: Traces material arrival deadlines layer-by-layer from delivery date, highlighting shortage risks
- **Material monitoring list**: Real-time view of each material's procurement status, PO delivery date, and risk alerts
- **Large forecast order (multi-product) monitoring**: Creates a unified monitoring task by forecast order (billno), displaying BOM timelines for all products in a single view with shared material consolidation
- **Daily monitoring report**: Auto-generated task status snapshots with Word document export
- **AI planning assistant**: Conversational access to material status and shortage recommendations

### Product Supply Optimization

Product-level supply chain analysis:
- Demand forecasting (multiple algorithms supported)
- BOM explosion and material readiness analysis
- Product supply status overview

### Inventory Optimization

- Inventory level monitoring and safety stock calculation
- **Slow-moving inventory reverse calculator**: Calculates producible finished goods combinations from existing slow-moving materials
- AI inventory optimization assistant

### Master Production Schedule (MPS)

- Production plan Gantt chart showing work order and capacity utilization timeline
- Multi-level plan linkage (Sales Plan → MPS → MRP)

### Order Delivery

- Order status tracking and delivery timeliness analysis
- AI delivery optimization assistant

### Supplier Evaluation

- Multi-dimensional evaluation framework with risk early warning
- AI supplier analysis assistant

### Configuration Management

- API connection settings
- Knowledge network and Agent configuration
- Navigation module enable/disable

## Agent API Integration

### Supported Agents

| Agent | Purpose |
|-------|---------|
| `supplier_evaluation_agent` | Supplier evaluation assistant |
| `inventory_optimization_agent` | Inventory optimization assistant |
| `product_supply_optimization_agent` | Product supply optimization assistant |
| `order_delivery_agent` | Order delivery assistant |
| `supply_chain_cockpit_agent` | Cockpit dashboard assistant |

### API Endpoints

- Chat: `POST /api/agent-app/v1/app/{app_key}/chat/completion`
- Sessions: `GET|POST|PUT|DELETE /api/agent-app/v1/app/{app_key}/conversations`

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.9.3 | Type safety |
| Vite | 7.2.4 | Build tool |
| Tailwind CSS | 4.1.17 | Styling |
| Ant Design | 6.3.1 | UI component library |
| Recharts | 3.5.0 | Data charts |
| ReactFlow | 11.11.4 | Flow/Gantt visualization |
| TanStack React Query | 5.90.19 | Data fetching and state management |
| vite-plugin-qiankun | 1.0.15 | Qiankun micro-app framework |
| @kweaver-ai/chatkit | 0.1.15 | KWeaver AI chat integration |
| docx | 9.5.1 | Word document export |
| lucide-react | 0.554.0 | Icon library |

### Build & Quality

- ESLint 9.39.1 (TypeScript + React plugins)
- Vitest 4.1.1 (unit testing)

## Development Guide

### Requirements

- Node.js 18+
- npm or yarn

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Code Standards

- TypeScript strict mode throughout
- Functional components + Hooks; event handlers named `handleXxx`
- All API calls via `httpClient`
- try-catch error handling with user-friendly messages

## User Mode (DIP Packaging)

The application can be packaged as a `.dip` file for installation via the DIP App Store:

```bash
cd buildkit
uv venv && source .venv/bin/activate  # Linux/Mac
# or .\.venv\Scripts\activate         # Windows

uv run scripts/build_package.py --arch=amd64   # AMD64
uv run scripts/build_package.py --arch=arm64   # ARM64
```

The package is located at `buildkit/.cache/<timestamp>/package/` and contains:
- `application.key` — Application identifier
- `manifest.yaml` — Application manifest
- `assets/` — Icons and resources
- `packages/` — Docker images and Helm charts
- `ontologies/` — Ontology definitions
- `agents/` — Agent configurations

## Frequently Asked Questions

**Q: API request failed**
- Check `VITE_AGENT_API_BASE_URL` and `VITE_AGENT_API_TOKEN` in `.env.local`
- Confirm the DIP platform is running and reachable

**Q: 401 Unauthorized**
- Token may have expired — obtain a new one and update `.env.local`
- Verify `VITE_AGENT_APP_KEY` is correct

**Q: 404 Not Found**
- Verify `VITE_AGENT_API_BASE_URL` path is correct

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

## Support

- **Issue Reporting**: [GitHub Issues](https://github.com/kweaver-ai/dip-for-supply-chain/issues)
- **License**: [Apache 2.0 License](LICENSE)

---

Built on [KWeaver Platform](https://github.com/kweaver-ai/kweaver/) — an open-source ecosystem for building Decision Intelligence AI applications.
