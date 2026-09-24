SlayQL reporting platform: Power BI integration and business-value implementation

Prepared 15 September 2026. This is a proposed implementation plan based on the local repository and current Microsoft documentation. It does not establish the state of the VPS deployment. It builds on the market research and pitch review in this folder; customer priorities still need validation through paid pilots.

**Product decision: extend the existing native studio, with Power BI as an optional integration.**

Customers starting without a BI platform can use SlayQL's own reports. Customers with useful Power BI reports should be able to retain that investment and access selected reports inside SlayQL. Deliver these paths sequentially: make one native management-report workflow reliable, and add Power BI when a real prospect needs it. If the first paying prospect already uses Power BI, reverse that delivery order.

The proposed commercial promise is: "Keep your current systems. Get your management reports faster, ask follow-up questions, and see which business issues need attention."

Embedding alone is a convenience feature. The stronger value is connecting the customer's actual systems, preserving agreed calculations, producing recurring reports, and helping people complete follow-up work. Power BI already offers Copilot analysis and report assistance, so generic chat cannot be assumed to differentiate SlayQL. [Microsoft's Copilot overview](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction).

**What the repository already supports**

| Evidence | Implication |
| --- | --- |
| `src/components/workbench/AIDashboardBuilder.jsx` renders report widgets, saves browser state, and exports JSON. | There is already a native browser report studio to extend. |
| `src/components/workbench/VegaWorkbenchChart.jsx` and installed Vega/Vega-Lite/Recharts packages. | Existing visual components can support the initial product; another chart engine is unnecessary for this scope. |
| `backend/app/workbench/report_agent.py` generates structured report layouts and validates supported widget/chart choices. | Extend a constrained report specification rather than allowing AI-generated executable HTML or JavaScript. |
| FastAPI report route in `backend/app/main.py`, SQL validation/execution, and connection ownership checks. | There is a useful backend foundation, but team permissions and reliable report runs need additional work. |
| `generatePowerBIReport` is an existing frontend function name. | The name describes the current custom report feature; it does not establish Microsoft Power BI integration. |

The current report builder caps supplied rows at 200. Its KPI display can choose a profile average, maximum, or first value. When no result is supplied, the backend can sample 50 rows from the first catalog table. These are useful preview mechanisms, but they do not guarantee a complete business metric. A query that already returns a correctly aggregated value can be valid; the problem is treating arbitrary preview statistics as authoritative totals.

The first reliability change should separate preview data from metric results. The server should execute an approved calculation over the full selected business scope, return its value and supporting context, and label any incomplete result. Browser-supplied rows should not become the authority for a saved management report.

**How actual Power BI embedding would work**

The standard integration keeps SlayQL on the existing VPS and displays reports delivered by Microsoft's Power BI service. This is not hosting the Power BI engine on the VPS. Microsoft provides an official React component for embedding reports and other Power BI items. [React integration](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/powerbi-client-react).

Two authentication models are relevant:

| Model | User experience | When to choose it |
| --- | --- | --- |
| Embed for your organization, also called user owns data | Employees sign in through Microsoft Entra ID and use their existing Power BI access. | A customer has a Microsoft tenant, licensed users, and existing internal reports. |
| Embed for your customers, also called app owns data | Users sign in to SlayQL; its server obtains scoped Power BI embedding credentials. | SlayQL supplies reporting to customers without requiring a separate Power BI login for each viewer. |

These are distinct authentication designs. A generated embed token belongs to the app-owns-data path; do not reuse that design blindly for delegated user authentication. [Microsoft embedding overview](https://learn.microsoft.com/en-us/power-bi/developer/embedded/embedded-analytics-power-bi).

For production app-owned embedding, budget eligible paid capacity separately from VPS and AI costs; embedded viewers do not require individual Power BI licences. Organization embedding generally requires the appropriate viewer licences, with qualifying capacity allowing free viewers. Below F64, Fabric capacity does not remove those per-viewer requirements. Human report publishing generally needs Pro or PPU. Confirm the customer's actual workspace, capacity, and author/viewer mix before quoting. [Capacity and licensing](https://learn.microsoft.com/en-us/power-bi/developer/embedded/embedded-capacity).

Proposed app-owned implementation sequence:

1. Agree which customer tenant/workspace owns the content and who operates and pays for it. Obtain the tenant administrator's setup, register an Entra application/service principal, and publish one approved report with its model. Establish source connectivity and refresh; private sources may need a gateway. [Gateway documentation](https://learn.microsoft.com/en-us/power-bi/connect-data/service-gateway-onprem).
2. Store the allowed tenant, workspace, report and model identifiers in server-side integration records. Keep application credentials server-side and encrypted. Derive the customer and permission scope from the authenticated SlayQL session.
3. Add `POST /api/v1/reports/{report_id}/embed-config`. Authorize that report, resolve its Microsoft identifiers, and return only the required browser configuration and expiry. Never accept a caller's asserted tenant, role, or arbitrary report identifier as authorization.
4. Obtain a short-lived embed token with the required report/model scope and effective identity when applicable. Define customer isolation and model row-level security explicitly. Renew tokens before expiry. [Token generation and isolation](https://learn.microsoft.com/en-us/power-bi/developer/embedded/generate-embed-token).
5. Add a `PowerBIReportView.jsx` wrapper using `powerbi-client-react` and `powerbi-client`. Handle loading, failures, token renewal, and navigation. The proposed component receives report ID, embed URL, access token, and the appropriate token type from the integration flow.
6. Add the SlayQL question panel beside the report. Synchronize supported filter and slicer context, display the selected period, and define which model questions are supported. Filters are presentation context; they are not a substitute for server/model access controls. [Report filter API](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/control-report-filters).

For existing licensed users, a secure embed can be a small initial demonstration, while the SDK supports richer interaction. Private customer reports should use authenticated embedding. Microsoft's Publish to web makes content publicly accessible and is unsuitable for those reports. [Publish to web behavior](https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-publish-to-web).

**Displaying a report, answering questions about it, and creating a report are separate capabilities.**

Embedding provides the visual experience. To answer "Why is this branch's margin lower?", SlayQL also needs permission to query the relevant model or an approved underlying data service, together with the same metric definition, reporting period, filters, and refresh state.

Power BI models commonly use DAX measures. The existing SQL generator cannot automatically reproduce them. Microsoft's Execute Queries API runs DAX and requires its tenant setting plus model read/build access. Its service-principal route does not support models with RLS or SSO enabled. An app-owned embed token therefore does not establish a usable backend query path. Validate a supported delegated-user or approved data-service approach for each customer; never bypass their restrictions to make the question panel work. Handle partial-result errors even when HTTP status is 200. [Execute Queries API](https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries).

For native reports, SQL should implement the customer's approved metrics. For Power BI reports, prefer their existing approved measures. If a customer explicitly chooses an underlying SQL calculation instead, reconcile and label its definition and freshness so that two different numbers are not presented as the same metric.

Power BI supports embedded report creation/editing/saving based on existing datasets and suitable permissions. That does not automatically convert SlayQL's current report JSON into a Power BI report or construct a correct model from arbitrary tables. Begin with an approved model and report templates; add authoring only for a demonstrated customer need. [Embedded report authoring](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/create-edit-report-embed-view).

There is no need to convert Power BI into HTML for this architecture. The embedded route displays Power BI inside SlayQL; the native route independently renders SlayQL reports using React and Vega. Export is another feature: Microsoft's asynchronous export API supports PDF, PPTX and PNG subject to eligible capacity and other restrictions, and PPU alone is insufficient for that API. [Power BI export API](https://learn.microsoft.com/en-us/power-bi/developer/embedded/export-to).

**Native studio design**

Use a durable report definition containing title, owner, access policy, layout, filters, widget types, approved metric references and versions. AI proposes this definition; the backend validates it; existing React/Vega components render it. Numerical calculations run in the query layer rather than in model-generated prose.

A proposed metric result contract is:

```json
{
  "metric_id": "net_sales",
  "definition_version": 3,
  "value": "125000.00",
  "currency": "MYR",
  "period": { "from": "2026-08-01", "to_exclusive": "2026-09-01" },
  "filters": { "branch_id": "branch_01" },
  "source_ref": "approved_sales_view",
  "data_as_of": "2026-09-01T02:00:00Z",
  "completeness": "complete"
}
```

This is an illustrative contract and synthetic value, not a current API response. Store exact monetary values appropriately; define timezone, tax/return treatment, source grain and aggregation. For example, overall gross margin generally needs the agreed ratio of aggregate gross profit to aggregate net sales, rather than averaging row percentages. Return source evidence and checks with each run.

Proposed implementation locations, to adapt to existing repository conventions:

| Location | Responsibility |
| --- | --- |
| `backend/app/reporting/metrics.py` | Approved definitions, SQL/model adapters, period/filter validation and full-scope aggregate execution. |
| `backend/app/reporting/reports.py` | Server-stored report definitions, versions, widgets, runs and access checks. |
| `backend/app/reporting/jobs.py` | Durable refresh/export jobs, retries, run history and stale-data status. |
| `backend/app/integrations/powerbi.py` | Microsoft authentication, allowed report resolution, embedding configuration and supported model queries. |
| `src/components/workbench/AIDashboardBuilder.jsx` | Metric-bound widgets, full/preview distinctions, server persistence and report controls. |
| `src/components/reports/PowerBIReportView.jsx` | Optional embedded-report presentation. |

The proposed reporting tables are `metric_definitions`, `report_definitions`, `report_versions`, `report_runs`, `report_schedules`, and `report_access`. Tie these to an explicit organization/membership model when enabling teams; current account ownership alone should not be represented as complete organization RBAC. Include organization and permission scope in query/cache keys. A durable scheduler should prevent duplicate jobs across workers.

Use one data-ready source first. Reports combining separate accounting, POS and warehouse systems require source mapping and a joining strategy, often a small reporting store. A database connection alone does not provide unified sales, receipts and stock semantics.

**Features customers can evaluate in business terms**

| Business promise | Implementation | Pilot evidence |
| --- | --- | --- |
| "Have the weekly management pack ready." | Saved sales, margin and receivables templates; approved metrics; refresh history; printable/PDF pack with period and source timestamps. | Total preparation, review and correction time; repeated use in the real meeting. |
| "See which overdue invoices need follow-up." | Reconcile invoices with receipts, credits and due dates; include disputed balances; create an owner-assigned follow-up list. | Follow-up coverage and time; collections outcomes assessed separately without assuming causation. |
| "See where stock is tying up money." | Map stock ledger, movement dates, unit cost, commitments and product groups; show agreed slow-moving definitions. | Value reviewed and resulting purchasing/clearance decisions. |
| "Spot where margin is slipping." | Agree net sales and cost treatment; compare branch/product/customer contribution; flag material changes with drill-through evidence. | Time to investigate; confirmed pricing, discount, return or cost issues. |
| "Get answers without waiting for a specialist." | English/Bahasa Malaysia business terms, synonyms, contextual follow-ups, explicit clarification and authorized SQL/model queries. | Correct-answer rate on real questions and time to an accepted answer. Language support requires testing. |
| "Keep the reporting knowledge when staff change." | Business glossary, approved join relationships, metric owners, calculation versions, source lineage and example questions. | Time to onboard another user and reproduce existing reports. |
| "Find stale or inconsistent numbers before a meeting." | Refresh checks, missing keys, duplicate joins, reconciliation rules and schema-change impact lists. | Detected issues and reduced corrections; no promise that metadata fixes source records. |
| "Turn an issue into assigned work." | Tasks in SlayQL with owner, due date, linked evidence and resolution status. | Completion rate and time to resolution. ERP writeback and external messaging are separate, explicitly configured extensions. |

The first four form a plausible distributor/wholesaler pilot, not a research-proven priority order for every Malaysian SME. A service business or an enterprise with an established BI team may choose a different workflow.

Local integration should target a named customer's exact AutoCount, SQL Account, POS or spreadsheet setup, with supported access, edition and data mappings established first. Generic SQL connectivity does not establish a working accounting connector. Malaysian conventions such as RM formatting, local dates and approved business terminology improve usability; their value should be evaluated alongside the actual reporting workflow.

The metadata idea should begin as an organized catalog beside the customer's systems: group tables by business area, suggest descriptions, have owners approve important definitions and relationships, and flag schema changes. This preserves reporting knowledge and improves query context without requiring automatic alterations to production tables. Backup, recovery, database tuning and source-system maintenance remain separate responsibilities.

**Delivery order and acceptance gates**

1. Choose one sponsor, one recurring report and a data-ready source. Record existing preparation/review time, approved totals, current tools and willingness to pay. Agree metric definitions and access before calling the report complete.
2. Replace preview-derived KPI behavior with full-scope metrics; add durable saved reports and team access where required. Verify reconciliation, date boundaries, returns/credits, join duplication and restricted users with representative data.
3. Deliver the recurring management pack with refresh status, supporting records and PDF/print output. Add a small set of contextual follow-up questions. A report should visibly show stale or partial data rather than silently presenting it as complete.
4. When a buyer needs Power BI, integrate one approved existing report. Validate licensing, identity, isolation and expiry behavior. Add model-aware questions only after proving that the customer's supported query path preserves access and calculation semantics.
5. Add exception alerts, tasks, and the next local connector according to observed usage. Add advanced report editing or forecasting only when customers demonstrate a need and suitable data is available.

Use source reconciliation and meaningful permission tests as release gates for implementation. For a Power BI pilot, also test denied access, token expiry, active filters and differing data freshness. These are proposed checks; this document does not claim they have run.

Measure time released separately from realized spending reductions. Earlier collections are a cash-timing benefit, not automatically new revenue. Quote software, onboarding, Microsoft capacity/licences where applicable, and recurring support transparently. The strongest pitch is a specific report and business workflow that the customer has seen work with their own approved numbers.
