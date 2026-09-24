# SlayQL Ultimate Report Skills

This design and composition contract is injected into the SlayQL AI Report Studio. It was synthesized from the 18 reference dashboards in `dashboard_examples/` and the Vega-Lite example gallery. The gallery covers bar, trend, distribution, layered, multi-view, map and interactive displays. [Vega-Lite example gallery](https://vega.github.io/vega-lite/examples/)

This file guides the planner and composer. It is not an authorization boundary. Backend schemas, approved metric definitions, chart registry rules, query validation, permissions and layout validators have final authority. Never emit HTML, CSS, JavaScript, SQL or arbitrary Vega-Lite expressions from the model.

## Product intent

Turn one business question into a complete management report:

```text
question → scope → approved metrics → evidence queries → insight topics
→ suitable visuals → narrative and actions → validated report → interactive rendering
```

The report must help a business user decide what to do. A visual is useful when it answers a specific question, exposes evidence, or supports an action. Do not add a chart only to make the page look busy.

There is no minimum chart count. Include only the charts the question and data justify, each with a distinct analytical purpose. A short report with three useful charts is better than a long one padded with decorative or repetitive visuals. If a useful chart cannot be built, say which field or data-shape requirement is missing.

Use Malaysian business context where the data supports it: MYR currency, local date conventions, Bahasa Malaysia synonyms, states and districts of Malaysia, branch and outlet operations, sales, margin, receivables, inventory and delivery performance. Never infer a Malaysian location from an arbitrary text field.

## Reference design language

The reference dashboards repeatedly use these patterns:

- A strong report title and short subtitle at the top.
- A single horizontal KPI row directly below the title or filter bar.
- A left sidebar for navigation, report pages or persistent filters when the report has several views.
- Top-level tabs or pills for Overview, Period, Region, Product, Channel and Financials.
- A visible date range control, year selector and reset-filters action.
- Large primary visual space for the main trend, performance comparison or business flow.
- Smaller supporting cards for distributions, composition, map context and exceptions.
- Tables with totals, percentages, status or expandable detail for evidence.
- Direct labels, trend annotations and comparison badges on important values.
- A restrained palette with one accent colour, one positive colour, one warning colour and one negative colour.
- Dark dashboards use high contrast and limited accent colours. Light dashboards use dark text, pale surfaces and restrained borders.
- Rounded cards and subtle shadows are allowed; excessive gradients, glow, decorative icons and dense borders reduce readability.

Use the references as a design system rather than copying a brand, logo, watermark or proprietary text.

## Typography and hierarchy

Typography must make the report readable before it looks decorative.

- Use one font family per report. Default to Inter or a close system sans-serif.
- Report title: 28–34px, weight 700; use 800 only for a short high-impact title.
- Report subtitle: 13–15px, weight 400–500, muted colour.
- Section heading: 15–18px, weight 650–700.
- Card title: 11–13px, weight 600; sentence case is preferred.
- KPI value: 26–36px, weight 650–700; never use a heavy display face that makes digits collide.
- KPI label: 10–12px, weight 500–600, readable contrast.
- Chart axis and legend: 10–12px, weight 400–500.
- Annotation label: 10–12px, weight 550–650, with a small opaque background when it overlaps marks.
- Table body: 11–13px, weight 400–500; table header 10–12px, weight 650.
- Narrative: 13–15px, line height 1.45–1.6, weight 400–500.
- Never use bold for every element. Bold indicates hierarchy, status or a key value.
- Do not use uppercase for long titles or narrative. Small uppercase labels are acceptable for metadata.
- Use tabular numerals for aligned financial values where supported.

## Page shell and templates

Every report uses a fixed shell rendered by React components. The AI chooses a template and fills slots; it does not invent a DOM tree.

```text
ReportShell
 ├── OptionalSidebar
 ├── ReportHeader
 │    ├── Title and subtitle
 │    ├── Page tabs
 │    └── Freshness / source status
 ├── FilterBar
 ├── KpiRow
 ├── MainGrid
 │    ├── PrimaryInsight
 │    ├── SupportingInsight
 │    ├── MapOrComposition
 │    └── ExceptionOrEvidenceTable
 └── ReportFooter
```

### Executive management

Use for a CEO, owner or management meeting.

```text
header → filters → one KPI row → primary trend/comparison → supporting breakdown
→ exceptions/evidence → concise actions
```

Rules:

- KPI row is one horizontal row on desktop and a wrapped or horizontally scrollable row on mobile.
- Use 3–6 KPI cards. Use fewer when data does not support them.
- Use one primary visual with `span: 2` and one supporting visual with `span: 1` in a three-column grid.
- Add a full-width exception table only when the question has actionable records.
- Keep the narrative to three short blocks: what changed, where, and what to investigate.

### Analytical investigation

Use for finance, operations or BI teams.

```text
header → filters → KPI row → comparison/trend → distribution/relationship
→ drill-through table → definitions and caveats
```

Use more supporting detail, but keep the primary finding visible above the fold.

### Story

Use when the request asks for an explanation or presentation.

```text
context → headline finding → annotated evidence → contributing breakdown
→ supporting records → recommended review action
```

Every story section must include a reference to its evidence result. Do not state an unproven cause as fact.

### Sidebar

Use a left sidebar when there are at least two report pages, a persistent filter set or clear navigation sections. It may contain a report mark, page navigation, active page state, user/organization context and compact export/help actions. Do not put primary KPIs or long explanations in the sidebar. Below 900px, collapse it into a drawer or top navigation.

## Grid, positioning and sizing

Use a 12-column conceptual grid mapped to the renderer’s permitted spans. The current renderer supports a three-column desktop layout, so convert positions to `full`, `wide` and `standard` slots rather than arbitrary pixels.

- `full`: 3/3 columns; tables, maps requiring space or a primary story visual.
- `wide`: 2/3 columns; main trend, waterfall or flow visual.
- `standard`: 1/3 column; supporting charts and KPI cards.

Rules:

- Keep a stable widget ID when an element is edited.
- Do not overlap cards or allow a widget to exceed its slot.
- Keep equal outer margins and consistent card padding.
- Use 16–24px page gutters and 12–20px card gaps.
- Keep charts at least 260px high unless they are sparklines.
- Keep tables full width with bounded height and pagination.
- For too many categories, use Top-K with an explicit `Others` bucket or a searchable table.
- Avoid more than eight widgets in one section.
- On mobile, stack filters, KPIs, primary finding, supporting evidence and table in that order.

The report validator must calculate grid positions and reject overflow before rendering.

## KPI cards

KPI cards always appear in one row before the main charts. A KPI references an approved metric result, never an arbitrary preview statistic.

Each KPI includes a human-readable label, exact value and unit, reporting period, optional comparison value and period, optional direction badge, freshness state, and a click action only when supporting records exist.

Use MYR formatting for Malaysian monetary metrics with consistent decimal rules. Distinguish `RM125,000` from `RM125k` deliberately. Never display a percentage without its denominator or definition.

Valid examples include net sales, gross profit, weighted gross margin, outstanding/overdue receivables, stock value, units sold and on-time delivery rate. Use a gauge only with an approved target range and clear status.

## Chart selection policy

Choose charts by analytical purpose, data shape and available space. The AI returns a registry ID and field bindings. The backend compiles that selection into Vega-Lite JSON.

```json
{
  "chart_id": "ranked_bar",
  "purpose": "compare_categories",
  "dimension": "branch",
  "measure": "net_sales",
  "sort": "descending",
  "limit": 10,
  "interactions": ["hover_tooltip", "click_filter"],
  "annotation": {"type": "top_value", "enabled": true}
}
```

The registry defines required field roles, compatible types, category limits, negative-value behavior, interactions, slot size, mobile behavior and a compiler name.

### Comparison

`bar`, `grouped_bar`, `lollipop`, `dot_plot`, `diverging_bar`, `radial_bar`, `bullet`.

- Use horizontal ranked bars for long labels.
- Use grouped bars for two or three comparable measures or periods.
- Use diverging bars for positive versus negative values around a meaningful zero.
- Use bullet charts only with an approved target and range.
- Avoid radial bars when precise comparison is important.

### Trend and change

`line`, `multi_line`, `step`, `slope`, `bump`, `area`, `stacked_area`, `streamgraph`, `horizon`, `sparkline`, `waterfall`.

- Use line charts for monthly, weekly or daily trends.
- Sort time chronologically, never alphabetically.
- Use multi-line only for a small number of series; otherwise use small multiples.
- Use slope graphs for two-period comparisons.
- Use bump charts for rank movement over time.
- Use waterfall for a bridge from starting value to ending value with validated positive and negative components.
- Add annotations for peaks, troughs, target crossings and material changes.

### Composition and hierarchy

`stacked_bar`, `normalized_bar`, `pie`, `donut`, `treemap`, `sunburst`, `circle_packing`, `mosaic`.

- Prefer sorted bars for precise comparison.
- Use donut or pie only for nonnegative parts of a whole and no more than six categories.
- Use treemap for many hierarchical categories when area comparison is acceptable.
- Label percentages with the denominator and selected period.
- Never use composition charts for unrelated metrics.

### Distribution and relationship

`histogram`, `density`, `boxplot`, `violin`, `strip`, `beeswarm`, `scatter`, `bubble`, `hexbin`, `connected_scatter`, `correlation_matrix`, `parallel_coordinates`.

- Use histogram or density for one numeric distribution.
- Use box plots for distributions by category with enough observations.
- Use scatter only when two numeric measures share the same observation grain.
- Use bubble size only for a meaningful third numeric measure and explain its scale.
- Use hexbin for dense scatter data.
- Do not write “causes” or “drives” from correlation alone.

### Pattern, table and multi-view

`heatmap`, `calendar_heatmap`, `small_multiples`, `table_heatmap`, `table_bubble`, `pivot_table`, `exception_table`, `overview_detail`.

- Use a heatmap for two dimensions and one comparable measure.
- Use calendar heatmaps only with a real date grain.
- Use small multiples for repeated comparisons with the same scale.
- Use a table for record-level, audit, invoice or operational-exception questions.
- Use overview/detail when selecting a mark updates a supporting table.

### Flow, schedule and geography

`funnel`, `sankey`, `chord`, `network`, `gantt`, `timeline`, `malaysia_state_map`, `malaysia_district_map`, `point_map`, `choropleth`.

- Use funnels only when stages are ordered and conversion is meaningful.
- Use Sankey or chord only when source, destination and flow measure are present.
- Use Gantt for start/end dates and a task or entity dimension.
- Use a map only when geography is recognized and a metric is available.
- Prefer a Malaysia state choropleth for state-level data and a point map for coordinates.
- Include a legend, missing-geography count and a table alternative.
- Never geocode or infer a location silently.

## Gallery-derived Vega-Lite capabilities

The public gallery contains reusable specifications for sorted/grouped/stacked/normalized/diverging bars; labels and overlays; histograms, density and cumulative distributions; scatter, strip, bubble and jitter plots; line, multi-series, monotone, step, slope, bump, rank-over-time and rolling-average displays; area, streamgraph and horizon displays; table heatmaps and bubble tables; circular plots; error bars and confidence bands; box plots; threshold and mean overlays; regression/LOESS with assumptions; faceting and concatenation; choropleths and geoshape overlays; hover/selection, legends, brushes, pan/zoom, search, minimaps, overview/detail, cross-filtering and cross-highlighting.

Store each capability as a registry entry or compiler recipe. Do not paste every example specification into the model prompt. A capability is production-ready only after its renderer, data contract and test fixture exist.

## Annotation and storytelling

Every primary chart should answer “what changed?” directly on the visual when a meaningful change exists.

Allowed annotation types: `latest_value`, `peak`, `trough`, `period_change`, `threshold`, `outlier`, `callout` and `benchmark`.

- Maximum three annotations per chart unless detail is requested.
- Never cover a mark with opaque text.
- Use a direct label or small callout with a connector line.
- Include units, period and comparison basis.
- Use colour plus text or icon; colour alone cannot convey status.
- Do not annotate a cause the data did not establish.
- If there is no meaningful change, omit decorative annotations.

Narrative structure:

1. Headline: one sentence describing observed movement.
2. Evidence: name the period, segment and values supporting it.
3. Implication: state what deserves review without claiming causality.
4. Action: suggest an owner or investigation only when evidence supports one.

## Filters and interactions

Interactions are declared in report JSON and implemented by approved React components. They never grant access to data.

- Date filters update every period-dependent widget.
- Category selections filter only compatible widgets.
- A slider declares whether it controls dates, a numeric threshold or a scenario parameter.
- Clicking a value may filter the report or open supporting records.
- Every interaction has a visible reset path.

Use date range, year, month, branch, state, product, customer, channel and status filters only when fields exist and are approved. Show active filters as removable chips.

```json
{
  "interaction": "date_range",
  "field": "transaction_date",
  "scope": "all_period_dependent_widgets",
  "default": "latest_complete_period",
  "reset": "report_default"
}
```

Brush dense time series or scatter plots. Add reset zoom or a minimap when needed. Preserve full-period KPI context while showing brushed detail. Drill-through must open the supporting result with applied scope visible.

## Report JSON contract

The composer returns a report document using approved templates and components:

```json
{
  "version": 2,
  "template": "executive",
  "title": "Monthly Sales Performance",
  "period": {"from": "2026-08-01", "to_exclusive": "2026-09-01"},
  "filters": [],
  "sections": [
    {
      "id": "kpis",
      "slot": "kpi_row",
      "widgets": [
        {"id": "kpi-net-sales", "component": "kpi_card", "metric_id": "net_sales", "definition_version": 3, "span": "standard"}
      ]
    },
    {
      "id": "performance",
      "slot": "main_grid",
      "widgets": [
        {
          "id": "sales-trend",
          "component": "trend_chart",
          "chart_id": "line",
          "chart_config": {"dimension": "month", "measure": "net_sales", "annotation": {"type": "period_change"}},
          "span": "wide"
        }
      ]
    }
  ],
  "narrative": [],
  "data_as_of": "2026-09-01T02:00:00Z"
}
```

Published reports require template/version, stable widget IDs, approved metric ID/version, query/result reference, period and filters, freshness/completeness, access scope, chart ID and bindings, interactions and narrative evidence references.

## Editing rules

Edit through operations against the current report version:

- Rename a chart: change its title only.
- Change chart style: change the registry ID only when compatible with the same result.
- Change monthly to weekly: change aggregation, query plan, axis type and labels together.
- Make a chart wider: change its permitted slot size and reflow the grid.
- Add a filter: declare field, scope, default and reset behavior.
- Remove a widget: remove and reflow; never recreate it for variety.
- Change a metric: require the definition and affected widgets to be revalidated.
- Preserve unrelated widgets, filters, IDs and access policies.
- Save every accepted edit as a version and support undo.

## Validation gates

Before rendering or saving, validate template and required slots, unique IDs, allowlisted components/charts, authorized fields and metrics, chart field types/cardinality, ordered dates, full-scope KPI results, join grain, percentage denominators, negative-value handling, donut limits, recognized geography, interaction scope/reset, grid spans, text/legend/annotation fit, evidence-backed narrative and restricted-user results.

The language-model reviewer may identify unclear hierarchy or unsupported claims. Hard validation belongs in application code and returns a structured issue instead of silently changing the report.

## Forbidden behavior

- Do not output HTML, CSS, JavaScript, SQL or arbitrary Vega-Lite expressions.
- Do not invent metrics, fields, values, locations, targets or causes.
- Do not choose charts solely to create visual variety.
- Do not show a complete-total label when only preview rows were analyzed.
- Do not use colour as the only status indicator.
- Do not hide period, filters, source or freshness.
- Do not infer geography, joins or accounting treatment from names alone.
- Do not change permissions through a filter or visual interaction.
- Do not silently repair a failed report by adding unrelated widgets.
